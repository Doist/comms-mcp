import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeJson } from './state.ts'
import {
    CI_ENV,
    CI_EQUIVALENTS,
    CI_NODE_VERSIONS,
    dropNonCiEnv,
    preflight,
    VERIFY_STEPS,
} from './steps.ts'
import { REPO_ROOT } from './test-repo.ts'

function ciWorkflow(): string {
    return readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')
}

/** The names of the jobs in ci.yml: keys indented one level under `jobs:`. */
function ciJobs(): string[] {
    const jobs = ciWorkflow().split('\njobs:\n')[1] ?? ''
    return [...jobs.matchAll(/^ {4}([\w-]+):\s*$/gm)].map((match) => match[1] ?? '')
}

/** The `test` job's text, up to the next job. */
function ciTestJob(): string {
    const workflow = ciWorkflow()
    const start = workflow.indexOf('\n    test:\n')
    expect(start).toBeGreaterThan(-1)
    const rest = workflow.slice(start + '\n    test:\n'.length)
    const next = rest.search(/^ {4}\S/m)
    return next === -1 ? rest : rest.slice(0, next)
}

// Single-line `run:` entries. A multi-line `run: |` shows up as `|` and fails the comparison
// below until verify learns it.
function ciTestJobCommands(): string[] {
    return [...ciTestJob().matchAll(/^\s+run: (.+)$/gm)].map((match) => match[1]?.trim() ?? '')
}

