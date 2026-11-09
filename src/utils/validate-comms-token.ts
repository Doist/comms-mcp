import { type TokenValidationResult, validateBearerToken } from '@doist/mcp-core/host'
import { buildUsageTrackingHeaders } from '../usage-tracking.js'

/** Production Comms API base URL, used when no explicit base is given. */
const DEFAULT_BASE_URL = 'https://comms.todoist.com'

/**
 * Validates a Comms API token with a status-only call to the session-user endpoint.
 *
 * Resolves `'valid'`, `'invalid'` (401) or `'forbidden'` (403), so a host can answer a
 * scope-deficient token with an RFC 6750 `insufficient_scope` challenge rather than a blanket
 * 401. The request carries the usage-tracking headers, as the tool `auth:validate-token`.
 *
 * @throws {TokenValidationError} (from `@doist/mcp-core/host`) for any other status, such as a
 * 5xx or a 404 from a misconfigured base URL, carrying it as `httpStatusCode`. Network and
 * timeout errors propagate unchanged.
 */
export function validateCommsToken(
    token: string,
    baseUrl: string = DEFAULT_BASE_URL,
): Promise<TokenValidationResult> {
    return validateBearerToken({
        url: `${baseUrl}/api/v1/users/get_session_user`,
        token,
        headers: buildUsageTrackingHeaders('auth:validate-token'),
    })
}
