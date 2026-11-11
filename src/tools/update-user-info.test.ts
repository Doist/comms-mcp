import { type CommsApi, CommsRequestError, type UserStatus } from '@todoist/comms-sdk'
import { vi } from 'vitest'
import { z } from 'zod'
import { UserInfoOutputSchema } from '../utils/output-schemas.js'
import {
    createMockUser,
    extractStructuredContent,
    extractTextContent,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { updateUserInfo } from './update-user-info.js'

const mockCommsApi = vi.mocked(
    {
        users: {
            getSessionUser: vi.fn(),
            update: vi.fn(),
            setStatus: vi.fn(),
            clearStatus: vi.fn(),
        },
    } as unknown as CommsApi,
    true,
)

const NOW = new Date('2026-11-03T12:00:00Z')
const ALL_SCOPE = { scope: { mode: 'all' } }

const { UPDATE_USER_INFO, USER_INFO } = ToolNames

type StatusInput = Parameters<typeof updateUserInfo.execute>[0]['status']

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

function echoSentProfile() {
    mockCommsApi.users.update.mockImplementation(async (args) =>
        createMockUser({
            ...(args.name ? { fullName: args.name } : {}),
            ...(args.timezone ? { timezone: args.timezone } : {}),
            ...(args.lang ? { lang: args.lang } : {}),
        }),
    )
}

// A whole-message match, so a suffix added to an error fails the test.
function exactly(text: string): RegExp {
    return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}

function setStatus(status: StatusInput) {
    return updateUserInfo.execute({ status }, mockCommsApi)
}

function sentStatus() {
    return mockCommsApi.users.setStatus.mock.calls[0]?.[0]
}

function statusOf(result: object) {
    return extractStructuredContent(result).status
}

describe(`${UPDATE_USER_INFO} tool`, () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers({ toFake: ['Date'] }).setSystemTime(NOW)
        echoSentStatus()
        echoSentProfile()
        mockCommsApi.users.getSessionUser.mockResolvedValue(
            createMockUser({ status: { message: 'Held' } }),
        )
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    describe('profile', () => {
        it('sends only the fields it is given and leaves the status alone', async () => {
            const result = await updateUserInfo.execute(
                { name: 'Ada Lovelace', timezone: 'Europe/London' },
                mockCommsApi,
            )

            expect(mockCommsApi.users.update).toHaveBeenCalledWith({
                name: 'Ada Lovelace',
                timezone: 'Europe/London',
            })
            expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
            expect(mockCommsApi.users.clearStatus).not.toHaveBeenCalled()
            expect(extractTextContent(result)).toMatch(
                /^Updated: name, timezone\n\n# User Information/,
            )
            expect(extractStructuredContent(result)).toEqual(
                expect.objectContaining({
                    type: 'user_info',
                    name: 'Ada Lovelace',
                    timezone: 'Europe/London',
                    lang: 'en',
                }),
            )
            // The update response leaves the status out, so it is read back rather than shown as none.
            expect(mockCommsApi.users.getSessionUser).toHaveBeenCalledWith()
            expect(statusOf(result)).toEqual(expect.objectContaining({ message: 'Held' }))
        })

        it('reports the status from the update response when it carries one', async () => {
            mockCommsApi.users.update.mockResolvedValue(createMockUser({ status: null }))

            const result = await updateUserInfo.execute({ lang: 'en' }, mockCommsApi)

            expect(mockCommsApi.users.getSessionUser).not.toHaveBeenCalled()
            expect(extractStructuredContent(result)).not.toHaveProperty('status')
        })

        it('says Comms accepted the profile when reading the status back fails', async () => {
            mockCommsApi.users.getSessionUser.mockRejectedValue(new Error('fetch failed'))

            await expect(updateUserInfo.execute({ name: 'Ada' }, mockCommsApi)).rejects.toThrow(
                exactly(
                    `Comms accepted the profile change, but reading the status back failed: fetch failed. Use ${USER_INFO} to check it.`,
                ),
            )
        })

        it('notes a field Comms reports differently, rather than failing a write it accepted', async () => {
            mockCommsApi.users.update.mockResolvedValue(createMockUser({ lang: 'en' }))

            const result = await updateUserInfo.execute({ lang: 'pt' }, mockCommsApi)

            expect(extractTextContent(result)).toMatch(
                /^Updated: lang\nComms reports lang as "en", not "pt"; use user-info to check it\.\n\n# User Information/,
            )
            expect(extractStructuredContent(result).lang).toBe('en')
        })

        it('still sends the status after a profile Comms reports differently', async () => {
            mockCommsApi.users.update.mockResolvedValue(createMockUser({ fullName: 'Old Name' }))
            mockCommsApi.users.clearStatus.mockResolvedValue(createMockUser({ status: null }))

            const result = await updateUserInfo.execute({ name: 'Ada', status: null }, mockCommsApi)

            expect(mockCommsApi.users.clearStatus).toHaveBeenCalledWith()
            expect(extractTextContent(result)).toMatch(
                /^Updated: name, status\nComms reports name as "Old Name", not "Ada"; use user-info to check it\.\n\n/,
            )
        })

        it.each([
            ['null', null],
            ['blank', '   '],
            ['a number', 5],
        ])(
            'refuses a name that is %s from a caller that skips the schema',
            async (_label, name) => {
                await expect(
                    updateUserInfo.execute(
                        { name } as Parameters<typeof updateUserInfo.execute>[0],
                        mockCommsApi,
                    ),
                ).rejects.toThrow(exactly('name must be text that is not blank.'))
                expect(mockCommsApi.users.update).not.toHaveBeenCalled()
            },
        )

        it('sends the language', async () => {
            await updateUserInfo.execute({ lang: 'pt' }, mockCommsApi)

            expect(mockCommsApi.users.update).toHaveBeenCalledWith({ lang: 'pt' })
        })

        it('never sends a password, even from a caller that skips the schema', async () => {
            await updateUserInfo.execute(
                { name: 'Ada', password: 'hunter2' } as Parameters<
                    typeof updateUserInfo.execute
                >[0],
                mockCommsApi,
            )

            expect(mockCommsApi.users.update).toHaveBeenCalledWith({ name: 'Ada' })
        })

        it('updates the profile first, then the status, and reports both', async () => {
            mockCommsApi.users.update.mockResolvedValue(
                createMockUser({ fullName: 'Ada', shortName: 'Ada' }),
            )

            const result = await updateUserInfo.execute(
                { name: 'Ada', status: { message: 'Away' } },
                mockCommsApi,
            )

            expect(mockCommsApi.users.update.mock.invocationCallOrder[0]).toBeLessThan(
                mockCommsApi.users.setStatus.mock.invocationCallOrder[0] ?? 0,
            )
            expect(extractTextContent(result)).toMatch(/^Updated: name, status\n\n/)
            expect(statusOf(result)).toEqual(expect.objectContaining({ message: 'Away' }))
            // The status response carries the default user; the profile is taken from its own write,
            // short name included, so the two never mix.
            expect(extractStructuredContent(result)).toEqual(
                expect.objectContaining({ name: 'Ada', shortName: 'Ada' }),
            )
        })

        it('updates the profile and clears the status in one call', async () => {
            mockCommsApi.users.clearStatus.mockResolvedValue(createMockUser({ status: null }))

            const result = await updateUserInfo.execute({ name: 'Ada', status: null }, mockCommsApi)

            expect(mockCommsApi.users.clearStatus).toHaveBeenCalledWith()
            expect(extractTextContent(result)).toMatch(/^Updated: name, status\n\n/)
            expect(extractStructuredContent(result).name).toBe('Ada')
            expect(extractStructuredContent(result)).not.toHaveProperty('status')
        })

        it('says the profile change applied when the status after it reads differently', async () => {
            mockCommsApi.users.setStatus.mockResolvedValue(
                createMockUser({ status: { message: 'Other' } }),
            )

            await expect(
                updateUserInfo.execute({ name: 'Ada', status: { message: 'Away' } }, mockCommsApi),
            ).rejects.toThrow(
                exactly(
                    `Comms accepted the profile change. Comms accepted the status but reports a different one; use ${USER_INFO} to see it.`,
                ),
            )
        })

        it('does not send the status when the profile update is refused', async () => {
            mockCommsApi.users.update.mockRejectedValue(
                new CommsRequestError('Request failed with status 400', 400, {
                    error_code: 400,
                    error_string: 'Invalid timezone',
                }),
            )

            await expect(
                updateUserInfo.execute(
                    { timezone: 'Mars/Olympus', status: { message: 'Away' } },
                    mockCommsApi,
                ),
            ).rejects.toThrow(
                exactly(
                    `Comms refused to change the profile (HTTP 400): Invalid timezone. Use ${USER_INFO} to check it. The status change was not sent.`,
                ),
            )
            expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
        })

        it('says the profile change applied when the status after it fails', async () => {
            mockCommsApi.users.setStatus.mockRejectedValue(
                new CommsRequestError('Request failed with status 403', 403),
            )

            await expect(
                updateUserInfo.execute({ name: 'Ada', status: { message: 'Away' } }, mockCommsApi),
            ).rejects.toThrow(
                'Comms accepted the profile change. Comms refused to change the status (HTTP 403).',
            )
        })

        it('says nothing about the profile when only the status fails', async () => {
            mockCommsApi.users.setStatus.mockRejectedValue(
                new CommsRequestError('Request failed with status 403', 403),
            )

            await expect(setStatus({ message: 'Away' })).rejects.toThrow(
                /^Comms refused to change the status/,
            )
        })

        it('requires at least one field', async () => {
            await expect(updateUserInfo.execute({}, mockCommsApi)).rejects.toThrow(
                exactly(
                    'At least one of `name`, `timezone`, `lang`, or `status` must be provided.',
                ),
            )
            expect(mockCommsApi.users.update).not.toHaveBeenCalled()
        })

        it('points at the user:write scope when the profile update gets a 403', async () => {
            mockCommsApi.users.update.mockRejectedValue(
                new CommsRequestError('Request failed with status 403', 403),
            )

            await expect(updateUserInfo.execute({ name: 'Ada' }, mockCommsApi)).rejects.toThrow(
                exactly(
                    `Comms refused to change the profile (HTTP 403). Changing it needs the user:write scope, so the connection may need reconnecting to grant it. Use ${USER_INFO} to check it.`,
                ),
            )
        })

        it('calls a server error on the profile unconfirmed', async () => {
            mockCommsApi.users.update.mockRejectedValue(
                new CommsRequestError('Request failed with status 502', 502),
            )

            await expect(updateUserInfo.execute({ lang: 'en' }, mockCommsApi)).rejects.toThrow(
                exactly(
                    `The profile change is unconfirmed: Request failed with status 502. Use ${USER_INFO} to check it.`,
                ),
            )
        })
    })

    it('replaces the whole status, clearing every field it is not given', async () => {
        const result = await setStatus({ message: 'Deep work' })

        expect(sentStatus()).toEqual({
            message: 'Deep work',
            emoji: null,
            activeUntil: null,
            effects: { pauseNotifications: null, pauseActivity: null },
        })
        expect(mockCommsApi.users.update).not.toHaveBeenCalled()
        expect(extractTextContent(result)).toMatch(
            /^Updated: status\n\n[\s\S]*\*\*Status:\*\* Deep work\n\*\*Status Until:\*\* no end$/,
        )
        expect(statusOf(result)).toStrictEqual({
            message: 'Deep work',
            pauseNotifications: false,
            pauseActivity: false,
        })
    })

    it('sends the emoji, the end in UTC and both pauses with an explicit scope', async () => {
        const result = await setStatus({
            message: 'On holiday',
            emoji: '🏝️',
            activeUntil: '2026-11-10T09:00:00+02:00',
            pauseNotifications: true,
            pauseActivity: true,
        })

        expect(sentStatus()).toEqual({
            message: 'On holiday',
            emoji: '🏝️',
            activeUntil: '2026-11-10T07:00:00.000Z',
            effects: { pauseNotifications: ALL_SCOPE, pauseActivity: ALL_SCOPE },
        })
        expect(extractTextContent(result)).toContain(
            '**Status:** 🏝️ On holiday\n**Status Until:** 2026-11-10T07:00:00.000Z\n**Status Effects:** Comms notifications paused, Karma and streaks paused',
        )
        expect(statusOf(result)).toEqual({
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
        await setStatus({ message: 'Focus', [flag]: true })

        expect(sentStatus()?.effects).toEqual(effects)
    })

    it.each([
        ['pauseNotifications', 'Comms notifications paused'],
        ['pauseActivity', 'Karma and streaks paused'],
    ])('reports %s alone with its own label', async (flag, label) => {
        const result = await setStatus({ message: 'Focus', [flag]: true })

        expect(extractTextContent(result)).toMatch(
            new RegExp(`\\*\\*Status Effects:\\*\\* ${label}$`),
        )
    })

    it('clears both effects when both pause flags are false', async () => {
        await setStatus({ message: 'Focus', pauseNotifications: false, pauseActivity: false })

        expect(sentStatus()?.effects).toEqual({ pauseNotifications: null, pauseActivity: null })
    })

    it.each([
        ['a lowercase z', '2026-11-10t09:00:00z', '2026-11-10T09:00:00.000Z'],
        ['no seconds', '2026-11-10T09:00+02:00', '2026-11-10T07:00:00.000Z'],
        ['fractional seconds', '2026-11-10T09:00:00.5Z', '2026-11-10T09:00:00.500Z'],
        ['the widest negative offset', '2026-11-10T09:00:00-12:00', '2026-11-10T21:00:00.000Z'],
        ['the widest positive offset', '2026-11-10T09:00:00+14:00', '2026-11-09T19:00:00.000Z'],
        ['a leap day', '2028-02-29T09:00:00Z', '2028-02-29T09:00:00.000Z'],
    ])('accepts activeUntil with %s', async (_label, activeUntil, sent) => {
        await setStatus({ message: 'Away', activeUntil })

        expect(sentStatus()?.activeUntil).toBe(sent)
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
        await expect(setStatus({ message: 'Away', activeUntil })).rejects.toThrow(
            'activeUntil must be an ISO 8601 timestamp with Z or an offset',
        )
        expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
    })

    it.each([
        ['in the past', '2026-11-03T11:59:59Z'],
        ['exactly now', '2026-11-03T12:00:00Z'],
        ['in the year 50', '0050-01-01T00:00:00Z'],
    ])('rejects an activeUntil %s', async (_label, activeUntil) => {
        await expect(setStatus({ message: 'Away', activeUntil })).rejects.toThrow(
            'activeUntil must be in the future',
        )
        expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
    })

    it('checks the end before changing the profile', async () => {
        await expect(
            updateUserInfo.execute(
                { name: 'Ada', status: { message: 'Away', activeUntil: 'tomorrow' } },
                mockCommsApi,
            ),
        ).rejects.toThrow('activeUntil must be an ISO 8601 timestamp')
        expect(mockCommsApi.users.update).not.toHaveBeenCalled()
    })

    it.each([
        ['missing', { emoji: '🎯' }],
        ['empty', { message: '' }],
        ['a number', { message: 42 }],
    ])(
        'requires a message for a caller that skips the schema, when it is %s',
        async (_label, status) => {
            await expect(setStatus(status as StatusInput)).rejects.toThrow(
                'status.message is required to set a status. Pass status: null to remove it.',
            )
            expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
        },
    )

    it('refuses an emoji that is not text before writing anything', async () => {
        await expect(
            updateUserInfo.execute(
                { name: 'Ada', status: { message: 'Away', emoji: 5 } } as unknown as Parameters<
                    typeof updateUserInfo.execute
                >[0],
                mockCommsApi,
            ),
        ).rejects.toThrow(exactly('status.emoji must be text, such as "🏝️".'))
        expect(mockCommsApi.users.update).not.toHaveBeenCalled()
        expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
    })

    it.each(['pauseNotifications', 'pauseActivity'])(
        'refuses a %s that is not true or false before writing anything',
        async (flag) => {
            await expect(
                setStatus({ message: 'Away', [flag]: 'false' } as unknown as StatusInput),
            ).rejects.toThrow(exactly(`status.${flag} must be true or false.`))
            expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
        },
    )

    it('reads an activeUntil of null as no end, as the SDK does', async () => {
        await setStatus({ message: 'Away', activeUntil: null } as unknown as StatusInput)

        expect(sentStatus()?.activeUntil).toBeNull()
    })

    it('clears the status with clearStatus when status is null', async () => {
        mockCommsApi.users.clearStatus.mockResolvedValue(createMockUser())

        const result = await setStatus(null)

        expect(mockCommsApi.users.clearStatus).toHaveBeenCalledWith()
        expect(mockCommsApi.users.setStatus).not.toHaveBeenCalled()
        expect(extractTextContent(result)).toMatch(
            /^Updated: status\n\n[\s\S]*\*\*Status:\*\* none$/,
        )
        expect(extractStructuredContent(result)).not.toHaveProperty('status')
    })

    it('fails when Comms accepts the status but reports none active', async () => {
        mockCommsApi.users.setStatus.mockResolvedValue(createMockUser())

        await expect(setStatus({ message: 'Away' })).rejects.toThrow(
            `Comms accepted the status but reports no active status; use ${USER_INFO} to see it.`,
        )
    })

    it('fails when Comms accepts the clear but still reports a status', async () => {
        mockCommsApi.users.clearStatus.mockResolvedValue(
            createMockUser({ status: { message: 'Still here' } }),
        )

        await expect(setStatus(null)).rejects.toThrow(
            'Comms accepted the clear but still reports a status',
        )
    })

    it('reports the status Comms holds when only the emoji variation selector differs', async () => {
        mockCommsApi.users.setStatus.mockResolvedValue(
            createMockUser({ status: { message: 'Away', emoji: '🏝' } }),
        )

        const result = await setStatus({ message: 'Away', emoji: '🏝️' })

        expect(statusOf(result)).toEqual({
            message: 'Away',
            emoji: '🏝',
            pauseNotifications: false,
            pauseActivity: false,
        })
    })

    it.each<[string, NonNullable<StatusInput>, Partial<UserStatus>]>([
        ['message', { message: 'New' }, { message: 'Old' }],
        ['emoji', { message: 'Away', emoji: '🏝️' }, { message: 'Away', emoji: '🙂' }],
        ['dropped emoji', { message: 'Away', emoji: '🏝️' }, { message: 'Away' }],
        [
            'end',
            { message: 'Away', activeUntil: '2026-11-10T09:00:00Z' },
            { message: 'Away', activeUntil: '2026-11-11T09:00:00Z' },
        ],
        [
            'dropped end',
            { message: 'Away', activeUntil: '2026-11-10T09:00:00Z' },
            { message: 'Away' },
        ],
        [
            'end a second later',
            { message: 'Away', activeUntil: '2026-11-10T09:00:00Z' },
            { message: 'Away', activeUntil: '2026-11-10T09:00:01Z' },
        ],
        [
            'end it was not asked for',
            { message: 'Away' },
            { message: 'Away', activeUntil: '2026-11-10T09:00:00Z' },
        ],
        [
            'end that cannot be read',
            { message: 'Away', activeUntil: '2026-11-10T09:00:00Z' },
            { message: 'Away', activeUntil: 'tomorrow' },
        ],
        ['notification pause', { message: 'Away', pauseNotifications: true }, { message: 'Away' }],
        [
            'activity pause',
            { message: 'Away', pauseActivity: true },
            { message: 'Away', effects: {} },
        ],
        [
            'notification pause scope',
            { message: 'Away', pauseNotifications: true },
            {
                message: 'Away',
                effects: { pauseNotifications: { scope: { mode: 'some' } } },
            },
        ],
        [
            'activity pause scope',
            { message: 'Away', pauseActivity: true },
            { message: 'Away', effects: { pauseActivity: { scope: { mode: 'some' } } } },
        ],
        [
            'pause with no scope',
            { message: 'Away', pauseNotifications: true },
            { message: 'Away', effects: { pauseNotifications: {} } },
        ],
        [
            'pause it was not asked for',
            { message: 'Away' },
            { message: 'Away', effects: { pauseActivity: {} } },
        ],
    ])(
        'fails when Comms reports a different %s from the one sent',
        async (_label, args, status) => {
            mockCommsApi.users.setStatus.mockResolvedValue(
                createMockUser({ status: status as UserStatus }),
            )

            await expect(setStatus(args)).rejects.toThrow(
                `Comms accepted the status but reports a different one; use ${USER_INFO} to see it.`,
            )
        },
    )

    it('accepts an end Comms writes in another form of the same instant', async () => {
        mockCommsApi.users.setStatus.mockResolvedValue(
            createMockUser({
                status: { message: 'Away', activeUntil: '2026-11-10T09:00:00+00:00' },
            }),
        )

        const result = await setStatus({ message: 'Away', activeUntil: '2026-11-10T09:00:00Z' })

        expect(statusOf(result)).toEqual({
            message: 'Away',
            activeUntil: '2026-11-10T09:00:00.000Z',
            pauseNotifications: false,
            pauseActivity: false,
        })
    })

    it('accepts a fractional end Comms returns in microseconds', async () => {
        mockCommsApi.users.setStatus.mockResolvedValue(
            createMockUser({
                status: { message: 'Away', activeUntil: '2026-11-10T09:00:00.215000Z' },
            }),
        )

        const result = await setStatus({ message: 'Away', activeUntil: '2026-11-10T09:00:00.215Z' })

        expect(statusOf(result)).toEqual({
            message: 'Away',
            activeUntil: '2026-11-10T09:00:00.215Z',
            pauseNotifications: false,
            pauseActivity: false,
        })
    })

    it('trims the message and emoji for a caller that skipped the schema', async () => {
        mockCommsApi.users.setStatus.mockResolvedValue(
            createMockUser({ status: { message: 'Away', emoji: '🎯' } }),
        )

        const result = await setStatus({ message: '  Away  ', emoji: ' 🎯 ' })

        expect(sentStatus()).toEqual(expect.objectContaining({ message: 'Away', emoji: '🎯' }))
        expect(statusOf(result)).toEqual({
            message: 'Away',
            emoji: '🎯',
            pauseNotifications: false,
            pauseActivity: false,
        })
    })

    it('sends no emoji for a blank one from a caller that skipped the schema', async () => {
        await setStatus({ message: 'Away', emoji: '  ' })

        expect(sentStatus()?.emoji).toBeNull()
    })

    it('accepts an empty emoji from Comms when none was sent', async () => {
        mockCommsApi.users.setStatus.mockResolvedValue(
            createMockUser({ status: { message: 'Away', emoji: '' } }),
        )

        const result = await setStatus({ message: 'Away' })

        expect(statusOf(result)).toEqual({
            message: 'Away',
            pauseNotifications: false,
            pauseActivity: false,
        })
    })

    it('accepts a message Comms returns in another normal form or with spaces collapsed', async () => {
        mockCommsApi.users.setStatus.mockResolvedValue(
            createMockUser({ status: { message: 'Café at noon' } }),
        )

        const result = await setStatus({ message: 'Café  at noon' })

        expect(statusOf(result)).toEqual({
            message: 'Café at noon',
            pauseNotifications: false,
            pauseActivity: false,
        })
    })

    describe.each([
        ['set', { message: 'Away' }, 'setStatus'],
        ['clear', null, 'clearStatus'],
    ] as const)('when a status %s fails', (_label, status, method) => {
        const CHECK_IT = `Use ${USER_INFO} to check it.`

        function refuseWith(code: number, responseData?: unknown) {
            mockCommsApi.users[method].mockRejectedValue(
                new CommsRequestError(`Request failed with status ${code}`, code, responseData),
            )
        }

        it('points at the user:write scope on a 403', async () => {
            refuseWith(403, { error_code: 403, error_string: 'Insufficient scope' })

            await expect(setStatus(status)).rejects.toThrow(
                `Comms refused to change the status (HTTP 403): Insufficient scope. Changing it needs the user:write scope, so the connection may need reconnecting to grant it. ${CHECK_IT}`,
            )
        })

        it('points at the token, not the scope, on a 401', async () => {
            refuseWith(401, { error_code: 401, error_string: 'Token expired' })

            await expect(setStatus(status)).rejects.toThrow(
                `Comms refused to change the status (HTTP 401): Token expired. Comms rejected the token, so the connection may need reconnecting. ${CHECK_IT}`,
            )
        })

        it('reads well when the refusal has no reason', async () => {
            refuseWith(403)

            await expect(setStatus(status)).rejects.toThrow(
                'Comms refused to change the status (HTTP 403). Changing it needs',
            )
        })

        it('gives the reason alone on any other 4xx', async () => {
            refuseWith(400, { error_code: 400, error_string: 'Emoji is not valid' })

            await expect(setStatus(status)).rejects.toThrow(
                `Comms refused to change the status (HTTP 400): Emoji is not valid. ${CHECK_IT}`,
            )
        })

        it('calls a server error unconfirmed, because the write may have applied', async () => {
            refuseWith(500)

            await expect(setStatus(status)).rejects.toThrow(
                `The status change is unconfirmed: Request failed with status 500. ${CHECK_IT}`,
            )
        })

        it('calls a transport or parse failure unconfirmed', async () => {
            mockCommsApi.users[method].mockRejectedValue(new Error('fetch failed'))

            await expect(setStatus(status)).rejects.toThrow(
                `The status change is unconfirmed: fetch failed. ${CHECK_IT}`,
            )
        })

        it('calls a rejection that is not an Error unconfirmed', async () => {
            mockCommsApi.users[method].mockRejectedValue('boom')

            await expect(setStatus(status)).rejects.toThrow(
                `The status change is unconfirmed: boom. ${CHECK_IT}`,
            )
        })
    })

    it('returns output that matches its schema', async () => {
        const result = await updateUserInfo.execute(
            {
                name: 'Ada',
                status: { message: 'Away', emoji: '🎯', activeUntil: '2026-11-10T09:00:00Z' },
            },
            mockCommsApi,
        )

        expect(UserInfoOutputSchema.safeParse(extractStructuredContent(result)).success).toBe(true)
    })

    describe('argument schema', () => {
        const schema = z.object(updateUserInfo.parameters)

        it('has no password field', () => {
            expect(Object.keys(updateUserInfo.parameters)).not.toContain('password')
            expect(schema.parse({ name: 'Ada', password: 'hunter2' })).toEqual({ name: 'Ada' })
        })

        it('trims the message, emoji and activeUntil', () => {
            expect(
                schema.parse({
                    status: {
                        message: '  Away  ',
                        emoji: ' 🎯 ',
                        activeUntil: ' 2026-11-10T09:00:00Z ',
                    },
                }),
            ).toEqual({
                status: { message: 'Away', emoji: '🎯', activeUntil: '2026-11-10T09:00:00Z' },
            })
        })

        it('trims the profile fields', () => {
            expect(schema.parse({ name: ' Ada ', timezone: ' UTC ', lang: ' en ' })).toEqual({
                name: 'Ada',
                timezone: 'UTC',
                lang: 'en',
            })
        })

        it.each(['name', 'timezone', 'lang'])('rejects a %s of only spaces', (field) => {
            expect(schema.safeParse({ [field]: '   ' }).success).toBe(false)
        })

        it('accepts null to remove the status', () => {
            expect(schema.parse({ status: null })).toEqual({ status: null })
        })

        it('rejects an activeUntil of only spaces', () => {
            expect(
                schema.safeParse({ status: { message: 'Away', activeUntil: '   ' } }).success,
            ).toBe(false)
        })

        it.each([
            ['80 letters', 'a'.repeat(80), true],
            ['81 letters', 'a'.repeat(81), false],
            ['41 emoji', '😀'.repeat(41), true],
            ['81 emoji', '😀'.repeat(81), false],
            ['only spaces', '   ', false],
        ])('checks a message of %s', (_label, message, valid) => {
            expect(schema.safeParse({ status: { message } }).success).toBe(valid)
        })

        it('requires a message in a status', () => {
            expect(schema.safeParse({ status: { emoji: '🎯' } }).success).toBe(false)
        })

        it('rejects an emoji of only spaces', () => {
            expect(schema.safeParse({ status: { message: 'Away', emoji: '  ' } }).success).toBe(
                false,
            )
        })
    })
})