/** The `env:` block of the test job itself (eight spaces in), as name → value. */
function ciTestJobEnv(): Record<string, string> {
    const block = ciTestJob().match(/^ {8}env:\n((?: {12}.*\n|\s*\n)+)/m)?.[1] ?? ''
    return Object.fromEntries(
        [...block.matchAll(/^ {12}([\w]+):\s*(.+?)\s*$/gm)].map((match) => [
            match[1] ?? '',
            (match[2] ?? '').replace(/^['"]|['"]$/g, ''),
        ]),
    )
}

describe('verify covers CI', () => {
    it('knows every job in ci.yml', () => {
        expect(ciJobs()).toEqual(['test'])
    })

    it('names the Node versions CI runs', () => {
        const matrix = ciTestJob().match(/node-version: \[([^\]]*)\]/)?.[1] ?? ''
        expect(matrix.split(',').map((version) => Number(version.trim()))).toEqual(CI_NODE_VERSIONS)
    })

    it('sees every env block in the test job: none on single steps', () => {
        expect(ciTestJob().match(/^ {12,}env:/m)?.[0]).toBeUndefined()
    })

    it('runs the tests with the environment CI sets', () => {
        expect(ciTestJobEnv()).toEqual(CI_ENV)
        expect(VERIFY_STEPS.find((step) => step.name === 'tests')?.env).toEqual(CI_ENV)
    })

    it('has an equivalent for every command in the CI test job', () => {
        const commands = ciTestJobCommands()
        expect(commands.length).toBeGreaterThan(3)
        expect(commands.toSorted()).toEqual(CI_EQUIVALENTS.map((entry) => entry.run).toSorted())
    })

    it('runs the same commands as the package.json scripts CI calls', () => {
        const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
            scripts: Record<string, string>
        }
        // `npx tsc` and node_modules/.bin/tsc are the same command; a step run through `sh -c`
        // is compared by the command line the shell runs.
        function normalize(command: string): string {
            return command
                .trim()
                .replace(/^npx /, '')
                .replace(/^node_modules\/\.bin\//, '')
        }
        function stepCommand(name: string): string {
            const step = VERIFY_STEPS.find((candidate) => candidate.name === name)
            if (step?.command === 'sh' && step.args[0] === '-c')
                return normalize(step.args[1] ?? '')
            return normalize([basename(step?.command ?? ''), ...(step?.args ?? [])].join(' '))
        }
        for (const entry of CI_EQUIVALENTS) {
            const script = entry.run.match(/^npm run (\S+)$/)?.[1]
            if (!script) continue
            const commands = (pkg.scripts[script] ?? '').split('&&').map(normalize)
            expect({ script, commands }).toEqual({ script, commands: entry.steps.map(stepCommand) })
        }
    })

    it('names only steps that exist', () => {
        const names = VERIFY_STEPS.map((step) => step.name)
        for (const entry of CI_EQUIVALENTS) {
            for (const step of entry.steps) expect(names).toContain(step)
        }
        for (const step of VERIFY_STEPS) {
            if (step.after) expect(names).toContain(step.after)
        }
    })
})

describe('dropNonCiEnv', () => {
    it('removes the variables CI never sets, says so, and keeps the rest', () => {
        const env: NodeJS.ProcessEnv = {
            COMMS_API_KEY: 'x',
            USE_STRUCTURED_CONTENT: 'true',
            PATH: '/bin',
        }
        const lines: string[] = []
        dropNonCiEnv(env, (line) => lines.push(line))
        expect(env).toEqual({ PATH: '/bin' })
        expect(lines).toEqual([
            'Ignoring COMMS_API_KEY: CI does not set it.',
            'Ignoring USE_STRUCTURED_CONTENT: CI does not set it.',
        ])
    })
})

describe('preflight', () => {
    let root: string

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'agent-preflight-'))
        writeJson(join(root, 'package.json'), {
            engines: { node: '>=24' },
            dependencies: { zod: '1.0.0' },
            devDependencies: { vitest: '2.0.0' },
        })
        writeJson(join(root, 'package-lock.json'), {
            packages: {
                '': { dependencies: { zod: '1.0.0' }, devDependencies: { vitest: '2.0.0' } },
                'node_modules/zod': { version: '1.0.0' },
                'node_modules/vitest': { version: '2.0.0' },
            },
        })
        writeJson(join(root, 'node_modules/zod/package.json'), { version: '1.0.0' })
        writeJson(join(root, 'node_modules/vitest/package.json'), { version: '2.0.0' })
    })

    afterEach(() => rmSync(root, { recursive: true, force: true }))

    it('passes a current install on a supported Node', () => {
        expect(preflight(root, '24.0.0')).toEqual([])
    })

    it('rejects a Node older than package.json engines', () => {
        const [problem] = preflight(root, '22.22.2')
        expect(problem).toContain('Node 22.22.2 is older than the >=24')
    })

    it('names a dependency whose installed version differs from the lockfile', () => {
        writeJson(join(root, 'node_modules/zod/package.json'), { version: '0.9.0' })
        expect(preflight(root, '24.0.0')).toEqual([
            'node_modules does not match package-lock.json: zod 0.9.0 (lockfile: 1.0.0). Run `npm ci`.',
        ])
    })

    it('names a dependency that is not installed', () => {
        rmSync(join(root, 'node_modules/vitest'), { recursive: true })
        expect(preflight(root, '24.0.0')[0]).toContain('vitest missing (lockfile: 2.0.0)')
    })

    it('names a dependency package.json and the lockfile disagree on', () => {
        writeJson(join(root, 'package.json'), {
            engines: { node: '>=24' },
            dependencies: { zod: '1.1.0', added: '1.0.0' },
            devDependencies: { vitest: '2.0.0' },
        })
        expect(preflight(root, '24.0.0')).toEqual([
            'package.json and package-lock.json disagree: zod (package.json: 1.1.0, lockfile: 1.0.0), added (package.json: 1.0.0, lockfile: none). Run `npm install`.',
        ])
    })

    it('says when the lockfile is missing', () => {
        rmSync(join(root, 'package-lock.json'))
        expect(preflight(root, '24.0.0')).toEqual([
            'package-lock.json is missing or unreadable. Run `npm install`.',
        ])
    })

    it('names a transitive dependency npm installed at another version', () => {
        writeJson(join(root, 'package-lock.json'), {
            packages: {
                '': { dependencies: { zod: '1.0.0' }, devDependencies: { vitest: '2.0.0' } },
                'node_modules/zod': { version: '1.0.0' },
                'node_modules/vitest': { version: '2.0.0' },
                'node_modules/tinyspy': { version: '3.0.0' },
                'node_modules/@esbuild/win32-x64': { version: '0.1.0', optional: true },
            },
        })
        writeJson(join(root, 'node_modules/.package-lock.json'), {
            packages: {
                'node_modules/zod': { version: '1.0.0' },
                'node_modules/vitest': { version: '2.0.0' },
                'node_modules/tinyspy': { version: '2.9.0' },
            },
        })
        expect(preflight(root, '24.0.0')).toEqual([
            'node_modules does not match package-lock.json: tinyspy 2.9.0 (lockfile: 3.0.0). Run `npm ci`.',
        ])
    })

    it('says when package.json is missing', () => {
        rmSync(join(root, 'package.json'))
        expect(preflight(root, '24.0.0')).toEqual(['package.json is missing or unreadable.'])
    })

    it('says when node_modules is missing', () => {
        rmSync(join(root, 'node_modules'), { recursive: true })
        expect(preflight(root, '24.0.0')).toEqual(['node_modules is missing. Run `npm ci`.'])
    })
})
