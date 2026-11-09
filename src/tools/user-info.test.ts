import type { CommsApi } from '@doist/comms-sdk'
import { vi } from 'vitest'
import { UserInfoOutputSchema } from '../utils/output-schemas.js'
import {
    createMockUser,
    extractStructuredContent,
    extractTextContent,
    TEST_ERRORS,
    TEST_IDS,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { userInfo } from './user-info.js'

// Mock the Comms API
const mockCommsApi = vi.mocked(
    {
        users: {
            getSessionUser: vi.fn(),
        },
    } as unknown as CommsApi,
    true,
)

const { USER_INFO } = ToolNames

describe(`${USER_INFO} tool`, () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('should generate user info with all required fields', async () => {
        const mockUser = createMockUser()

        mockCommsApi.users.getSessionUser.mockResolvedValue(mockUser)

        const result = await userInfo.execute({}, mockCommsApi)

        expect(mockCommsApi.users.getSessionUser).toHaveBeenCalledWith()

        // Test text content contains expected information
        const textContent = extractTextContent(result)
        expect(textContent).toContain(`User ID:** ${TEST_IDS.USER_1}`)
        expect(textContent).toContain('Test User')
        expect(textContent).toContain('test@example.com')
        expect(textContent).toContain('UTC')
        expect(textContent).toContain('**Language:** en')

        // Test structured content
        const structuredContent = extractStructuredContent(result)
        expect(structuredContent).toEqual(
            expect.objectContaining({
                type: 'user_info',
                userId: TEST_IDS.USER_1,
                email: 'test@example.com',
                name: 'Test User',
                shortName: 'Test',
                timezone: 'UTC',
                lang: 'en',
            }),
        )
    })

    it('should handle different timezones', async () => {
        const mockUser = createMockUser({
            timezone: 'America/New_York',
        })

        mockCommsApi.users.getSessionUser.mockResolvedValue(mockUser)

        const result = await userInfo.execute({}, mockCommsApi)

        const textContent = extractTextContent(result)
        expect(textContent).toContain('America/New_York')

        const structuredContent = extractStructuredContent(result)
        expect(structuredContent.timezone).toBe('America/New_York')
    })

    it('reports the active status with its end and effects', async () => {
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

        const result = await userInfo.execute({}, mockCommsApi)

        expect(extractTextContent(result)).toMatch(
            /\*\*Language:\*\* en\n\*\*Status:\*\* 🏝️ On holiday\n\*\*Status Until:\*\* 2026-11-10T07:00:00\.000Z\n\*\*Status Effects:\*\* Comms notifications paused$/,
        )
        const structured = extractStructuredContent(result)
        expect(structured.status).toStrictEqual({
            message: 'On holiday',
            emoji: '🏝️',
            activeUntil: '2026-11-10T07:00:00.000Z',
            pauseNotifications: true,
            pauseActivity: false,
        })
        expect(UserInfoOutputSchema.safeParse(structured).success).toBe(true)
    })

    it('reports an end it cannot read as sent, rather than failing', async () => {
        mockCommsApi.users.getSessionUser.mockResolvedValue(
            createMockUser({ status: { message: 'Away', activeUntil: 'tomorrow' } }),
        )

        const result = await userInfo.execute({}, mockCommsApi)

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

        const result = await userInfo.execute({}, mockCommsApi)

        expect(extractTextContent(result)).toMatch(/\*\*Status:\*\* none$/)
        const structured = extractStructuredContent(result)
        expect(structured).not.toHaveProperty('status')
        expect(UserInfoOutputSchema.safeParse(structured).success).toBe(true)
    })

    it('should propagate API errors', async () => {
        const apiError = new Error(TEST_ERRORS.API_UNAUTHORIZED)
        mockCommsApi.users.getSessionUser.mockRejectedValue(apiError)

        await expect(userInfo.execute({}, mockCommsApi)).rejects.toThrow(
            TEST_ERRORS.API_UNAUTHORIZED,
        )
    })
})
