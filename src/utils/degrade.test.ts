import { jest } from '@jest/globals'
import { degradeAllWithLog, degradeWithLog } from './degrade.js'

describe('degradeAllWithLog', () => {
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>

    beforeEach(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleErrorSpy.mockRestore()
    })

    it('returns results in order, with null where the lookup failed', async () => {
        const results = await degradeAllWithLog(
            'get-users',
            'failed to resolve user',
            [1, 2, 3],
            (id) =>
                id === 2
                    ? Promise.reject(new Error('User not found'))
                    : Promise.resolve(`user-${id}`),
        )

        expect(results).toEqual(['user-1', null, 'user-3'])
    })

    it('logs once per batch rather than once per failure', async () => {
        const ids = Array.from({ length: 200 }, (_, index) => index)

        await degradeAllWithLog('get-users', 'failed to resolve user', ids, () =>
            Promise.reject(new Error('Unauthorized')),
        )

        expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'get-users: failed to resolve user',
            expect.objectContaining({
                failed: 200,
                of: 200,
                // Only a sample of the failed identifiers, so one outage can't
                // put an unbounded array into a log line.
                sample: [0, 1, 2, 3, 4],
                error: { name: 'Error', message: 'Unauthorized' },
            }),
        )
    })

    it('stays silent when every lookup succeeds', async () => {
        const results = await degradeAllWithLog('get-users', 'failed to resolve user', [1], (id) =>
            Promise.resolve(id),
        )

        expect(results).toEqual([1])
        expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('runs the batch through a supplied runner', async () => {
        const runner = jest.fn(<T, R>(items: readonly T[], worker: (item: T) => Promise<R>) =>
            Promise.all(items.map(worker)),
        )

        await degradeAllWithLog(
            'list-channels',
            'failed to resolve channel creator',
            [1, 2],
            (id) => Promise.resolve(id),
            { runner },
        )

        expect(runner).toHaveBeenCalledTimes(1)
    })

    it('logs the error message but not the error object itself', async () => {
        // The rejection carries an API response; only its message should reach the log.
        const error = Object.assign(new Error('Not found'), {
            response: { email: 'someone@example.com' },
        })

        await degradeAllWithLog('get-users', 'failed to resolve user', [1], () =>
            Promise.reject(error),
        )

        const [, context] = consoleErrorSpy.mock.calls[0] ?? []
        expect(context).toMatchObject({ error: { name: 'Error', message: 'Not found' } })
        expect(JSON.stringify(context)).not.toContain('someone@example.com')
    })
})

describe('degradeWithLog', () => {
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>

    beforeEach(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        consoleErrorSpy.mockRestore()
    })

    it('resolves to the fallback and logs the failure with its context', async () => {
        const result = await Promise.reject(new Error('Unauthorized')).catch(
            degradeWithLog(
                'list-conversations',
                'failed to load workspace roster',
                { workspaceId: 1 },
                [],
            ),
        )

        expect(result).toEqual([])
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            'list-conversations: failed to load workspace roster',
            { workspaceId: 1, error: { name: 'Error', message: 'Unauthorized' } },
        )
    })
})
