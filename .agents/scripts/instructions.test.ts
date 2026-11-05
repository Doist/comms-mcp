// Instructions that name files or commands that don't exist send agents in circles. This checks
// every path, link and `npm run` script named in the agent-facing docs, and the skills' shape.

import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { git } from './lib/git.ts'
import { REPO_ROOT } from './lib/test-repo.ts'
import { AGENT_DOCS } from './lib/tree.ts'

const SKILLS_DIR = join(REPO_ROOT, '.agents/skills')
const skills = readdirSync(SKILLS_DIR).filter((name) => !name.startsWith('.'))

function markdownFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) return markdownFiles(path)
        return entry.name.endsWith('.md') ? [path] : []
    })
}

// The same docs verify treats as code, so a doc this test reads is never skipped as prose.
const DOCS = [
    ...[...AGENT_DOCS].map((path) => join(REPO_ROOT, path)),
    ...markdownFiles(join(REPO_ROOT, '.agents')),
]

// Files git knows about, committed or new, and still on disk: a deletion not yet staged is gone.
// New files count, since a change in progress names files it adds; CI sees them committed.
const listed = git(REPO_ROOT, ['ls-files', '--cached', '--others', '--exclude-standard'])
if (!listed.ok) throw new Error(`git ls-files failed: ${listed.stderr.trim()}`)
const tracked = listed.stdout
    .split('\n')
    .filter((path) => path && existsSync(join(REPO_ROOT, path)))
const trackedSet = new Set(tracked)
const scripts = Object.keys(
    (
        JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>
        }
    ).scripts,
)

const ROOTED = /^(src|tools|scripts|docs|\.agents|\.github|\.claude|\.codex|\.cursor)\//
const FILE_NAME = /^[\w.-]+\.(md|json|ts|tsx|js|cjs|mjs|sh|yml|yaml)$/
// A path relative to the document, like `references/test-rules.md` in a skill.
const RELATIVE_FILE = /^[\w.-]+(\/[\w.-]+)+\.(md|json|ts|tsx|js|cjs|mjs|sh|yml|yaml)$/
// Output and state that exist only after a build or run.
const GENERATED = /^(\.tmp|tmp|dist|node_modules)(\/|$)/
// MCP method names look like paths.
const NOT_PATHS = new Set(['tools/list', 'tools/call'])

type Reference = { path: string; line?: number }

