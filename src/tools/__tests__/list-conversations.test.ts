import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    createMockConversation,
    extractStructuredContent,
    extractTextContent,
    TEST_ERRORS,
    TEST_IDS,
} from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { listConversations } from '../list-conversations.js'

const mockCommsApi = {
    conversations: {
        getConversations: jest.fn(),
    },
    workspaceUsers: {
        getUserById: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { LIST_CONVERSATIONS } = ToolNames

describe(`${LIST_CONVERSATIONS} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('listing conversations', () => {
        it('should list all conversations in a workspace', async () => {
            const mockConversations = [
                createMockConversation({
                    id: TEST_IDS.CONVERSATION_1,
                    title: 'Project Discussion',
                    userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                }),
                createMockConversation({
                    id: TEST_IDS.CONVERSATION_2,
                    title: 'Design Review',
                    userIds: [TEST_IDS.USER_1, TEST_IDS.USER_3],
                }),
            ]

            mockCommsApi.conversations.getConversations.mockResolvedValue(mockConversations)
            mockCommsApi.workspaceUsers.getUserById.mockImplementation(
                async (args: { workspaceId: number; userId: number }) => {
                    if (args.userId === TEST_IDS.USER_1)
                        return { fullName: 'Alice Johnson' } as never
                    if (args.userId === TEST_IDS.USER_2) return { fullName: 'Bob Smith' } as never
                    if (args.userId === TEST_IDS.USER_3) return { fullName: 'Carol Davis' } as never
                    throw new Error('User not found')
                },
            )

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })

            const textContent = extractTextContent(result)
            expect(textContent).toContain('Found 2 conversations')
            expect(textContent).toContain('## [Project Discussion]')
            expect(textContent).toContain('## [Design Review]')
            expect(textContent).toContain('Alice Johnson')
            expect(textContent).toContain('Bob Smith')
            expect(textContent).toContain('Carol Davis')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent).toEqual({
                type: 'list_conversations',
                workspaceId: TEST_IDS.WORKSPACE_1,
                totalConversations: 2,
                conversations: expect.arrayContaining([
                    expect.objectContaining({
                        id: TEST_IDS.CONVERSATION_1,
                        title: 'Project Discussion',
                        userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                        participantNames: ['Alice Johnson', 'Bob Smith'],
                        archived: false,
                    }),
                    expect.objectContaining({
                        id: TEST_IDS.CONVERSATION_2,
                        title: 'Design Review',
                        userIds: [TEST_IDS.USER_1, TEST_IDS.USER_3],
                        participantNames: ['Alice Johnson', 'Carol Davis'],
                    }),
                ]),
            })
        })

        it('should handle empty conversation list', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('No conversations found.')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent).toEqual({
                type: 'list_conversations',
                workspaceId: TEST_IDS.WORKSPACE_1,
                conversations: [],
                totalConversations: 0,
            })
        })

        it('should handle single conversation', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation(),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('Found 1 conversation in')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalConversations).toBe(1)
        })
    })

    describe('conversation details', () => {
        it('should fall back to "Conversation <id>" heading when title is missing', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ title: undefined }),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain(`## [Conversation ${TEST_IDS.CONVERSATION_1}]`)

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.conversations[0]).not.toHaveProperty('title')
        })

        it('should include snippet when present', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ snippet: 'Last message preview' }),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Snippet:** Last message preview')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.conversations[0]).toHaveProperty(
                'snippet',
                'Last message preview',
            )
        })

        it('should omit snippet when empty', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ snippet: '' }),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).not.toContain('**Snippet:**')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.conversations[0]).not.toHaveProperty('snippet')
        })

        it('should show archived status', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ archived: true }),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Archived:** Yes')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.conversations[0].archived).toBe(true)
        })

        it('should generate a conversation URL when the SDK does not provide one', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ url: undefined }),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            const conversation = structuredContent.conversations[0] as { conversationUrl: string }
            expect(conversation.conversationUrl).toContain(`/msg/${TEST_IDS.CONVERSATION_1}`)
        })

        it('should use the SDK-provided URL when present', async () => {
            const sdkUrl = 'https://comms.todoist.com/11111/msg/conv-id-99/'
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ url: sdkUrl }),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.conversations[0]).toHaveProperty('conversationUrl', sdkUrl)
        })
    })

    describe('participant resolution', () => {
        it('should deduplicate participant lookups across conversations', async () => {
            const mockConversations = [
                createMockConversation({
                    id: TEST_IDS.CONVERSATION_1,
                    userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                }),
                createMockConversation({
                    id: TEST_IDS.CONVERSATION_2,
                    userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                }),
            ]

            mockCommsApi.conversations.getConversations.mockResolvedValue(mockConversations)
            mockCommsApi.workspaceUsers.getUserById.mockImplementation(
                async (args: { workspaceId: number; userId: number }) => {
                    if (args.userId === TEST_IDS.USER_1) return { fullName: 'Alice' } as never
                    if (args.userId === TEST_IDS.USER_2) return { fullName: 'Bob' } as never
                    throw new Error('User not found')
                },
            )

            await listConversations.execute({ workspaceId: TEST_IDS.WORKSPACE_1 }, mockCommsApi)

            // Should only fetch 2 unique participants, not 4
            expect(mockCommsApi.workspaceUsers.getUserById).toHaveBeenCalledTimes(2)
        })

        it('should fall back to participant ID when name lookup fails', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ userIds: [TEST_IDS.USER_1] }),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockRejectedValue(new Error('User not found'))

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain(`**Participants:** ${TEST_IDS.USER_1}`)

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.conversations[0]).not.toHaveProperty('participantNames')
        })

        it('should cap displayed participants at five and summarize the rest', async () => {
            const userIds = [101, 102, 103, 104, 105, 106, 107]
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ id: TEST_IDS.CONVERSATION_1, userIds }),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockImplementation(
                async (args: { workspaceId: number; userId: number }) =>
                    ({ fullName: `User ${args.userId}` }) as never,
            )

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain(
                '**Participants:** User 101, User 102, User 103, User 104, User 105, and 2 more',
            )
            expect(textContent).not.toContain('User 106')

            const structuredContent = extractStructuredContent(result)
            const conversation = structuredContent.conversations[0] as {
                userIds: number[]
                participantNames: string[]
            }
            expect(conversation.userIds).toEqual([101, 102, 103, 104, 105])
            expect(conversation.participantNames).toEqual([
                'User 101',
                'User 102',
                'User 103',
                'User 104',
                'User 105',
            ])

            // Only the five displayed participants are resolved, not all seven
            expect(mockCommsApi.workspaceUsers.getUserById).toHaveBeenCalledTimes(5)
        })
    })

    describe('includeArchived', () => {
        it('should only fetch active conversations by default', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation(),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            await listConversations.execute({ workspaceId: TEST_IDS.WORKSPACE_1 }, mockCommsApi)

            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })
        })

        it('should fetch active and archived conversations in parallel when includeArchived is true', async () => {
            const activeConversation = createMockConversation({
                id: TEST_IDS.CONVERSATION_1,
                title: 'Active Chat',
            })
            const archivedConversation = createMockConversation({
                id: TEST_IDS.CONVERSATION_2,
                title: 'Archived Chat',
                archived: true,
            })

            mockCommsApi.conversations.getConversations.mockImplementation(async (args) => {
                if ('archived' in args && args.archived === true) {
                    return [archivedConversation]
                }
                return [activeConversation]
            })
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, includeArchived: true },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledTimes(2)
            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })
            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
                archived: true,
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalConversations).toBe(2)
            expect(structuredContent.conversations).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ title: 'Active Chat', archived: false }),
                    expect.objectContaining({ title: 'Archived Chat', archived: true }),
                ]),
            )
        })
    })

    describe('error handling', () => {
        it('should propagate API errors', async () => {
            const apiError = new Error(TEST_ERRORS.API_UNAUTHORIZED)
            mockCommsApi.conversations.getConversations.mockRejectedValue(apiError)

            await expect(
                listConversations.execute({ workspaceId: TEST_IDS.WORKSPACE_1 }, mockCommsApi),
            ).rejects.toThrow(TEST_ERRORS.API_UNAUTHORIZED)
        })
    })
})
