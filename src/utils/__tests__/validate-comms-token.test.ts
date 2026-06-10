import { CommsRequestError } from '@doist/comms-sdk'
import { validateCommsToken } from '../validate-comms-token.js'

describe('validateCommsToken', () => {
    const originalFetch = global.fetch

    afterEach(() => {
        global.fetch = originalFetch
        jest.restoreAllMocks()
    })

    function mockFetch(status: number): jest.Mock {
        const fn = jest.fn().mockResolvedValue({
            ok: status >= 200 && status < 300,
            status,
            body: { cancel: jest.fn().mockResolvedValue(undefined) },
        })
        global.fetch = fn as unknown as typeof fetch
        return fn
    }

    test('returns "valid" on 2xx and calls the session endpoint with the bearer token', async () => {
        const fn = mockFetch(200)

        await expect(validateCommsToken('tok', 'https://comms.test')).resolves.toBe('valid')
        expect(fn).toHaveBeenCalledWith(
            'https://comms.test/api/v1/users/get_session_user',
            expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
        )
    })

    test('returns "invalid" on 401', async () => {
        mockFetch(401)
        await expect(validateCommsToken('tok', 'https://comms.test')).resolves.toBe('invalid')
    })

    test('returns "forbidden" on 403', async () => {
        mockFetch(403)
        await expect(validateCommsToken('tok', 'https://comms.test')).resolves.toBe('forbidden')
    })

    test('throws CommsRequestError carrying the status on 5xx', async () => {
        mockFetch(503)
        await expect(validateCommsToken('tok', 'https://comms.test')).rejects.toBeInstanceOf(
            CommsRequestError,
        )
        mockFetch(503)
        await expect(validateCommsToken('tok', 'https://comms.test')).rejects.toMatchObject({
            httpStatusCode: 503,
        })
    })

    test('propagates fetch rejections (network/timeout) unchanged', async () => {
        const networkError = new Error('network down')
        global.fetch = jest.fn().mockRejectedValue(networkError) as unknown as typeof fetch

        await expect(validateCommsToken('tok', 'https://comms.test')).rejects.toBe(networkError)
    })

    test('defaults to the production base URL when none is given', async () => {
        const fn = mockFetch(200)

        await validateCommsToken('tok')
        expect(fn).toHaveBeenCalledWith(
            'https://comms.todoist.com/api/v1/users/get_session_user',
            expect.anything(),
        )
    })
})
