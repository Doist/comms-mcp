import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    createMockConversation,
    createMockConversationMessage,
    extractStructuredContent,
    extractTextContent,
    TEST_IDS,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { createConversation } from './create-conversation.js'

const mockCommsApi = {
    conversations: {
        getOrCreateConversation: jest.fn(),
    },
    conversationMessages: {
        createMessage: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { CREATE_CONVERSATION } = ToolNames

describe(`${CREATE_CONVERSATION} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('creating conversations', () => {
        it('should start a conversation and post the initial message', async () => {
            const mockConversation = createMockConversation({
                userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
            })
            const mockMessage = createMockConversationMessage({
                content: 'Hello there',
            })
            mockCommsApi.conversations.getOrCreateConversation.mockResolvedValue(mockConversation)
            mockCommsApi.conversationMessages.createMessage.mockResolvedValue(mockMessage)

            const result = await createConversation.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    recipients: [TEST_IDS.USER_2],
                    content: 'Hello there',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getOrCreateConversation).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
                userIds: [TEST_IDS.USER_2],
            })
            expect(mockCommsApi.conversationMessages.createMessage).toHaveBeenCalledWith({
                conversationId: mockConversation.id,
                content: 'Hello there',
            })

            expect(extractTextContent(result)).toMatchSnapshot()

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    type: 'create_conversation_result',
                    success: true,
                    conversationId: mockConversation.id,
                    messageId: mockMessage.id,
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    content: 'Hello there',
                    recipients: [TEST_IDS.USER_2],
                    participants: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                    conversationUrl: expect.stringContaining('comms.todoist.com'),
                    messageUrl: expect.stringContaining('comms.todoist.com'),
                }),
            )
        })

        it('should start a group conversation with multiple recipients', async () => {
            const mockConversation = createMockConversation({
                userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2, TEST_IDS.USER_3],
            })
            const mockMessage = createMockConversationMessage({ content: 'Group hello' })
            mockCommsApi.conversations.getOrCreateConversation.mockResolvedValue(mockConversation)
            mockCommsApi.conversationMessages.createMessage.mockResolvedValue(mockMessage)

            const result = await createConversation.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    recipients: [TEST_IDS.USER_2, TEST_IDS.USER_3],
                    content: 'Group hello',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getOrCreateConversation).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
                userIds: [TEST_IDS.USER_2, TEST_IDS.USER_3],
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.participants).toEqual([
                TEST_IDS.USER_1,
                TEST_IDS.USER_2,
                TEST_IDS.USER_3,
            ])
            expect(structuredContent.recipients).toEqual([TEST_IDS.USER_2, TEST_IDS.USER_3])
        })

        it('should fall back to a generated URL when the SDK omits one', async () => {
            const mockConversation = createMockConversation({ url: undefined })
            const mockMessage = createMockConversationMessage({ url: undefined })
            mockCommsApi.conversations.getOrCreateConversation.mockResolvedValue(mockConversation)
            mockCommsApi.conversationMessages.createMessage.mockResolvedValue(mockMessage)

            const result = await createConversation.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    recipients: [TEST_IDS.USER_2],
                    content: 'No URLs from SDK',
                },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.conversationUrl).toContain('comms.todoist.com')
            expect(structuredContent.messageUrl).toContain('comms.todoist.com')
        })
    })

    describe('error handling', () => {
        it('should propagate errors from getOrCreateConversation', async () => {
            mockCommsApi.conversations.getOrCreateConversation.mockRejectedValue(
                new Error('Workspace not found'),
            )

            await expect(
                createConversation.execute(
                    {
                        workspaceId: TEST_IDS.WORKSPACE_1,
                        recipients: [TEST_IDS.USER_2],
                        content: 'Test content',
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Workspace not found')

            expect(mockCommsApi.conversationMessages.createMessage).not.toHaveBeenCalled()
        })

        it('should propagate errors from createMessage', async () => {
            const mockConversation = createMockConversation()
            mockCommsApi.conversations.getOrCreateConversation.mockResolvedValue(mockConversation)
            mockCommsApi.conversationMessages.createMessage.mockRejectedValue(
                new Error('Message rejected'),
            )

            await expect(
                createConversation.execute(
                    {
                        workspaceId: TEST_IDS.WORKSPACE_1,
                        recipients: [TEST_IDS.USER_2],
                        content: 'Test content',
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Message rejected')
        })
    })
})
