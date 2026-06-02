import { createOAuthIntrospector } from '../oauth-introspection.js'

const NOW_MS = 1_800_000_000_000
const FUTURE_EXP = Math.floor(NOW_MS / 1_000) + 300

function createJsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    })
}

describe('OAuth token introspection', () => {
    it('posts a form-encoded token and caches valid Comms decisions', async () => {
        const fetchMock = jest.fn().mockResolvedValue(
            createJsonResponse({
                active: true,
                aud: 'comms',
                client_id: 'client-1',
                exp: FUTURE_EXP,
                scope: 'user:read comms:content:read',
            }),
        )
        const precheck = createOAuthIntrospector({
            apiKey: 'todoist-id-key',
            fetch: fetchMock,
            host: 'https://todoist-id.example.com/',
            now: () => NOW_MS,
        })

        await expect(precheck('oauth-token')).resolves.toMatchObject({
            kind: 'allow',
            clientId: 'client-1',
            scopes: ['user:read', 'comms:content:read'],
        })
        await expect(precheck('oauth-token')).resolves.toMatchObject({ kind: 'allow' })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit]
        expect(url).toBe('https://todoist-id.example.com/v1/oauth/introspect')
        expect(request.method).toBe('POST')
        expect(request.headers).toMatchObject({
            Accept: 'application/json',
            Authorization: 'Bearer todoist-id-key',
            'Content-Type': 'application/x-www-form-urlencoded',
        })
        expect(request.body).toBeInstanceOf(URLSearchParams)
        expect(String(request.body)).toBe('token=oauth-token')
    })

    it('refreshes cached decisions after the cache TTL', async () => {
        let nowMs = NOW_MS
        const fetchMock = jest.fn().mockImplementation(() =>
            createJsonResponse({
                active: true,
                aud: 'comms',
                exp: FUTURE_EXP,
                scope: 'user:read',
            }),
        )
        const precheck = createOAuthIntrospector({
            apiKey: 'todoist-id-key',
            fetch: fetchMock,
            host: 'https://todoist-id.example.com',
            now: () => nowMs,
            positiveCacheTtlMs: 1_000,
        })

        await expect(precheck('oauth-token')).resolves.toMatchObject({ kind: 'allow' })
        nowMs += 1_001
        await expect(precheck('oauth-token')).resolves.toMatchObject({ kind: 'allow' })

        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('denies inactive tokens', async () => {
        const precheck = createOAuthIntrospector({
            apiKey: 'todoist-id-key',
            fetch: jest.fn().mockResolvedValue(createJsonResponse({ active: false })),
            host: 'https://todoist-id.example.com',
            now: () => NOW_MS,
        })

        await expect(precheck('oauth-token')).resolves.toEqual({
            kind: 'deny',
            reason: 'inactive_token',
        })
    })

    it('denies tokens for other audiences', async () => {
        const precheck = createOAuthIntrospector({
            apiKey: 'todoist-id-key',
            fetch: jest.fn().mockResolvedValue(
                createJsonResponse({
                    active: true,
                    aud: 'todoist',
                    exp: FUTURE_EXP,
                    scope: 'user:read',
                }),
            ),
            host: 'https://todoist-id.example.com',
            now: () => NOW_MS,
        })

        await expect(precheck('oauth-token')).resolves.toEqual({
            kind: 'deny',
            reason: 'invalid_audience',
        })
    })

    it('denies active tokens without exp, with expired exp, or without scope', async () => {
        const withoutExp = createOAuthIntrospector({
            apiKey: 'todoist-id-key',
            fetch: jest.fn().mockResolvedValue(
                createJsonResponse({
                    active: true,
                    aud: 'comms',
                    scope: 'user:read',
                }),
            ),
            host: 'https://todoist-id.example.com',
            now: () => NOW_MS,
        })
        const expired = createOAuthIntrospector({
            apiKey: 'todoist-id-key',
            fetch: jest.fn().mockResolvedValue(
                createJsonResponse({
                    active: true,
                    aud: 'comms',
                    exp: Math.floor(NOW_MS / 1_000) - 1,
                    scope: 'user:read',
                }),
            ),
            host: 'https://todoist-id.example.com',
            now: () => NOW_MS,
        })
        const withoutScope = createOAuthIntrospector({
            apiKey: 'todoist-id-key',
            fetch: jest.fn().mockResolvedValue(
                createJsonResponse({
                    active: true,
                    aud: 'comms',
                    exp: FUTURE_EXP,
                }),
            ),
            host: 'https://todoist-id.example.com',
            now: () => NOW_MS,
        })

        await expect(withoutExp('oauth-token')).resolves.toEqual({
            kind: 'deny',
            reason: 'missing_exp',
        })
        await expect(expired('oauth-token')).resolves.toEqual({
            kind: 'deny',
            reason: 'expired_token',
        })
        await expect(withoutScope('oauth-token')).resolves.toEqual({
            kind: 'deny',
            reason: 'missing_scope',
        })
    })

    it('denies tokens when Todoist ID rejects the introspection request', async () => {
        const precheck = createOAuthIntrospector({
            apiKey: 'todoist-id-key',
            fetch: jest.fn().mockResolvedValue(createJsonResponse({ error: 'unauthorized' }, 401)),
            host: 'https://todoist-id.example.com',
            now: () => NOW_MS,
        })

        await expect(precheck('oauth-token')).resolves.toEqual({
            kind: 'deny',
            reason: 'introspection_rejected',
        })
    })

    it('defers to Comms when Todoist ID is unavailable', async () => {
        const serverErrorPrecheck = createOAuthIntrospector({
            apiKey: 'todoist-id-key',
            fetch: jest.fn().mockResolvedValue(createJsonResponse({ error: 'unavailable' }, 503)),
            host: 'https://todoist-id.example.com',
            now: () => NOW_MS,
        })
        const networkErrorPrecheck = createOAuthIntrospector({
            apiKey: 'todoist-id-key',
            fetch: jest.fn().mockRejectedValue(new Error('connection failed')),
            host: 'https://todoist-id.example.com',
            now: () => NOW_MS,
        })

        await expect(serverErrorPrecheck('oauth-token')).resolves.toEqual({
            kind: 'defer',
            reason: 'introspection_unavailable',
        })
        await expect(networkErrorPrecheck('oauth-token')).resolves.toEqual({
            kind: 'defer',
            reason: 'introspection_unavailable',
        })
    })
})
