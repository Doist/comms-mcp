import { readFileSync } from 'node:fs'
import { TokenValidationError } from '@doist/mcp-core/host'
import { vi } from 'vitest'
import { validateCommsToken } from './validate-comms-token.js'

const packageVersion = (
    JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
        version: string
    }
).version

describe('validateCommsToken', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    function stubFetch(status: number) {
        const fn = vi.fn(async () => new Response(null, { status }))
        vi.stubGlobal('fetch', fn)
        return fn
    }

    function sentRequest(fn: ReturnType<typeof stubFetch>) {
        const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
        return {
            url,
            authorization: new Headers(init.headers).get('authorization'),
            signal: init.signal,
        }
    }

    test('asks the session endpoint with the bearer token, bounded by a timeout', async () => {
        const fn = stubFetch(200)

        await expect(validateCommsToken('tok', 'https://comms.test')).resolves.toBe('valid')
        expect(fn).toHaveBeenCalledTimes(1)
        expect(sentRequest(fn)).toEqual({
            url: 'https://comms.test/api/v1/users/get_session_user',
            authorization: 'Bearer tok',
            // validateBearerToken's 5 s AbortSignal.timeout, the bound this validator always had.
            signal: expect.any(AbortSignal),
        })
    })

    test('tags the request with the usage-tracking headers, as auth:validate-token', async () => {
        const fn = stubFetch(200)

        await validateCommsToken('tok', 'https://comms.test')
        const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
        const headers = new Headers(init.headers)
        expect({
            userAgent: headers.get('user-agent'),
            doistPlatform: headers.get('doist-platform'),
            doistVersion: headers.get('doist-version'),
            mcpTool: headers.get('mcp-tool'),
        }).toEqual({
            userAgent: `comms-mcp/${packageVersion}`,
            doistPlatform: 'mcp',
            doistVersion: packageVersion,
            mcpTool: 'auth:validate-token',
        })
    })

    test('defaults to the production base URL when none is given', async () => {
        const fn = stubFetch(200)

        await validateCommsToken('tok')
        expect(sentRequest(fn).url).toBe('https://comms.todoist.com/api/v1/users/get_session_user')
    })

    test.each([
        [401, 'invalid'],
        [403, 'forbidden'],
    ])('returns the verdict for a %i: %s', async (status, expected) => {
        stubFetch(status)
        await expect(validateCommsToken('tok', 'https://comms.test')).resolves.toBe(expected)
    })

    test('throws a TokenValidationError carrying the status on 5xx', async () => {
        stubFetch(503)
        const error = await validateCommsToken('tok', 'https://comms.test').catch(
            (thrown: unknown) => thrown,
        )

        expect(error).toBeInstanceOf(TokenValidationError)
        expect(error).toMatchObject({ httpStatusCode: 503 })
    })

    test('propagates fetch rejections (network/timeout) unchanged', async () => {
        const networkError = new Error('network down')
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError))

        await expect(validateCommsToken('tok', 'https://comms.test')).rejects.toBe(networkError)
    })
})
