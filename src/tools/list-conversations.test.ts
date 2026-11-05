import { type CommsApi, CommsRequestError, type SearchResult } from '@doist/comms-sdk'
import { vi } from 'vitest'
import {
    createMockConversation,
    extractStructuredContent,
    extractTextContent,
    TEST_ERRORS,
    TEST_IDS,
    usersByIds,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { listConversations } from './list-conversations.js'

const mockCommsApi = vi.mocked(
    {
        conversations: {
            getConversations: vi.fn(),
            getConversation: vi.fn(),
        },
        search: {
            search: vi.fn(),
        },
        workspaceUsers: {
            getUsersByIds: vi.fn(),
        },
    } as unknown as CommsApi,
    true,
)

const { LIST_CONVERSATIONS } = ToolNames

function createConversationHit(conversationId: string): SearchResult {
    return {
        id: `conversation_${conversationId}`,
        type: 'conversation',
        title: `Title ${conversationId}`,
        snippet: `Title ${conversationId}`,
        snippetCreatorId: TEST_IDS.USER_1,
        snippetLastUpdated: new Date('2024-01-01T00:00:00Z'),
        conversationId,
        userIds: [TEST_IDS.USER_1],
    }
}

function mockSearchHits(hits: SearchResult[], nextCursorMark?: string) {
    mockCommsApi.search.search.mockResolvedValue({
        items: hits,
        hasMore: nextCursorMark !== undefined,
        nextCursorMark,
        isPlanRestricted: false,
    })
}

describe(`${LIST_CONVERSATIONS} tool`, () => {
    beforeEach(() => {
        vi.clearAllMocks()
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
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds([
                    { id: TEST_IDS.USER_1, fullName: 'Alice Johnson' },
                    { id: TEST_IDS.USER_2, fullName: 'Bob Smith' },
                    { id: TEST_IDS.USER_3, fullName: 'Carol Davis' },
                ]),
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
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds([{ id: TEST_IDS.USER_1, fullName: 'Alice' }]),
            )

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
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds([{ id: TEST_IDS.USER_1, fullName: 'Alice' }]),
            )

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
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds([{ id: TEST_IDS.USER_1, fullName: 'Alice' }]),
            )

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
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds([{ id: TEST_IDS.USER_1, fullName: 'Alice' }]),
            )

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
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds([{ id: TEST_IDS.USER_1, fullName: 'Alice' }]),
            )

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
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds([{ id: TEST_IDS.USER_1, fullName: 'Alice' }]),
            )

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
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds([{ id: TEST_IDS.USER_1, fullName: 'Alice' }]),
            )

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.conversations[0]).toHaveProperty('conversationUrl', sdkUrl)
        })
    })

    describe('participant resolution', () => {
        it('should fall back to participant ID when name lookup fails, preserving alignment', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2] }),
            ])
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds([{ id: TEST_IDS.USER_2, fullName: 'Bob' }]),
            )

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain(`**Participants:** ${TEST_IDS.USER_1}, Bob`)

            // participantNames stays positionally aligned with userIds: the unresolved
            // first user falls back to its stringified ID, the second resolves to a name.
            const structuredContent = extractStructuredContent(result)
            const conversation = structuredContent.conversations[0] as {
                userIds: number[]
                participantNames: string[]
            }
            expect(conversation.userIds).toEqual([TEST_IDS.USER_1, TEST_IDS.USER_2])
            expect(conversation.participantNames).toEqual([String(TEST_IDS.USER_1), 'Bob'])
        })

        it('should cap displayed participants at five and summarize the rest', async () => {
            const userIds = [101, 102, 103, 104, 105, 106, 107]
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ id: TEST_IDS.CONVERSATION_1, userIds }),
            ])
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds(userIds.map((id) => ({ id, fullName: `User ${id}` }))),
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
            // Full participant set is retained so the true count isn't ambiguous...
            expect(conversation.userIds).toEqual([101, 102, 103, 104, 105, 106, 107])
            // ...but only the first five are resolved to names.
            expect(conversation.participantNames).toEqual([
                'User 101',
                'User 102',
                'User 103',
                'User 104',
                'User 105',
            ])

            // Only the five displayed participants are resolved, not all seven
            expect(mockCommsApi.workspaceUsers.getUsersByIds).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
                userIds: [101, 102, 103, 104, 105],
            })
        })

        it('should resolve participants across conversations in one request', async () => {
            const conversations = Array.from({ length: 25 }, (_, i) =>
                createMockConversation({ id: `conv-${i}`, userIds: [1000 + i] }),
            )
            mockCommsApi.conversations.getConversations.mockResolvedValue(conversations)
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds(
                    Array.from({ length: 25 }, (_, i) => ({
                        id: 1000 + i,
                        fullName: `User ${1000 + i}`,
                    })),
                ),
            )

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            expect(mockCommsApi.workspaceUsers.getUsersByIds).toHaveBeenCalledTimes(1)

            const textContent = extractTextContent(result)
            expect(textContent).toContain('User 1000')
            expect(textContent).toContain('User 1024')
        })
    })

    describe('includeArchived', () => {
        it('should only fetch active conversations by default', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation(),
            ])
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds([{ id: TEST_IDS.USER_1, fullName: 'Alice' }]),
            )

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
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds([{ id: TEST_IDS.USER_1, fullName: 'Alice' }]),
            )

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

    describe('searchText', () => {
        beforeEach(() => {
            mockCommsApi.workspaceUsers.getUsersByIds.mockImplementation(
                usersByIds([
                    { id: TEST_IDS.USER_1, fullName: 'Alice' },
                    { id: TEST_IDS.USER_2, fullName: 'Bob' },
                ]),
            )
        })

        it('should search conversations by title with the default limit', async () => {
            mockSearchHits([])

            await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'Outcasts' },
                mockCommsApi,
            )

            expect(mockCommsApi.search.search).toHaveBeenCalledWith({
                type: 'conversations',
                query: 'Outcasts',
                workspaceId: TEST_IDS.WORKSPACE_1,
                limit: 20,
            })
        })

        it('should return a hit that is not on the first list page', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ id: TEST_IDS.CONVERSATION_1, title: 'First page chat' }),
            ])
            mockSearchHits([createConversationHit(TEST_IDS.CONVERSATION_2)])
            mockCommsApi.conversations.getConversation.mockResolvedValue(
                createMockConversation({
                    id: TEST_IDS.CONVERSATION_2,
                    title: 'Outcasts',
                    userIds: [TEST_IDS.USER_1],
                    url: undefined,
                }),
            )

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'Outcasts' },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getConversations).not.toHaveBeenCalled()
            expect(mockCommsApi.conversations.getConversation).toHaveBeenCalledWith(
                TEST_IDS.CONVERSATION_2,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('Found 1 conversation in')
            expect(textContent).toContain('## [Outcasts]')
            expect(textContent).toContain('**Participants:** Alice')
            expect(textContent).not.toContain('First page chat')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent).toEqual({
                type: 'list_conversations',
                workspaceId: TEST_IDS.WORKSPACE_1,
                totalConversations: 1,
                hasMore: false,
                conversations: [
                    {
                        id: TEST_IDS.CONVERSATION_2,
                        workspaceId: TEST_IDS.WORKSPACE_1,
                        title: 'Outcasts',
                        userIds: [TEST_IDS.USER_1],
                        participantNames: ['Alice'],
                        archived: false,
                        lastActive: '2024-01-01T00:00:00.000Z',
                        conversationUrl: expect.stringContaining(`/msg/${TEST_IDS.CONVERSATION_2}`),
                    },
                ],
            })
        })

        it('should load a conversation once when several hits share it', async () => {
            mockSearchHits([
                createConversationHit(TEST_IDS.CONVERSATION_1),
                createConversationHit(TEST_IDS.CONVERSATION_1),
            ])
            mockCommsApi.conversations.getConversation.mockResolvedValue(
                createMockConversation({ id: TEST_IDS.CONVERSATION_1 }),
            )

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'Outcasts' },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getConversation).toHaveBeenCalledTimes(1)
            expect(extractStructuredContent(result).totalConversations).toBe(1)
        })

        it('should drop archived hits by default', async () => {
            mockSearchHits([
                createConversationHit(TEST_IDS.CONVERSATION_1),
                createConversationHit(TEST_IDS.CONVERSATION_2),
            ])
            mockCommsApi.conversations.getConversation.mockImplementation(async (id) =>
                createMockConversation({ id, archived: id === TEST_IDS.CONVERSATION_2 }),
            )

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'Outcasts' },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalConversations).toBe(1)
            expect(structuredContent.conversations).toEqual([
                expect.objectContaining({ id: TEST_IDS.CONVERSATION_1, archived: false }),
            ])
        })

        it('should keep archived hits when includeArchived is true', async () => {
            mockSearchHits([
                createConversationHit(TEST_IDS.CONVERSATION_1),
                createConversationHit(TEST_IDS.CONVERSATION_2),
            ])
            mockCommsApi.conversations.getConversation.mockImplementation(async (id) =>
                createMockConversation({ id, archived: id === TEST_IDS.CONVERSATION_2 }),
            )

            const result = await listConversations.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    searchText: 'Outcasts',
                    includeArchived: true,
                },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalConversations).toBe(2)
            expect(structuredContent.conversations).toEqual([
                expect.objectContaining({ id: TEST_IDS.CONVERSATION_1, archived: false }),
                expect.objectContaining({ id: TEST_IDS.CONVERSATION_2, archived: true }),
            ])
        })

        it('should drop a hit whose conversation no longer exists and log it', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
            mockSearchHits([
                createConversationHit(TEST_IDS.CONVERSATION_1),
                createConversationHit(TEST_IDS.CONVERSATION_2),
            ])
            mockCommsApi.conversations.getConversation.mockImplementation(async (id) => {
                if (id === TEST_IDS.CONVERSATION_1) {
                    throw new CommsRequestError('Not found', 404)
                }
                return createMockConversation({ id })
            })

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'Outcasts' },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalConversations).toBe(1)
            expect(structuredContent.conversations).toEqual([
                expect.objectContaining({ id: TEST_IDS.CONVERSATION_2 }),
            ])
            expect(consoleError).toHaveBeenCalledWith(
                `${LIST_CONVERSATIONS}: dropped search hits for missing conversations`,
                { dropped: 1, of: 2 },
            )

            consoleError.mockRestore()
        })

        it('should report no conversations when every hit no longer exists', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
            mockSearchHits([createConversationHit(TEST_IDS.CONVERSATION_1)])
            mockCommsApi.conversations.getConversation.mockRejectedValue(
                new CommsRequestError('Not found', 404),
            )

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'Outcasts' },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toContain('No conversations found.')
            consoleError.mockRestore()
        })

        it.each([
            ['an unauthorized request', new CommsRequestError('Unauthorized', 401)],
            ['a forbidden request', new CommsRequestError('Forbidden', 403)],
            ['a rate limit', new CommsRequestError('Too many requests', 429)],
            ['a server error', new CommsRequestError('Server error', 500)],
            ['a network failure', new Error('socket hang up')],
        ])('should surface %s from a lookup', async (_name, lookupError) => {
            mockSearchHits([createConversationHit(TEST_IDS.CONVERSATION_1)])
            mockCommsApi.conversations.getConversation.mockRejectedValue(lookupError)

            await expect(
                listConversations.execute(
                    { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'Outcasts' },
                    mockCommsApi,
                ),
            ).rejects.toThrow(lookupError.message)
        })

        it('should report no conversations when search has no hits', async () => {
            mockSearchHits([])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'Nothing' },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getConversation).not.toHaveBeenCalled()
            expect(extractTextContent(result)).toContain('No conversations found.')
            expect(extractStructuredContent(result)).toEqual({
                type: 'list_conversations',
                workspaceId: TEST_IDS.WORKSPACE_1,
                conversations: [],
                totalConversations: 0,
                hasMore: false,
            })
        })

        it('should not call search when searchText is absent', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation(),
            ])

            await listConversations.execute({ workspaceId: TEST_IDS.WORKSPACE_1 }, mockCommsApi)

            expect(mockCommsApi.search.search).not.toHaveBeenCalled()
            expect(mockCommsApi.conversations.getConversation).not.toHaveBeenCalled()
            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })
        })

        it('should list conversations when searchText is empty', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation(),
            ])

            await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: '' },
                mockCommsApi,
            )

            expect(mockCommsApi.search.search).not.toHaveBeenCalled()
            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledTimes(1)
        })

        it('should skip a hit with no conversation id', async () => {
            const hitWithoutConversationId = {
                ...createConversationHit(TEST_IDS.CONVERSATION_1),
                conversationId: null,
            } as unknown as SearchResult
            mockSearchHits([hitWithoutConversationId])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'Outcasts' },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getConversation).not.toHaveBeenCalled()
            expect(extractStructuredContent(result).totalConversations).toBe(0)
        })

        it('should pass limit and cursor to the search', async () => {
            mockSearchHits([])

            await listConversations.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    searchText: 'Outcasts',
                    limit: 5,
                    cursor: 'next-page',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.search.search).toHaveBeenCalledWith({
                type: 'conversations',
                query: 'Outcasts',
                workspaceId: TEST_IDS.WORKSPACE_1,
                limit: 5,
                cursor: 'next-page',
            })
        })

        it('should return the next cursor when more results are available', async () => {
            mockSearchHits([createConversationHit(TEST_IDS.CONVERSATION_1)], 'next-page')
            mockCommsApi.conversations.getConversation.mockResolvedValue(
                createMockConversation({ id: TEST_IDS.CONVERSATION_1 }),
            )

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'Outcasts' },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toContain('More results available.')
            expect(extractStructuredContent(result)).toMatchObject({
                hasMore: true,
                cursor: 'next-page',
            })
        })

        it('should keep the cursor when a page has only archived hits', async () => {
            mockSearchHits([createConversationHit(TEST_IDS.CONVERSATION_1)], 'next-page')
            mockCommsApi.conversations.getConversation.mockResolvedValue(
                createMockConversation({ id: TEST_IDS.CONVERSATION_1, archived: true }),
            )

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'Outcasts' },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toContain('More results available.')
            expect(extractStructuredContent(result)).toMatchObject({
                totalConversations: 0,
                hasMore: true,
                cursor: 'next-page',
            })
        })

        it('should leave paging fields out without searchText', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent).not.toHaveProperty('hasMore')
            expect(structuredContent).not.toHaveProperty('cursor')
        })

        it.each([
            ['limit', { limit: 5 }],
            ['cursor', { cursor: 'next-page' }],
        ])('should reject %s without searchText', async (_name, paging) => {
            await expect(
                listConversations.execute(
                    { workspaceId: TEST_IDS.WORKSPACE_1, ...paging },
                    mockCommsApi,
                ),
            ).rejects.toThrow('`limit` and `cursor` require `searchText`.')
        })

        it('should propagate search errors', async () => {
            mockCommsApi.search.search.mockRejectedValue(new Error(TEST_ERRORS.API_UNAUTHORIZED))

            await expect(
                listConversations.execute(
                    { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'Outcasts' },
                    mockCommsApi,
                ),
            ).rejects.toThrow(TEST_ERRORS.API_UNAUTHORIZED)
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
