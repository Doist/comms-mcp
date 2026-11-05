import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readJson } from './state.ts'
import type { Step } from './verify.ts'

function bin(tool: string): string {
    return `node_modules/.bin/${tool}`
}

// The same environment CI's test job sets. NODE_ENV=test changes what the server returns
// (src/mcp-helpers.ts), so checks must run with it to match CI. steps.test.ts compares it
// with ci.yml.
export const CI_ENV = { NODE_ENV: 'test', CI: 'true' }

/** Every check `.github/workflows/ci.yml` runs on a pull request. */
export const VERIFY_STEPS: Step[] = [
    // A shell, because the script's `*.config.*` globs are expanded by the shell, not by oxlint.
    {
        name: 'lint',
        command: 'sh',
        args: ['-c', `${bin('oxlint')} src scripts .agents/scripts *.config.js *.config.ts`],
    },
    { name: 'format', command: bin('oxfmt'), args: ['--check'], readsDocs: true },
    { name: 'types', command: bin('tsc'), args: ['--noEmit'] },
    { name: 'types:tools', command: bin('tsc'), args: ['--noEmit', '-p', '.agents/scripts'] },
    { name: 'tests', command: bin('vitest'), args: ['run'], env: CI_ENV },
]

/**
 * How each `run:` in CI's test job maps to verify steps. For `npm run <script>`, the steps must
 * run the script's commands, in order; steps.test.ts compares them with package.json and ci.yml,
 * so CI and verify cannot drift apart silently.
 */
export const CI_EQUIVALENTS: { run: string; steps: string[] }[] = [
    { run: 'npm ci', steps: [] }, // the preflight checks node_modules matches the lockfile
    { run: 'npm run type-check', steps: ['types', 'types:tools'] },
    { run: 'npm run test', steps: ['tests'] },
    { run: 'npm run format:check', steps: ['lint', 'format'] },
]

/**
 * Variables CI never sets that change what the server does, so verify removes them: a pass with
 * them set would not be the pass CI gives. (todoist-mcp calls its list LOOSENING_ENV, for a
 * variable that loosens a test; nothing here does that.)
 */
export const NON_CI_ENV = [
    'COMMS_API_KEY',
    'COMMS_BASE_URL',
    'COMMS_CREATE_THREAD_DISPLAY_IN_INBOX',
    'USE_STRUCTURED_CONTENT',
]

/** Removes NON_CI_ENV from `env`, and says which ones it removed. */
export function dropNonCiEnv(env: NodeJS.ProcessEnv, out: (line: string) => void): void {
    for (const name of NON_CI_ENV) {
        if (env[name] === undefined) continue
        out(`Ignoring ${name}: CI does not set it.`)
        delete env[name]
    }
}

/** The Node versions CI's test matrix runs. steps.test.ts compares them with ci.yml. */
export const CI_NODE_VERSIONS = [24, 26]

type PackageJson = {
    engines?: { node?: string }
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
}
type Lockfile = {
    packages?: Record<
        string,
        {
            version?: string
            optional?: boolean
            dependencies?: Record<string, string>
            devDependencies?: Record<string, string>
        }
    >
}

/** Problems that would make the checks fail for reasons unrelated to the change. */
export function preflight(root: string, nodeVersion = process.versions.node): string[] {
    const problems: string[] = []
    const pkg = readJson<PackageJson>(join(root, 'package.json'))
    if (!pkg) return ['package.json is missing or unreadable.']
    const minimum = pkg?.engines?.node?.match(/^>=\s*(\d+)/)?.[1]
    const major = Number(nodeVersion.split('.')[0])
    if (minimum && major < Number(minimum)) {
        problems.push(
            `Node ${nodeVersion} is older than the ${pkg?.engines?.node} this repository needs. ` +
                'Switch versions (see .nvmrc) and run again.',
        )
    }

    if (!existsSync(join(root, 'node_modules'))) {
        problems.push('node_modules is missing. Run `npm ci`.')
        return problems
    }
    const lock = readJson<Lockfile>(join(root, 'package-lock.json'))
    if (!lock?.packages) {
        problems.push('package-lock.json is missing or unreadable. Run `npm install`.')
        return problems
    }
    // npm ci refuses to install when package.json and the lockfile disagree, so CI would fail
    // before any check runs.
    const manifest = lock.packages[''] ?? {}
    const disagree: string[] = []
    for (const field of ['dependencies', 'devDependencies'] as const) {
        const wanted = pkg?.[field] ?? {}
        const locked = manifest[field] ?? {}
        for (const name of new Set([...Object.keys(wanted), ...Object.keys(locked)])) {
            if (wanted[name] !== locked[name]) {
                disagree.push(
                    `${name} (package.json: ${wanted[name] ?? 'none'}, lockfile: ${locked[name] ?? 'none'})`,
                )
            }
        }
    }
    if (disagree.length > 0) {
        problems.push(
            `package.json and package-lock.json disagree: ${disagree.join(', ')}. Run \`npm install\`.`,
        )
        return problems
    }

    const stale: string[] = []
    for (const name of Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies })) {
        const locked = lock.packages[`node_modules/${name}`]?.version
        if (!locked) {
            stale.push(`${name} is not in the lockfile`)
            continue
        }
        const installed = readJson<{ version?: string }>(
            join(root, 'node_modules', name, 'package.json'),
        )?.version
        if (installed !== locked) {
            stale.push(`${name} ${installed ?? 'missing'} (lockfile: ${locked})`)
        }
    }
    // npm records what it installed in node_modules/.package-lock.json. Comparing it with the
    // lockfile also catches a lockfile-only update to a transitive or peer dependency.
    // Optional packages for other platforms are never installed, so their absence is fine.
    const installed = readJson<Lockfile>(join(root, 'node_modules/.package-lock.json'))?.packages
    if (stale.length === 0 && installed) {
        for (const [path, entry] of Object.entries(lock.packages)) {
            if (!path.startsWith('node_modules/')) continue
            const have = installed[path]?.version
            if (have === entry.version || (have === undefined && entry.optional)) continue
            stale.push(
                `${path.slice('node_modules/'.length)} ${have ?? 'missing'} (lockfile: ${entry.version})`,
            )
        }
    }
    if (stale.length > 0) {
        const shown = stale.length > 5 ? [...stale.slice(0, 5), `${stale.length - 5} more`] : stale
        problems.push(
            `node_modules does not match package-lock.json: ${shown.join(', ')}. Run \`npm ci\`.`,
        )
    }
    return problems
}

/** What verification cannot see, printed after every pass. */
export const BLIND_SPOTS = [
    'calls against the real Comms API (use `npm run tool`, on a test account)',
    'how models use tool descriptions and instructions',
    'the build (`npm run build`): CI does not run it, but `npm publish` does',
    `Node versions other than this one (${process.versions.node}); CI runs Node ${CI_NODE_VERSIONS.join(' and ')}`,
]
