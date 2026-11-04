import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import { UserStatusOutputSchema } from '../utils/output-schemas.js'
import {
    createMockUser,
    extractStructuredContent,
    extractTextContent,
    TEST_ERRORS,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { getUserStatus } from './get-user-status.js'

const mockCommsApi = {
    users: {
        getSessionUser: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { GET_USER_STATUS } = ToolNames

describe(`${GET_USER_STATUS} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns the active status with its end and effects', async () => {
        mockCommsApi.users.getSessionUser.mockResolvedValue(
            createMockUser({
                status: {
                    message: 'On holiday',
                    emoji: '🏝️',
                    activeUntil: '2026-11-10T07:00:00Z',
                    effects: { pauseNotifications: { scope: { mode: 'all' } } },
                },
            }),
        )

        const result = await getUserStatus.execute({}, mockCommsApi)

        expect(mockCommsApi.users.getSessionUser).toHaveBeenCalledWith()
        expect(extractTextContent(result)).toBe(
            'Status: 🏝️ On holiday\nUntil: 2026-11-10T07:00:00.000Z\nEffects: Comms notifications paused',
        )
        const structured = extractStructuredContent(result)
        expect(structured).toStrictEqual({
            type: 'user_status',
            hasStatus: true,
            status: {
                message: 'On holiday',
                emoji: '🏝️',
                activeUntil: '2026-11-10T07:00:00.000Z',
                pauseNotifications: true,
                pauseActivity: false,
            },
        })
        expect(UserStatusOutputSchema.safeParse(structured).success).toBe(true)
    })

    it('reports an end it cannot read as sent, rather than failing', async () => {
        mockCommsApi.users.getSessionUser.mockResolvedValue(
            createMockUser({ status: { message: 'Away', activeUntil: 'tomorrow' } }),
        )

        const result = await getUserStatus.execute({}, mockCommsApi)

        expect(extractStructuredContent(result).status).toStrictEqual({
            message: 'Away',
            activeUntil: 'tomorrow',
            pauseNotifications: false,
            pauseActivity: false,
        })
    })

    it.each([
        ['missing', {}],
        ['null', { status: null }],
    ])('reports no status when it is %s', async (_label, overrides) => {
        mockCommsApi.users.getSessionUser.mockResolvedValue(createMockUser(overrides))

        const result = await getUserStatus.execute({}, mockCommsApi)

        expect(extractTextContent(result)).toBe('Status: none')
        expect(extractStructuredContent(result)).toStrictEqual({
            type: 'user_status',
            hasStatus: false,
        })
    })

    it('propagates API errors', async () => {
        mockCommsApi.users.getSessionUser.mockRejectedValue(new Error(TEST_ERRORS.API_UNAUTHORIZED))

        await expect(getUserStatus.execute({}, mockCommsApi)).rejects.toThrow(
            TEST_ERRORS.API_UNAUTHORIZED,
        )
    })
})