/** Paths named in backticks, with an optional `:line`. Placeholders (`<tool>`, `*`) are skipped. */
function namedPaths(text: string): Reference[] {
    return [...text.matchAll(/`([^`\s]+)`/g)]
        .map((match) => match[1] ?? '')
        .filter((value) => !/[<>*{}]/.test(value) && !GENERATED.test(value))
        .map((value) => {
            const [, path = value, line] = value.match(/^(.*?):(\d+)$/) ?? []
            return { path, line: line ? Number(line) : undefined }
        })
        .filter(
            ({ path }) =>
                (ROOTED.test(path) && !NOT_PATHS.has(path)) ||
                FILE_NAME.test(path) ||
                RELATIVE_FILE.test(path),
        )
}

/**
 * Whether git tracks the path (or a file under it), spelled exactly so. existsSync alone would
 * accept `src/Tools/Reply.ts` on macOS, which ignores case, and fail only in CI.
 */
function isTracked(path: string): boolean {
    const clean = path.replace(/\/$/, '')
    return trackedSet.has(clean) || tracked.some((file) => file.startsWith(`${clean}/`))
}

/** The repository path a reference names, or why it doesn't resolve. */
function resolveReference(path: string, doc: string): string | { problem: string } {
    if (!ROOTED.test(path) && path.includes('/')) {
        const local = relative(REPO_ROOT, resolve(dirname(doc), path))
        if (isTracked(local)) return local
    }
    if (ROOTED.test(path) || path.includes('/') || existsSync(join(REPO_ROOT, path))) {
        return isTracked(path)
            ? path
            : { problem: 'is not a tracked path (check the spelling and case)' }
    }
    const matches = tracked.filter((candidate) => basename(candidate) === path)
    if (matches.length === 1) return matches[0] ?? path
    return {
        problem: matches.length === 0 ? 'does not exist' : `is ambiguous: ${matches.join(', ')}`,
    }
}

function brokenReferences(text: string, doc: string): string[] {
    return namedPaths(text).flatMap(({ path, line }) => {
        const resolved = resolveReference(path, doc)
        if (typeof resolved !== 'string') return [`${path} ${resolved.problem}`]
        if (line === undefined) return []
        const full = join(REPO_ROOT, resolved)
        if (lstatSync(full).isDirectory()) return [`${path}:${line} names a line in a folder`]
        // A file ending in a newline has no line after it.
        const lines = readFileSync(full, 'utf8').replace(/\n$/, '').split('\n').length
        if (line < 1) return [`${path}:${line} is not a line number (they start at 1)`]
        return line > lines ? [`${path}:${line} is past the end (${lines} lines)`] : []
    })
}

// Hyphenated names a doc may mention: skills, git hooks, lint rules, and any quoted string in
// src/ (tool names, fixtures). Anything else is most likely a skill that does not exist (yet).
const GIT_HOOKS = ['pre-commit', 'commit-msg', 'pre-push']
const sourceStrings = tracked
    .filter((path) => path.startsWith('src/') && path.endsWith('.ts'))
    .flatMap((path) =>
        [...readFileSync(join(REPO_ROOT, path), 'utf8').matchAll(/'([a-z]+(?:-[a-z]+)+)'/g)].map(
            (match) => match[1] ?? '',
        ),
    )
const lintConfig = JSON.parse(readFileSync(join(REPO_ROOT, '.oxlintrc.json'), 'utf8')) as {
    rules?: Record<string, unknown>
    overrides?: { rules?: Record<string, unknown> }[]
}
const lintRules = [lintConfig.rules, ...(lintConfig.overrides ?? []).map((o) => o.rules)].flatMap(
    (rules) => Object.keys(rules ?? {}),
)
const KNOWN_NAMES = new Set([...skills, ...GIT_HOOKS, ...sourceStrings, ...lintRules])

/** Backticked names in the bullet list under a heading. */
function listedUnder(text: string, heading: string): string[] {
    const section = text.split(heading)[1]?.split(/\n#{1,3} /)[0] ?? ''
    return [...section.matchAll(/^- `([\w-]+)`/gm)].map((match) => match[1] ?? '')
}

describe.each(DOCS.map((path) => [relative(REPO_ROOT, path), path]))('%s', (_name, path) => {
    const text = readFileSync(path, 'utf8')

    it('names only files and lines that exist', () => {
        expect(brokenReferences(text, path)).toEqual([])
    })

    it('links only to files that exist', () => {
        const links = [...text.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g)]
            .map((match) => match[1] ?? '')
            .filter((link) => !/^[a-z]+:/.test(link))
        // Case-exact, like the backticked paths: macOS would accept a wrong case that CI rejects.
        expect(
            links.filter((link) => !isTracked(relative(REPO_ROOT, resolve(dirname(path), link)))),
        ).toEqual([])
    })

    it('names only skills, tools, hooks and strings that exist', () => {
        const named = [...text.matchAll(/`([a-z]+(?:-[a-z]+)+)`/g)].map((match) => match[1] ?? '')
        expect(named.filter((name) => !KNOWN_NAMES.has(name))).toEqual([])
    })

    it('names only npm scripts that exist', () => {
        const named = [...text.matchAll(/npm run (?:--silent )?([\w:-]+)/g)].map((m) => m[1] ?? '')
        expect(named.filter((script) => !scripts.includes(script))).toEqual([])
    })
})

describe.each(skills)('skill %s', (skill) => {
    const file = join(SKILLS_DIR, skill, 'SKILL.md')
    const text = readFileSync(file, 'utf8')
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? ''

    it('has a name matching its folder and a description that says when to use it', () => {
        expect(frontmatter).toMatch(new RegExp(`^name: ${skill}$`, 'm'))
        const description = frontmatter.match(/^description: (.+)$/m)?.[1] ?? ''
        expect(description).toContain('Use when')
        expect(description.length).toBeLessThan(400)
    })

    it('is linked for Claude Code', () => {
        const link = join(REPO_ROOT, '.claude/skills', skill)
        expect(lstatSync(link).isSymbolicLink()).toBe(true)
        expect(resolve(dirname(link), readlinkSync(link))).toBe(join(SKILLS_DIR, skill))
    })
})

it('lists every skill in AGENTS.md, and only those', () => {
    const text = readFileSync(join(REPO_ROOT, 'AGENTS.md'), 'utf8')
    expect(listedUnder(text, '## Skills').toSorted()).toEqual(skills.toSorted())
})

it('lists every skill in the docs/agents.md skills table, and only those', () => {
    const text = readFileSync(join(REPO_ROOT, 'docs/agents.md'), 'utf8')
    const section = text.split('\n## Skills\n')[1]?.split('\n## ')[0] ?? ''
    const rows = [...section.matchAll(/^\| `([\w-]+)`/gm)].map((match) => match[1] ?? '')
    expect(rows.toSorted()).toEqual(skills.toSorted())
})

const helperSource = readFileSync(join(REPO_ROOT, 'src/utils/test-helpers.ts'), 'utf8')
const exportedHelpers = [
    ...helperSource.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm),
].map((match) => match[1])

it('names only test helpers that src/utils/test-helpers.ts exports', () => {
    const skill = readFileSync(join(SKILLS_DIR, 'write-tests/SKILL.md'), 'utf8')
    const section = skill.split('## Helpers')[1]?.split('\n## ')[0] ?? ''
    const named = [...section.matchAll(/`(\w+)`/g)].map((match) => match[1] ?? '')
    expect(named.length).toBeGreaterThan(5)
    expect(named.filter((name) => !exportedHelpers.includes(name))).toEqual([])
})

it('names only helpers that exist, wherever the write-tests skill mentions one', () => {
    const helperShaped = /^(createMock\w+|extract\w+Content|TEST_[A-Z_]+|TODAY|usersByIds)$/
    const texts = markdownFiles(join(SKILLS_DIR, 'write-tests')).map((path) =>
        readFileSync(path, 'utf8'),
    )
    const named = texts.flatMap((text) =>
        [...text.matchAll(/`(\w+)`/g)].map((match) => match[1] ?? ''),
    )
    expect(
        named.filter((name) => helperShaped.test(name) && !exportedHelpers.includes(name)),
    ).toEqual([])
})

it('tracks a Claude Code skill link for every skill, and no other', () => {
    // Tracked links only: a personal skill in .claude/skills stays local and ignored.
    const links = tracked
        .filter((path) => path.startsWith('.claude/skills/'))
        .map((path) => path.slice('.claude/skills/'.length))
    expect(links.toSorted()).toEqual(skills.toSorted())
})
