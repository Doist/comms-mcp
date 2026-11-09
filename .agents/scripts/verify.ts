// `npm run verify`: every check CI runs on a pull request, in a few seconds.
// Records a fingerprint of the tree only when everything passed.

import { CHECKOUT_ROOT, branchBase, defaultBranchRef } from './lib/git.ts'
import { clearVerified } from './lib/state.ts'
import { BLIND_SPOTS, dropNonCiEnv, preflight, VERIFY_STEPS } from './lib/steps.ts'
import { runVerify } from './lib/verify.ts'

const root = CHECKOUT_ROOT

const problems = preflight(root)
if (problems.length > 0) {
    clearVerified(root)
    for (const problem of problems) console.log(`✗ ${problem}`)
    // exitCode, not exit(): on macOS a piped stdout is written asynchronously, and exit() could
    // cut off the lines an agent reads.
    process.exitCode = 1
} else {
    await main()
}

async function main(): Promise<void> {
    dropNonCiEnv(process.env, console.log)

    const ref = defaultBranchRef(root)
    const result = await runVerify({
        root,
        steps: VERIFY_STEPS,
        base: ref ? branchBase(root, ref) : undefined,
        baseName: ref?.replace(/^refs\/(remotes|heads)\//, '') ?? 'main',
    })

    if (result.recorded) {
        console.log('Not covered by these checks:')
        for (const spot of BLIND_SPOTS) console.log(`- ${spot}`)
    }
    process.exitCode = result.ok ? 0 : 1
}
