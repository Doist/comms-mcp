/**
 * Several tools deliberately degrade past a lookup they can live without — a name
 * they only needed for a label, a channel they can identify by ID. Swallowing the
 * rejection silently leaves a user who has left the workspace looking exactly like
 * an expired token, so record what was dropped and why.
 */

/** Failed identifiers reported per batch before the rest are counted only. */
export const SAMPLE_LIMIT = 5

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

/**
 * Reports the items a batch tool could not act on, as one log line per call.
 *
 * Tools like mark-done and mark-read fold per-item errors into the tool result
 * instead of throwing, so without this the server answers 200 and logs nothing
 * while a caller's items stayed untouched — a whole batch can fail on an expired
 * token or a dropped connection with no trace on this side. Stays quiet when
 * there is nothing to report.
 *
 * Sample entries are logged as given, so pass only the fields worth having in
 * a log line.
 *
 * @param toolName - The tool that ran the batch, for the log prefix.
 * @param failed - Items the tool could not complete.
 * @param options.warnings - Items that completed but with a secondary op failing.
 * @param options.context - Extra attributes for the log line, e.g. `{ itemType }`.
 */
export function logOperationFailures(
    toolName: string,
    failed: ReadonlyArray<{ item: string; error: string }>,
    options: {
        warnings?: ReadonlyArray<{ item: string; op: string; error: string }>
        context?: Record<string, unknown>
    } = {},
): void {
    const { warnings = [], context = {} } = options
    if (failed.length === 0 && warnings.length === 0) {
        return
    }

    // The first error goes in the message itself. Datadog's full-text search
    // reaches the message but not the values nested inside `failedSample`, so a
    // search for the reason (`GOAWAY`, `401`) finds nothing without this.
    const firstError = (failed[0] ?? warnings[0])?.error

    console.error(`${toolName}: operations failed: ${firstError}`, {
        ...context,
        failed: failed.length,
        warnings: warnings.length,
        failedSample: failed.slice(0, SAMPLE_LIMIT),
        warningSample: warnings.slice(0, SAMPLE_LIMIT),
    })
}
