import { type CommsApi, CommsRequestError, type UserStatus } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import { z } from 'zod'
import { UserStatusOutputSchema } from '../utils/output-schemas.js'
import {
    createMockUser,
    extractStructuredContent,
    extractTextContent,
    TEST_ERRORS,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { setUserStatus } from './set-user-status.js'

const mockCommsApi = {
    users: {
        setStatus: jest.fn(),
        clearStatus: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const NOW = new Date('2026-11-03T12:00:00Z')
const ALL_SCOPE = { scope: { mode: 'all' } }

const { SET_USER_STATUS } = ToolNames

// The server echoes back whatever was sent, as the Comms API does on success.
function echoSentStatus() {
    mockCommsApi.users.setStatus.mockImplementation(async (args) => {
        const status: UserStatus = {
            message: args.message ?? '',
            ...(args.emoji ? { emoji: args.emoji } : {}),
            ...(args.activeUntil ? { activeUntil: String(args.activeUntil) } : {}),
            ...(args.effects
                ? {
                      effects: {
                          ...(args.effects.pauseNotifications
                              ? { pauseNotifications: args.effects.pauseNotifications }
                              : {}),
                          ...(args.effects.pauseActivity
                              ? { pauseActivity: args.effects.pauseActivity }
                              : {}),
                      },
                  }
                : {}),
        } as UserStatus
        return createMockUser({ status })
    })
}

function sentArgs() {
    return mockCommsApi.users.setStatus.mock.calls[0]?.[0]
}

describe(`${SET_USER_STATUS} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }).setSystemTime(NOW)
        echoSentStatus()
    })

    afterEach(() => {
        jest.useRealTimers()
    })

    it('replaces the whole status, clearing every field it is not given', async () => {
        const result = await setUserStatus.execute({ message: 'Deep work' }, mockCommsApi)

        expect(sentArgs()).toEqual({
            message: 'Deep work',
            emoji: null,
            activeUntil: null,
            effects: { pauseNotifications: null, pauseActivity: null },
        })
        expect(extractTextContent(result)).toBe('Status set: Deep work\nUntil: no end')
        expect(extractStructuredContent(result)).toStrictEqual({
            type: 'user_status',
            hasStatus: true,
            status: { message: 'Deep work', pauseNotifications: false, pauseActivity: false },
        })
    })

    it('sends the emoji, the end in UTC and both pauses with an explicit scope', async () => {
        const result = await setUserStatus.execute(
            {
                message: 'On holiday',
                emoji: '🏝️',
                activeUntil: '2026-11-10T09:00:00+02:00',
                pauseNotifications: true,
                pauseActivity: true,
            },
            mockCommsApi,
        )

        expect(sentArgs()).toEqual({
            message: 'On holiday',
            emoji: '🏝️',
            activeUntil: '2026-11-10T07:00:00.000Z',
            effects: { pauseNotifications: ALL_SCOPE, pauseActivity: ALL_SCOPE },
        })
        expect(extractTextContent(result)).toBe(
            'Status set: 🏝️ On holiday\nUntil: 2026-11-10T07:00:00.000Z\nEffects: Comms notifications paused, Karma and streaks paused',
        )
        expect(extractStructuredContent(result).status).toEqual({
            message: 'On holiday',
            emoji: '🏝️',
            activeUntil: '2026-11-10T07:00:00.000Z',
            pauseNotifications: true,
            pauseActivity: true,
        })
    })

    it.each([
        ['pauseNotifications', { pauseNotifications: ALL_SCOPE, pauseActivity: null }],
        ['pauseActivity', { pauseNotifications: null, pauseActivity: ALL_SCOPE }],
    ])('sends %s alone and clears the other effect', async (flag, effects) => {
        await setUserStatus.execute({ message: 'Focus', [flag]: true }, mockCommsApi)

        expect(sentArgs()?.effects).toEqual(effects)
    })

    it('clears both effects when both pause flags are false', async () => {
        await setUserStatus.execute(
            { message: 'Focus', pauseNotifications: false, pauseActivity: false },
            mockCommsApi,
        )

        expect(sentArgs()?.effects).toEqual({ pauseNotifications: null, pauseActivity: null })
    })

    it.each([
        ['a lowercase z', '2026-11-10t09:00:00z', '2026-11-10T09:00:00.000Z'],
        ['no seconds', '2026-11-10T09:00+02:00', '2026-11-10T07:00:00.000Z'],
        ['fractional seconds', '2026-11-10T09:00:00.5Z', '2026-11-10T09:00:00.500Z'],
        ['the widest negative offset', '2026-11-10T09:00:00-12:00', '2026-11-10T21:00:00.000Z'],
        ['the widest positive offset', '2026-11-10T09:00:00+14:00', '2026-11-09T19:00:00.000Z'],
        ['a leap day', '2028-02-29T09:00:00Z', '2028-02-29T09:00:00.000Z'],
    ])('accepts activeUntil with %s', async (_label, activeUntil, sent) => {
        await setUserStatus.execute({ message: 'Away', activeUntil }, mockCommsApi)

        expect(sentArgs()?.activeUntil).toBe(sent)
    })

    it.each([
        ['no zone', '2026-11-10T09:00:00'],
        ['a date only', '2026-11-10'],
        ['31 November', '2026-11-31T09:00:00Z'],
        ['29 February outside a leap year', '2027-02-29T09:00:00Z'],
        ['hour 24', '2026-11-10T24:00:00Z'],
        ['minute 60', '2026-11-10T09:60:00Z'],
        ['second 60', '2026-11-10T09:00:60Z'],
        ['offset minutes of 60', '2026-11-10T09:00:00+05:60'],
        ['an offset past +14:00', '2026-11-10T09:00:00+14:30'],
        ['an offset past -12:00', '2026-11-10T09:00:00-12:30'],
        ['words', 'next Tuesday'],
        ['an empty string', ''],
    ])('rejects activeUntil with %s without calling Comms', async (_label, activeUntil) => {
        await expect(
            setUserStatus.execute({ message: 'Away', activeUntil }, mockCommsApi),
        ).rejects.toThrow('activeUntil must be an ISO 8601 timestamp with Z or an offset')
        expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
    })

    it.each([
        ['in the past', '2026-11-03T11:59:59Z'],
        ['exactly now', '2026-11-03T12:00:00Z'],
        ['in the year 50', '0050-01-01T00:00:00Z'],
    ])('rejects an activeUntil %s', async (_label, activeUntil) => {
        await expect(
            setUserStatus.execute({ message: 'Away', activeUntil }, mockCommsApi),
        ).rejects.toThrow('activeUntil must be in the future')
        expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
    })

    it.each([
        ['missing', { emoji: '🎯' }],
        ['empty', { message: '' }],
    ])('requires a message unless clearing, when it is %s', async (_label, args) => {
        await expect(setUserStatus.execute(args, mockCommsApi)).rejects.toThrow(
            'message is required to set a status',
        )
        expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
    })

    it('clears the status with clearStatus', async () => {
        mockCommsApi.users.clearStatus.mockResolvedValue(createMockUser())

        const result = await setUserStatus.execute({ clear: true }, mockCommsApi)

        expect(mockCommsApi.users.clearStatus).toHaveBeenCalledWith()
        expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
        expect(extractTextContent(result)).toBe('Status cleared: none')
        expect(extractStructuredContent(result)).toEqual({ type: 'user_status', hasStatus: false })
    })

    it('treats pause flags set to false as asking for nothing alongside clear', async () => {
        mockCommsApi.users.clearStatus.mockResolvedValue(createMockUser({ status: null }))

        await setUserStatus.execute(
            { clear: true, pauseNotifications: false, pauseActivity: false },
            mockCommsApi,
        )

        expect(mockCommsApi.users.clearStatus).toHaveBeenCalled()
    })

    it.each([
        ['message', { message: 'Away' }],
        ['emoji', { emoji: '🎯' }],
        ['activeUntil', { activeUntil: '2026-11-10T09:00:00Z' }],
        ['pauseNotifications', { pauseNotifications: true }],
        ['pauseActivity', { pauseActivity: true }],
    ])('refuses clear combined with %s', async (_label, extra) => {
        await expect(
            setUserStatus.execute({ clear: true, ...extra }, mockCommsApi),
        ).rejects.toThrow('clear removes the status, so it cannot be combined with other fields.')
        expect(mockCommsApi.users.clearStatus).not.toHaveBeenCalled()
        expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
    })

    it('fails when Comms accepts the status but reports none active', async () => {
        mockCommsApi.users.setStatus.mockResolvedValue(createMockUser())

        await expect(setUserStatus.execute({ message: 'Away' }, mockCommsApi)).rejects.toThrow(
            'Comms accepted the status but reports no active status',
        )
    })

    it('fails when Comms accepts the clear but still reports a status', async () => {
        mockCommsApi.users.clearStatus.mockResolvedValue(
            createMockUser({ status: { message: 'Still here' } }),
        )

        await expect(setUserStatus.execute({ clear: true }, mockCommsApi)).rejects.toThrow(
            'Comms accepted the clear but still reports a status',
        )
    })

    it('reports the status Comms holds when it differs from the one sent', async () => {
        mockCommsApi.users.setStatus.mockResolvedValue(
            createMockUser({ status: { message: 'Away', emoji: '🏝' } }),
        )

        const result = await setUserStatus.execute({ message: 'Away', emoji: '🏝️' }, mockCommsApi)

        expect(extractStructuredContent(result).status).toEqual({
            message: 'Away',
            emoji: '🏝',
            pauseNotifications: false,
            pauseActivity: false,
        })
    })

    it('fails when Comms reports a different message from the one sent', async () => {
        mockCommsApi.users.setStatus.mockResolvedValue(
            createMockUser({ status: { message: 'Old status' } }),
        )

        await expect(
            setUserStatus.execute({ message: 'New status' }, mockCommsApi),
        ).rejects.toThrow(
            `Comms accepted the status but reports a different one; use ${ToolNames.GET_USER_STATUS} to see it.`,
        )
    })

    it('names the next step when Comms reports no active status', async () => {
        mockCommsApi.users.setStatus.mockResolvedValue(createMockUser())

        await expect(setUserStatus.execute({ message: 'Away' }, mockCommsApi)).rejects.toThrow(
            ToolNames.GET_USER_STATUS,
        )
    })

    describe.each([
        ['set', { message: 'Away' }, 'setStatus'],
        ['clear', { clear: true }, 'clearStatus'],
    ] as const)('when Comms refuses a %s', (_label, args, method) => {
        function refuseWith(status: number, responseData?: unknown) {
            mockCommsApi.users[method].mockRejectedValue(
                new CommsRequestError(`Request failed with status ${status}`, status, responseData),
            )
        }

        it.each([401, 403])('points at the user:write scope on a %i', async (status) => {
            refuseWith(status, { error_code: status, error_string: 'Insufficient scope' })

            await expect(setUserStatus.execute(args, mockCommsApi)).rejects.toThrow(
                `Comms refused to change the status (HTTP ${status}): Insufficient scope. It was not changed. Changing it needs the user:write scope, so the connection may need reconnecting to grant it.`,
            )
        })

        it('still points at the scope when the refusal has no reason', async () => {
            refuseWith(403)

            await expect(setUserStatus.execute(args, mockCommsApi)).rejects.toThrow(
                'Comms refused to change the status (HTTP 403). It was not changed. Changing it needs',
            )
        })

        it('gives the reason without a scope hint on a 400', async () => {
            refuseWith(400, { error_code: 400, error_string: 'Emoji is not valid' })

            const failure = setUserStatus.execute(args, mockCommsApi)

            await expect(failure).rejects.toThrow(
                'Comms refused to change the status (HTTP 400): Emoji is not valid. It was not changed.',
            )
            await expect(failure).rejects.not.toThrow('user:write')
        })

        it('leaves a server error untouched, because the write may have applied', async () => {
            refuseWith(500)

            await expect(setUserStatus.execute(args, mockCommsApi)).rejects.toThrow(
                'Request failed with status 500',
            )
        })
    })

    it('propagates API errors', async () => {
        mockCommsApi.users.setStatus.mockRejectedValue(new Error(TEST_ERRORS.API_UNAUTHORIZED))

        await expect(setUserStatus.execute({ message: 'Away' }, mockCommsApi)).rejects.toThrow(
            TEST_ERRORS.API_UNAUTHORIZED,
        )
    })

    it('returns output that matches its schema', async () => {
        const result = await setUserStatus.execute(
            { message: 'Away', emoji: '🎯', activeUntil: '2026-11-10T09:00:00Z' },
            mockCommsApi,
        )

        expect(UserStatusOutputSchema.safeParse(extractStructuredContent(result)).success).toBe(
            true,
        )
    })

    describe('argument schema', () => {
        const schema = z.object(setUserStatus.parameters)

        it('trims the message, emoji and activeUntil', () => {
            expect(
                schema.parse({
                    message: '  Away  ',
                    emoji: ' 🎯 ',
                    activeUntil: ' 2026-11-10T09:00:00Z ',
                }),
            ).toEqual({
                message: 'Away',
                emoji: '🎯',
                activeUntil: '2026-11-10T09:00:00Z',
            })
        })

        it('rejects an activeUntil of only spaces', () => {
            expect(schema.safeParse({ clear: true, activeUntil: '   ' }).success).toBe(false)
        })

        it.each([
            ['80 letters', 'a'.repeat(80), true],
            ['81 letters', 'a'.repeat(81), false],
            ['41 emoji', '😀'.repeat(41), true],
            ['81 emoji', '😀'.repeat(81), false],
            ['only spaces', '   ', false],
        ])('checks a message of %s', (_label, message, valid) => {
            expect(schema.safeParse({ message }).success).toBe(valid)
        })

        it('rejects an emoji of only spaces', () => {
            expect(schema.safeParse({ message: 'Away', emoji: '  ' }).success).toBe(false)
        })
    })
})
