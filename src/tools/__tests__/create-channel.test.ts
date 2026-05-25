import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    createMockChannel,
    extractStructuredContent,
    extractTextContent,
    TEST_IDS,
} from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { createChannel } from '../create-channel.js'

const mockCommsApi = {
    channels: {
        createChannel: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { CREATE_CHANNEL } = ToolNames

describe(`${CREATE_CHANNEL} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should create a channel with optional fields', async () => {
        const mockChannel = createMockChannel({
            name: 'Engineering',
            description: 'Engineering discussions',
            userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
            public: false,
        })
        mockCommsApi.channels.createChannel.mockResolvedValue(mockChannel)

        const result = await createChannel.execute(
            {
                workspaceId: TEST_IDS.WORKSPACE_1,
                name: 'Engineering',
                description: 'Engineering discussions',
                public: false,
                userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
            },
            mockCommsApi,
        )

        expect(mockCommsApi.channels.createChannel).toHaveBeenCalledWith({
            workspaceId: TEST_IDS.WORKSPACE_1,
            name: 'Engineering',
            description: 'Engineering discussions',
            public: false,
            userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
        })

        const textContent = extractTextContent(result)
        expect(textContent).toContain('# Channel Created')
        expect(textContent).toContain('**Name:** Engineering')

        expect(extractStructuredContent(result)).toEqual({
            type: 'create_channel_result',
            success: true,
            channelId: TEST_IDS.CHANNEL_1,
            name: 'Engineering',
            workspaceId: TEST_IDS.WORKSPACE_1,
            description: 'Engineering discussions',
            public: false,
            archived: false,
            creator: TEST_IDS.USER_1,
            created: '2024-01-01T00:00:00.000Z',
            channelUrl: mockChannel.url,
            userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
        })
    })

    it('should create a channel with only required fields', async () => {
        mockCommsApi.channels.createChannel.mockResolvedValue(
            createMockChannel({
                name: 'General',
                description: null,
                userIds: null,
            }),
        )

        const result = await createChannel.execute(
            {
                workspaceId: TEST_IDS.WORKSPACE_1,
                name: 'General',
            },
            mockCommsApi,
        )

        expect(mockCommsApi.channels.createChannel).toHaveBeenCalledWith({
            workspaceId: TEST_IDS.WORKSPACE_1,
            name: 'General',
        })

        const structuredContent = extractStructuredContent(result)
        expect(structuredContent).toMatchObject({
            type: 'create_channel_result',
            channelId: TEST_IDS.CHANNEL_1,
            name: 'General',
        })
        expect(structuredContent).not.toHaveProperty('description')
        expect(structuredContent).not.toHaveProperty('userIds')
    })
})
