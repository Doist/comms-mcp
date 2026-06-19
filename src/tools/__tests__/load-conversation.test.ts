import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    createMockConversation,
    createMockConversationMessage,
    extractTextContent,
    TEST_IDS,
} from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { loadConversation } from '../load-conversation.js'

// Mock the Comms API
const mockCommsApi = {
    conversations: {
        getConversation: jest.fn(),
    },
    conversationMessages: {
        getMessages: jest.fn(),
    },
    workspaceUsers: {
        getUserById: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { LOAD_CONVERSATION } = ToolNames

const makeUser = (id: number, name: string) => ({
    id,
    fullName: name,
    shortName: name.split(' ')[0] ?? name,
    email: `${name.toLowerCase().replace(/\s/g, '')}@test.com`,
    userType: 'USER' as const,
    removed: false,
    timezone: 'UTC',
    version: 1,
})

describe(`${LOAD_CONVERSATION} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('loading conversations successfully', () => {
        it('should load conversation with messages and participants', async () => {
            const mockConversation = createMockConversation({
                userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
            })
            const mockMessages = [
                createMockConversationMessage({ id: TEST_IDS.MESSAGE_1 }),
                createMockConversationMessage({ id: TEST_IDS.MESSAGE_2 }),
            ]

            mockCommsApi.conversations.getConversation.mockResolvedValue(mockConversation)
            mockCommsApi.conversationMessages.getMessages.mockResolvedValue(mockMessages)
            mockCommsApi.workspaceUsers.getUserById.mockImplementation((async (args: {
                workspaceId: number
                userId: number
            }) => {
                if (args.userId === TEST_IDS.USER_1) {
                    return makeUser(TEST_IDS.USER_1, 'Test User 1')
                }
                return makeUser(TEST_IDS.USER_2, 'Test User 2')
            }) as never)

            const result = await loadConversation.execute(
                { conversationId: TEST_IDS.CONVERSATION_1, limit: 50, includeParticipants: true },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getConversation).toHaveBeenCalledWith(
                TEST_IDS.CONVERSATION_1,
            )
            expect(mockCommsApi.conversationMessages.getMessages).toHaveBeenCalledWith({
                conversationId: TEST_IDS.CONVERSATION_1,
                newerThan: undefined,
                olderThan: undefined,
                limit: 50,
            })
            expect(mockCommsApi.workspaceUsers.getUserById).toHaveBeenCalledWith({
                workspaceId: mockConversation.workspaceId,
                userId: TEST_IDS.USER_1,
            })
            expect(mockCommsApi.workspaceUsers.getUserById).toHaveBeenCalledWith({
                workspaceId: mockConversation.workspaceId,
                userId: TEST_IDS.USER_2,
            })

            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    type: 'conversation_data',
                    totalMessages: mockConversation.messageCount,
                }),
            )
            expect(structuredContent?.conversation.id).toBe(TEST_IDS.CONVERSATION_1)
            expect(structuredContent?.conversation.workspaceId).toBe(mockConversation.workspaceId)
            expect(structuredContent?.conversation.lastActive).toBe('2024-01-01T00:00:00.000Z')
            expect(structuredContent?.conversation.userIds).toEqual([
                TEST_IDS.USER_1,
                TEST_IDS.USER_2,
            ])
            expect(structuredContent?.messages).toHaveLength(2)
            const { messages } = structuredContent || {}
            if (messages?.[0]) {
                expect(messages[0].id).toBe(TEST_IDS.MESSAGE_1)
                expect(messages[0].posted).toBe('2024-01-01T00:00:00.000Z')
                expect(messages[0].creatorName).toBe('Test User 1')
            }
        })

        it('should load conversation without participants when includeParticipants is false', async () => {
            const mockConversation = createMockConversation({
                userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
            })
            mockCommsApi.conversations.getConversation.mockResolvedValue(mockConversation)
            mockCommsApi.conversationMessages.getMessages.mockResolvedValue([])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(
                makeUser(TEST_IDS.USER_1, 'Test User 1') as never,
            )

            const result = await loadConversation.execute(
                {
                    conversationId: TEST_IDS.CONVERSATION_1,
                    limit: 50,
                    includeParticipants: false,
                },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toMatchSnapshot()
            expect(textContent).not.toContain('## Participants')
        })

        it('should filter messages by date range', async () => {
            const mockConversation = createMockConversation()
            mockCommsApi.conversations.getConversation.mockResolvedValue(mockConversation)
            mockCommsApi.conversationMessages.getMessages.mockResolvedValue([])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(
                makeUser(TEST_IDS.USER_1, 'Test User 1') as never,
            )

            const result = await loadConversation.execute(
                {
                    conversationId: TEST_IDS.CONVERSATION_1,
                    newerThanDate: '2024-01-01',
                    olderThanDate: '2024-01-31',
                    limit: 50,
                    includeParticipants: true,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.conversationMessages.getMessages).toHaveBeenCalledWith(
                expect.objectContaining({
                    newerThan: expect.any(Date),
                    olderThan: expect.any(Date),
                }),
            )

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should handle conversation with no messages', async () => {
            const mockConversation = createMockConversation()
            mockCommsApi.conversations.getConversation.mockResolvedValue(mockConversation)
            mockCommsApi.conversationMessages.getMessages.mockResolvedValue([])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(
                makeUser(TEST_IDS.USER_1, 'Test User 1') as never,
            )

            const result = await loadConversation.execute(
                { conversationId: TEST_IDS.CONVERSATION_1, limit: 50, includeParticipants: true },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toMatchSnapshot()
        })
    })

    describe('attachments', () => {
        it('surfaces message attachments in structured + text output', async () => {
            const mockConversation = createMockConversation({
                userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
            })
            const sampleAttachment = {
                attachmentId: 'abc-123',
                fileName: 'report.pdf',
                fileSize: 4096,
                title: 'report.pdf',
                underlyingType: 'application/pdf',
                uploadState: 'uploaded',
                url: 'https://comms.todoist.com/files/abc/as/22222/report.pdf',
                urlType: 'file',
            }
            const mockMessage = createMockConversationMessage({
                id: TEST_IDS.MESSAGE_1,
                attachments: [sampleAttachment],
            })

            mockCommsApi.conversations.getConversation.mockResolvedValue(mockConversation)
            mockCommsApi.conversationMessages.getMessages.mockResolvedValue([mockMessage])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(
                makeUser(TEST_IDS.USER_1, 'Test User 1') as never,
            )

            const result = await loadConversation.execute(
                {
                    conversationId: TEST_IDS.CONVERSATION_1,
                    limit: 50,
                    includeParticipants: true,
                },
                mockCommsApi,
            )

            const { structuredContent } = result
            expect(structuredContent?.messages[0]?.attachments).toHaveLength(1)
            expect(structuredContent?.messages[0]?.attachments?.[0]).toMatchObject({
                fileName: 'report.pdf',
                url: sampleAttachment.url,
            })

            const text = extractTextContent(result)
            expect(text).toContain('**Attachments (1):**')
            expect(text).toContain('report.pdf')
            expect(text).toContain(sampleAttachment.url)
        })
    })

    describe('error handling', () => {
        it('should propagate conversation not found error', async () => {
            const apiError = new Error('Conversation not found')
            mockCommsApi.conversations.getConversation.mockRejectedValue(apiError)

            await expect(
                loadConversation.execute(
                    {
                        conversationId: TEST_IDS.CONVERSATION_1,
                        limit: 50,
                        includeParticipants: true,
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Conversation not found')
        })
    })
})
