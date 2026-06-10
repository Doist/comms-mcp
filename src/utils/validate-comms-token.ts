import { CommsRequestError } from '@doist/comms-sdk'

/** Production Comms API base URL, used when no explicit base is given. */
const DEFAULT_BASE_URL = 'https://comms.todoist.com'

/** How long to wait for the validation call before giving up. */
const VALIDATION_TIMEOUT_MS = 5_000

/**
 * Outcome of validating a Comms API token.
 *
 * - `valid`: the token is accepted.
 * - `invalid`: the token is missing, expired, or carries the wrong audience (401).
 * - `forbidden`: the token authenticates but lacks the required scopes (403).
 */
export type CommsTokenValidationResult = 'valid' | 'invalid' | 'forbidden'

/**
 * Validates a Comms API token with a lightweight, status-only call to the
 * session-user endpoint. The response body is discarded, so a valid token is
 * never misclassified because of a response-schema change.
 *
 * Unlike a plain boolean check, this distinguishes 401 (`invalid`) from 403
 * (`forbidden`) so callers can issue an RFC 6750 `insufficient_scope`
 * challenge for a scope-deficient token rather than a blanket 401.
 *
 * @param apiKey - The Comms API token to validate.
 * @param baseUrl - Optional Comms API base URL. Defaults to production.
 * @returns `'valid'`, `'invalid'` (401), or `'forbidden'` (403).
 * @throws {CommsRequestError} For any other/unexpected status — a 5xx, or e.g.
 * a 404 from a misconfigured base URL — carrying the status code so the caller
 * can decide how to react (for instance, treating 5xx as transient). Network
 * and timeout errors propagate unchanged.
 */
export async function validateCommsToken(
    apiKey: string,
    baseUrl: string = DEFAULT_BASE_URL,
): Promise<CommsTokenValidationResult> {
    const response = await fetch(`${baseUrl}/api/v1/users/get_session_user`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    })

    // Discard the body without decoding it — we only branch on the status —
    // while still releasing the socket back to undici's pool.
    await response.body?.cancel().catch(() => undefined)

    if (response.ok) {
        return 'valid'
    }
    if (response.status === 401) {
        return 'invalid'
    }
    if (response.status === 403) {
        return 'forbidden'
    }
    throw new CommsRequestError(
        `Comms token validation failed with status ${response.status}`,
        response.status,
    )
}
