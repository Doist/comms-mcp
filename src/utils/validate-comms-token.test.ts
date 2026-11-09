import { TokenValidationError } from '@doist/mcp-core/host'
import { vi } from 'vitest'
import { validateCommsToken } from './validate-comms-token.js'

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
        return { url, authorization: new Headers(init.headers).get('authorization') }
    }

    test('asks the session endpoint with the bearer token', async () => {
        const fn = stubFetch(200)

        await expect(validateCommsToken('tok', 'https://comms.test')).resolves.toBe('valid')
        expect(fn).toHaveBeenCalledTimes(1)
        expect(sentRequest(fn)).toEqual({
            url: 'https://comms.test/api/v1/users/get_session_user',
            authorization: 'Bearer tok',
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
