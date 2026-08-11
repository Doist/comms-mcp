/**
 * Builds a `.catch` handler that logs the failure and resolves to `fallback`.
 *
 * Several tools deliberately degrade past a lookup they can live without — a
 * name they only needed for a label, a channel they can identify by ID. Swallowing
 * the rejection silently leaves a user who has left the workspace looking exactly
 * like a backend outage, so record what was dropped and why.
 *
 * @param toolName - The tool doing the lookup, for the log prefix.
 * @param message - What could not be resolved, e.g. 'failed to resolve channel creator'.
 * @param context - Identifiers worth having in the log, e.g. `{ workspaceId, userId }`.
 * @param fallback - The value to resolve to instead.
 */
export function degradeWithLog<T>(
    toolName: string,
    message: string,
    context: Record<string, unknown>,
    fallback: T,
): (error: unknown) => T {
    return (error: unknown) => {
        console.error(`${toolName}: ${message}`, { ...context, error })
        return fallback
    }
}
