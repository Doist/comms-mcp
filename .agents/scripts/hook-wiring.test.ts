import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { git } from './lib/git.ts'
import { createTempRepo, REPO_ROOT, type RunResult, type TempRepo } from './lib/test-repo.ts'

// Runs the exact hook commands from each agent's config, the way the agent would, in a
// throwaway repo with a copy of the guard.
type HookConfig = { hooks: Record<string, { hooks: { command: string }[] }[]> }

const AGENTS = [
    {
        name: 'Claude Code',
        config: '.claude/settings.json',
        env: (dir: string) => ({ CLAUDE_PROJECT_DIR: dir }),
    },
    // Hostile git variables, as a hook may inherit: the command must unset them to find the
    // checkout.
    {
        name: 'Codex',
        config: '.codex/hooks.json',
        env: () => ({ GIT_DIR: '/nonexistent/.git', GIT_WORK_TREE: '/nonexistent' }),
    },
    // Cursor runs the Claude Code hooks. If it does not set CLAUDE_PROJECT_DIR, the command falls
    // back to the git root, which it must find past any git variables the hook inherits.
    {
        name: 'Claude Code hooks without CLAUDE_PROJECT_DIR, as Cursor may run them',
        config: '.claude/settings.json',
        env: () => ({
            CLAUDE_PROJECT_DIR: undefined,
            GIT_DIR: '/nonexistent/.git',
            GIT_WORK_TREE: '/nonexistent',
        }),
    },
]

function command(config: string, event: string): string {
    const parsed = JSON.parse(readFileSync(join(REPO_ROOT, config), 'utf8')) as HookConfig
    const commands = parsed.hooks[event]?.flatMap((entry) =>
        entry.hooks.map((hook) => hook.command),
    )
    expect(commands, `${config} ${event}`).toHaveLength(1)
    return commands?.[0] ?? ''
}

let repo: TempRepo

beforeEach(() => {
    repo = createTempRepo()
    repo.copyFromCheckout('.agents/scripts/guard.ts', '.agents/scripts/lib')
    repo.write('.gitignore', '.tmp/\n')
    repo.write('src/a.ts', 'export const a = 1\n')
    repo.git(['add', '.'])
    repo.git(['commit', '--quiet', '-m', 'initial'])
})

afterEach(() => repo.cleanup())

describe.each(AGENTS)('$name', ({ config, env }) => {
    function run(event: string): RunResult {
        return repo.run('sh', ['-c', command(config, event)], {
            cwd: join(repo.dir, 'src'),
            env: env(repo.dir),
            input: JSON.stringify({ session_id: 'wiring' }),
        })
    }

    it('sends the agent back after an unverified code change', () => {
        expect(run('UserPromptSubmit').status).toBe(0)
        repo.write('src/a.ts', 'export const a = 2\n')
        const stop = run('Stop')
        expect(stop.status).toBe(0)
        expect(JSON.parse(stop.stdout)).toMatchObject({ decision: 'block' })
    })

    it.each([
        ['UserPromptSubmit', 'turn-start'],
        ['Stop', 'turn-end'],
    ])('%s says so, and lets work continue, when node cannot run the guard', (event, step) => {
        // A node too old for type stripping exits 1 before the guard's own error handling runs.
        const bin = join(repo.dir, '.stubs')
        mkdirSync(bin, { recursive: true })
        writeFileSync(join(bin, 'node'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
        const result = repo.run('sh', ['-c', command(config, event)], {
            cwd: join(repo.dir, 'src'),
            env: { ...env(repo.dir), PATH: `${bin}:${process.env.PATH}` },
            input: JSON.stringify({ session_id: 'wiring' }),
        })
        expect(result.status).toBe(0)
        const message = JSON.parse(result.stdout).systemMessage
        expect(message).toContain('node could not run')
        expect(message).toContain(`${step} was skipped`)
    })

    it.each([
        ['UserPromptSubmit', 'turn-start'],
        ['Stop', 'turn-end'],
    ])('%s says so, and lets work continue, in a checkout without the guard', (event, step) => {
        rmSync(join(repo.dir, '.agents'), { recursive: true })
        const result = run(event)
        expect(result.status).toBe(0)
        const message = JSON.parse(result.stdout).systemMessage
        expect(message).toContain('has no .agents/scripts/guard.ts')
        expect(message).toContain(`${step} was skipped`)
    })
})

it('has no Cursor hooks file: Cursor runs the Claude Code hooks, and a second file runs them twice', () => {
    // Tracked only: a personal, untracked Cursor config is not this rule's business.
    expect(git(REPO_ROOT, ['ls-files', '--', '.cursor/hooks.json']).stdout).toBe('')
})
