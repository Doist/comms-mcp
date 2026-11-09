import { type TokenValidationResult, validateBearerToken } from '@doist/mcp-core/host'

/** Production Comms API base URL, used when no explicit base is given. */
const DEFAULT_BASE_URL = 'https://comms.todoist.com'

/**
 * Validates a Comms API token with a status-only call to the session-user endpoint.
 *
 * Resolves `'valid'`, `'invalid'` (401) or `'forbidden'` (403), so a host can answer a
 * scope-deficient token with an RFC 6750 `insufficient_scope` challenge rather than a blanket
 * 401.
 *
 * @throws {TokenValidationError} (from `@doist/mcp-core/host`) for any other status, such as a
 * 5xx or a 404 from a misconfigured base URL, carrying it as `httpStatusCode`. Network and
 * timeout errors propagate unchanged.
 */
export function validateCommsToken(
    token: string,
    baseUrl: string = DEFAULT_BASE_URL,
): Promise<TokenValidationResult> {
    return validateBearerToken({ url: `${baseUrl}/api/v1/users/get_session_user`, token })
}
