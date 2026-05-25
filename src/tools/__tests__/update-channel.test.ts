import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    createMockChannel,
    extractStructuredContent,
    extractTextContent,
    TEST_IDS,
} from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { updateChannel } from '../update-channel.js'

const mockCommsApi = {
    channels: {
        updateChannel: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { UPDATE_CHANNEL } = ToolNames

describe(`${UPDATE_CHANNEL} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should update channel fields', async () => {
        const channel = createMockChannel({
            name: 'Engineering',
            description: 'Engineering discussions',
            public: false,
            userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
        })
        mockCommsApi.channels.updateChannel.mockResolvedValue(channel)

        const result = await updateChannel.execute(
            {
                channelId: TEST_IDS.CHANNEL_1,
                name: 'Engineering',
                description: 'Engineering discussions',
                public: false,
            },
            mockCommsApi,
        )

        expect(mockCommsApi.channels.updateChannel).toHaveBeenCalledWith({
            id: TEST_IDS.CHANNEL_1,
            name: 'Engineering',
            description: 'Engineering discussions',
            public: false,
        })

        expect(extractTextContent(result)).toContain('# Channel Updated')
        expect(extractStructuredContent(result)).toEqual({
            type: 'update_channel_result',
            success: true,
            channelId: TEST_IDS.CHANNEL_1,
            name: 'Engineering',
            workspaceId: TEST_IDS.WORKSPACE_1,
            description: 'Engineering discussions',
            public: false,
            archived: false,
            creator: TEST_IDS.USER_1,
            created: '2024-01-01T00:00:00.000Z',
            channelUrl: channel.url,
            userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
        })
    })

    it('should clear description without replaying the channel name', async () => {
        const channel = createMockChannel({ name: 'Engineering', description: null })
        delete (channel as { url?: string }).url
        mockCommsApi.channels.updateChannel.mockResolvedValue(channel)

        const result = await updateChannel.execute(
            {
                channelId: TEST_IDS.CHANNEL_1,
                description: null,
            },
            mockCommsApi,
        )

        expect(mockCommsApi.channels.updateChannel).toHaveBeenCalledWith({
            id: TEST_IDS.CHANNEL_1,
            description: null,
        })

        const structuredContent = extractStructuredContent(result)
        expect(structuredContent).not.toHaveProperty('description')
        expect(structuredContent.channelUrl).toContain(`/ch/${TEST_IDS.CHANNEL_1}`)
    })

    it('should reject empty updates', async () => {
        await expect(
            updateChannel.execute({ channelId: TEST_IDS.CHANNEL_1 }, mockCommsApi),
        ).rejects.toThrow('At least one of `name`, `description`, or `public` must be provided.')

        expect(mockCommsApi.channels.updateChannel).not.toHaveBeenCalled()
    })
})
