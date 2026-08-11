import { jest } from '@jest/globals'
import { degradeWithLog } from './degrade.js'

describe('degradeWithLog', () => {
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>

    beforeEach(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleErrorSpy.mockRestore()
    })

    it('resolves to the fallback and logs the failure with its context', async () => {
        const error = new Error('User not found')

        const result = await Promise.reject(error).catch(
            degradeWithLog(
                'get-users',
                'failed to resolve user',
                { workspaceId: 1, userId: 2 },
                null,
            ),
        )

        expect(result).toBeNull()
        expect(consoleErrorSpy).toHaveBeenCalledWith('get-users: failed to resolve user', {
            workspaceId: 1,
            userId: 2,
            error,
        })
    })

    it('supports a non-null fallback', async () => {
        const result = await Promise.reject(new Error('boom')).catch(
            degradeWithLog('list-conversations', 'failed to load workspace roster', {}, []),
        )

        expect(result).toEqual([])
    })
})
