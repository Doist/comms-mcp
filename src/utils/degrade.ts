/**
 * Several tools deliberately degrade past a lookup they can live without — a name
 * they only needed for a label, a channel they can identify by ID. Swallowing the
 * rejection silently leaves a user who has left the workspace looking exactly like
 * an expired token, so record what was dropped and why.
 */

/** Failed identifiers reported per batch before the rest are counted only. */
const SAMPLE_LIMIT = 5

type Runner = <T, R>(items: readonly T[], worker: (item: T) => Promise<R>) => Promise<R[]>

const runAll: Runner = (items, worker) => Promise.all(items.map(worker))

/**
 * Reduces an error to the fields worth logging. The error object can carry a
 * whole API response, and with it names and email addresses that have no place
 * in a log line.
 */
function describeError(error: unknown): { name?: string; message: string } {
    return error instanceof Error
        ? { name: error.name, message: error.message }
        : { message: String(error) }
}

/**
 * Resolves every id, degrading past individual failures to `null` and reporting
 * them as one log line per batch.
 *
 * A batch is as large as the caller's input — `get-users` takes an unbounded
 * `userIds` array — so one expired token must not become one log event per id.
 *
 * @param toolName - The tool doing the lookups, for the log prefix.
 * @param message - What could not be resolved, e.g. 'failed to resolve channel creator'.
 * @param ids - The identifiers to resolve.
 * @param resolve - Performs one lookup.
 * @param options.runner - How to run the batch. Defaults to `Promise.all`; pass
 * `limitedAll` at fan-out sites that need a concurrency ceiling.
 * @returns Each result in input order, with `null` where the lookup failed.
 */
export async function degradeAllWithLog<Id, T>(
    toolName: string,
    message: string,
    ids: readonly Id[],
    resolve: (id: Id) => Promise<T>,
    options: { runner?: Runner } = {},
): Promise<(T | null)[]> {
    const failures: Array<{ id: Id; error: unknown }> = []
    const run = options.runner ?? runAll

    const results = await run(ids, async (id) => {
        try {
            return await resolve(id)
        } catch (error) {
            failures.push({ id, error })
            return null
        }
    })

    const firstFailure = failures[0]
    if (firstFailure) {
        console.error(`${toolName}: ${message}`, {
            failed: failures.length,
            of: ids.length,
            sample: failures.slice(0, SAMPLE_LIMIT).map((failure) => failure.id),
            error: describeError(firstFailure.error),
        })
    }

    return results
}

/**
 * Builds a `.catch` handler that logs the failure and resolves to `fallback`.
 * For one-off lookups; use {@link degradeAllWithLog} for a batch, so a batch of
 * failures reports once rather than per id.
 *
 * @param toolName - The tool doing the lookup, for the log prefix.
 * @param message - What could not be resolved.
 * @param context - Identifiers worth having in the log, e.g. `{ workspaceId }`.
 * @param fallback - The value to resolve to instead.
 */
export function degradeWithLog<T>(
    toolName: string,
    message: string,
    context: Record<string, unknown>,
    fallback: T,
): (error: unknown) => T {
    return (error: unknown) => {
        console.error(`${toolName}: ${message}`, { ...context, error: describeError(error) })
        return fallback
    }
}
