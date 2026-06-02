import { createHash } from 'node:crypto'

const DEFAULT_INTROSPECTION_TIMEOUT_MS = 3_000
const DEFAULT_POSITIVE_CACHE_TTL_MS = 60_000
const CACHE_SWEEP_INTERVAL_MS = 60_000
const REQUIRED_AUDIENCE = 'comms'

type TodoistOAuthIntrospection = {
    active?: boolean
    scope?: unknown
    client_id?: unknown
    sub?: unknown
    user_id?: unknown
    app_id?: unknown
    aud?: unknown
    exp?: unknown
}

type OAuthIntrospectionOptions = {
    host: string
    apiKey: string
    timeoutMs?: number
    positiveCacheTtlMs?: number
    fetch?: typeof fetch
    now?: () => number
}

type OAuthTokenPrecheckDecision =
    | {
          kind: 'allow'
          clientId?: string
          expiresAt: number
          scopes: string[]
      }
    | { kind: 'deny'; reason: string }
    | { kind: 'defer'; reason: string }

type OAuthTokenPrechecker = (token: string) => Promise<OAuthTokenPrecheckDecision>

type CachedAllowDecision = Extract<OAuthTokenPrecheckDecision, { kind: 'allow' }>

function assertPositiveInteger(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${name} must be a positive integer`)
    }

    return value
}

function assertRequiredString(value: string, name: string): string {
    if (!value) throw new Error(`${name} is required`)

    return value
}

function getTokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

function parseScopes(scope: unknown): string[] {
    if (typeof scope !== 'string') return []

    return scope
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean)
}

function audienceIncludesComms(aud: unknown): boolean {
    if (Array.isArray(aud)) {
        return aud.includes(REQUIRED_AUDIENCE)
    }

    if (typeof aud === 'string') {
        return parseScopes(aud).includes(REQUIRED_AUDIENCE)
    }

    return false
}

function validateIntrospection(
    tokenInfo: TodoistOAuthIntrospection,
    nowMs: number,
): OAuthTokenPrecheckDecision {
    if (tokenInfo.active !== true) {
        return { kind: 'deny', reason: 'inactive_token' }
    }

    if (!audienceIncludesComms(tokenInfo.aud)) {
        return { kind: 'deny', reason: 'invalid_audience' }
    }

    const scopes = parseScopes(tokenInfo.scope)
    if (scopes.length === 0) {
        return { kind: 'deny', reason: 'missing_scope' }
    }

    if (typeof tokenInfo.exp !== 'number' || !Number.isFinite(tokenInfo.exp)) {
        return { kind: 'deny', reason: 'missing_exp' }
    }

    const expiresAtMs = tokenInfo.exp * 1_000
    if (expiresAtMs <= nowMs) {
        return { kind: 'deny', reason: 'expired_token' }
    }

    return {
        kind: 'allow',
        clientId: typeof tokenInfo.client_id === 'string' ? tokenInfo.client_id : undefined,
        expiresAt: tokenInfo.exp,
        scopes,
    }
}

async function readIntrospectionResponse(
    response: Response,
): Promise<TodoistOAuthIntrospection | null> {
    try {
        return (await response.json()) as TodoistOAuthIntrospection
    } catch {
        return null
    }
}

function createOAuthIntrospector(options: OAuthIntrospectionOptions): OAuthTokenPrechecker {
    const host = assertRequiredString(options.host, 'OAuth introspection host').replace(/\/+$/, '')
    const apiKey = assertRequiredString(options.apiKey, 'OAuth introspection API key')
    const timeoutMs = assertPositiveInteger(
        options.timeoutMs ?? DEFAULT_INTROSPECTION_TIMEOUT_MS,
        'TODOIST_ID_INTROSPECTION_TIMEOUT_MS',
    )
    const positiveCacheTtlMs = assertPositiveInteger(
        options.positiveCacheTtlMs ?? DEFAULT_POSITIVE_CACHE_TTL_MS,
        'TODOIST_ID_INTROSPECTION_CACHE_TTL_MS',
    )
    const fetchFn = options.fetch ?? fetch
    const now = options.now ?? Date.now
    const cache = new Map<string, { cacheExpiresAt: number; decision: CachedAllowDecision }>()
    let nextCacheSweepAt = 0

    return async (token: string): Promise<OAuthTokenPrecheckDecision> => {
        const cacheKey = getTokenHash(token)
        const nowMs = now()

        if (nowMs >= nextCacheSweepAt) {
            for (const [key, cached] of cache.entries()) {
                if (cached.cacheExpiresAt <= nowMs) {
                    cache.delete(key)
                }
            }
            nextCacheSweepAt = nowMs + CACHE_SWEEP_INTERVAL_MS
        }

        const cached = cache.get(cacheKey)
        if (cached && cached.cacheExpiresAt > nowMs) {
            return cached.decision
        }
        if (cached) cache.delete(cacheKey)

        let response: Response
        try {
            response = await fetchFn(`${host}/v1/oauth/introspect`, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({ token }),
                signal: AbortSignal.timeout(timeoutMs),
            })
        } catch {
            return { kind: 'defer', reason: 'introspection_unavailable' }
        }

        if (response.status >= 500) {
            return { kind: 'defer', reason: 'introspection_unavailable' }
        }
        if (response.status >= 400) {
            return { kind: 'deny', reason: 'introspection_rejected' }
        }

        const tokenInfo = await readIntrospectionResponse(response)
        if (!tokenInfo) {
            return { kind: 'deny', reason: 'invalid_introspection_response' }
        }

        const decision = validateIntrospection(tokenInfo, nowMs)
        if (decision.kind === 'allow') {
            const cacheExpiresAt = Math.min(decision.expiresAt * 1_000, nowMs + positiveCacheTtlMs)
            cache.set(cacheKey, { cacheExpiresAt, decision })
        }

        return decision
    }
}

export { createOAuthIntrospector }
export type { OAuthIntrospectionOptions, OAuthTokenPrecheckDecision, OAuthTokenPrechecker }
