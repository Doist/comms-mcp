import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    createMockConversation,
    extractStructuredContent,
    extractTextContent,
    TEST_ERRORS,
    TEST_IDS,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { listConversations } from './list-conversations.js'

const mockCommsApi = {
    conversations: {
        getConversations: jest.fn(),
    },
    workspaceUsers: {
        getUserById: jest.fn(),
        getWorkspaceUsers: jest.fn(),
    },
    users: {
        getSessionUser: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { LIST_CONVERSATIONS } = ToolNames

describe(`${LIST_CONVERSATIONS} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockCommsApi.users.getSessionUser.mockResolvedValue({ id: TEST_IDS.USER_1 } as never)
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
                archived: false,
                limit: 50,
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
                hasMore: false,
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
                hasMore: false,
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

        it('should fall back to participant ID when name lookup fails, preserving alignment', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2] }),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockImplementation(
                async (args: { workspaceId: number; userId: number }) => {
                    if (args.userId === TEST_IDS.USER_2) return { fullName: 'Bob' } as never
                    throw new Error('User not found')
                },
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
            expect(mockCommsApi.workspaceUsers.getUserById).toHaveBeenCalledTimes(5)
        })

        it('should fetch the workspace roster once instead of per-user above the threshold', async () => {
            // 25 conversations each with a distinct single participant → 25 unique IDs,
            // above PARTICIPANT_ROSTER_THRESHOLD, so a single roster fetch is used.
            const conversations = Array.from({ length: 25 }, (_, i) =>
                createMockConversation({ id: `conv-${i}`, userIds: [1000 + i] }),
            )
            mockCommsApi.conversations.getConversations.mockResolvedValue(conversations)
            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue(
                Array.from({ length: 25 }, (_, i) => ({
                    id: 1000 + i,
                    fullName: `User ${1000 + i}`,
                })) as never,
            )

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            expect(mockCommsApi.workspaceUsers.getWorkspaceUsers).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.workspaceUsers.getWorkspaceUsers).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })
            expect(mockCommsApi.workspaceUsers.getUserById).not.toHaveBeenCalled()

            const textContent = extractTextContent(result)
            expect(textContent).toContain('User 1000')
            expect(textContent).toContain('User 1024')
        })
    })

    describe('includeArchived', () => {
        it('should request only active conversations by default', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation(),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            await listConversations.execute({ workspaceId: TEST_IDS.WORKSPACE_1 }, mockCommsApi)

            // `archived: false` is sent explicitly: omitting it returns the server's
            // unfiltered stream, which includes archived conversations.
            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
                archived: false,
                limit: 50,
            })
        })

        it('should fetch one combined stream when includeArchived is true', async () => {
            const activeConversation = createMockConversation({
                id: TEST_IDS.CONVERSATION_1,
                title: 'Active Chat',
            })
            const archivedConversation = createMockConversation({
                id: TEST_IDS.CONVERSATION_2,
                title: 'Archived Chat',
                archived: true,
            })

            mockCommsApi.conversations.getConversations.mockResolvedValue([
                activeConversation,
                archivedConversation,
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, includeArchived: true },
                mockCommsApi,
            )

            // Omitting `archived` returns both states in a single stream, which keeps
            // one cursor. Two filtered requests would need two, and concatenating them
            // would double-count archived rows.
            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
                limit: 50,
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

    describe('pagination', () => {
        it('should report hasMore and return a cursor when the page is full', async () => {
            const page = Array.from({ length: 3 }, (_, i) =>
                createMockConversation({
                    id: `conv-${i}`,
                    userIds: [TEST_IDS.USER_1],
                    lastActive: new Date(`2024-01-0${i + 1}T00:00:00Z`),
                }),
            )
            mockCommsApi.conversations.getConversations.mockResolvedValue(page)
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, limit: 3 },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.hasMore).toBe(true)
            expect(structuredContent.cursor).toEqual(expect.any(String))

            const textContent = extractTextContent(result)
            expect(textContent).toContain('More results available.')
        })

        it('should not report hasMore when the page is short', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation(),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, limit: 50 },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.hasMore).toBe(false)
            expect(structuredContent).not.toHaveProperty('cursor')
            expect(extractTextContent(result)).not.toContain('More results available.')
        })

        it('should resume from a returned cursor via the compound (lastActive, id) key', async () => {
            const boundary = createMockConversation({
                id: 'conv-boundary',
                userIds: [TEST_IDS.USER_1],
                lastActive: new Date('2024-03-04T05:06:07Z'),
            })
            mockCommsApi.conversations.getConversations.mockResolvedValue([boundary])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const first = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, limit: 1 },
                mockCommsApi,
            )
            const cursor = extractStructuredContent(first).cursor as string

            await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, limit: 1, cursor },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getConversations).toHaveBeenLastCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
                archived: false,
                limit: 1,
                olderThan: new Date('2024-03-04T05:06:07Z'),
                beforeId: 'conv-boundary',
            })
        })

        it('should reject a malformed cursor rather than silently restarting', async () => {
            await expect(
                listConversations.execute(
                    { workspaceId: TEST_IDS.WORKSPACE_1, cursor: 'not-a-real-cursor' },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Invalid cursor')

            expect(mockCommsApi.conversations.getConversations).not.toHaveBeenCalled()
        })
    })

    describe('participant filtering', () => {
        const alice = TEST_IDS.USER_1
        const bob = TEST_IDS.USER_2
        const carol = TEST_IDS.USER_3

        beforeEach(() => {
            mockCommsApi.workspaceUsers.getUserById.mockImplementation(
                async (args: { workspaceId: number; userId: number }) =>
                    ({ fullName: `User ${args.userId}` }) as never,
            )
        })

        it('should find the group conversation with exactly the given participants', async () => {
            const groupWithBobAndCarol = createMockConversation({
                id: 'conv-group',
                userIds: [alice, bob, carol],
            })
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ id: 'conv-bob', userIds: [alice, bob] }),
                createMockConversation({ id: 'conv-bigger', userIds: [alice, bob, carol, 99999] }),
                groupWithBobAndCarol,
            ])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [bob, carol] },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalConversations).toBe(1)
            expect(structuredContent.conversations[0]).toMatchObject({ id: 'conv-group' })
        })

        it('should resume a capped includes scan from the matched row, not the end of its page', async () => {
            // Three rows in one page, two of them matches, limit 1. Resuming from the
            // end of the page would skip conv-middle and conv-last entirely.
            const firstMatch = createMockConversation({
                id: 'conv-first',
                userIds: [alice, bob],
                lastActive: new Date('2024-05-01T00:00:00Z'),
            })
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                firstMatch,
                createMockConversation({
                    id: 'conv-middle',
                    userIds: [alice, carol],
                    lastActive: new Date('2024-05-02T00:00:00Z'),
                }),
                createMockConversation({
                    id: 'conv-last',
                    userIds: [alice, bob],
                    lastActive: new Date('2024-05-03T00:00:00Z'),
                }),
            ])

            const first = await listConversations.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    userIds: [bob],
                    matchMode: 'includes',
                    limit: 1,
                },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(first)
            expect(structuredContent.hasMore).toBe(true)

            await listConversations.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    userIds: [bob],
                    matchMode: 'includes',
                    limit: 1,
                    cursor: structuredContent.cursor as string,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getConversations).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    olderThan: new Date('2024-05-01T00:00:00Z'),
                    beforeId: 'conv-first',
                }),
            )
        })

        it('should keep scanning past a page shorter than the requested size', async () => {
            // The server may cap the page below what we asked for. Treating a short
            // page as the end of the list would stop every scan at the first page.
            const target = createMockConversation({ id: 'conv-target', userIds: [alice, bob] })

            mockCommsApi.conversations.getConversations
                .mockResolvedValueOnce([
                    createMockConversation({ id: 'conv-other', userIds: [alice, carol] }),
                ])
                .mockResolvedValueOnce([target])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [bob] },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledTimes(2)
            expect(extractStructuredContent(result).conversations[0]).toMatchObject({
                id: 'conv-target',
            })
        })

        it('should match participants regardless of order', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ id: 'conv-group', userIds: [carol, alice, bob] }),
            ])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [bob, carol] },
                mockCommsApi,
            )

            expect(extractStructuredContent(result).totalConversations).toBe(1)
        })

        it('should find the conversation containing only the session user for an empty array', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ id: 'conv-bob', userIds: [alice, bob] }),
                createMockConversation({ id: 'conv-self', userIds: [alice] }),
            ])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [] },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalConversations).toBe(1)
            expect(structuredContent.conversations[0]).toMatchObject({ id: 'conv-self' })
        })

        it('should return every conversation containing the participants in includes mode', async () => {
            mockCommsApi.conversations.getConversations
                .mockResolvedValueOnce([
                    createMockConversation({ id: 'conv-bob', userIds: [alice, bob] }),
                    createMockConversation({ id: 'conv-group', userIds: [alice, bob, carol] }),
                    createMockConversation({ id: 'conv-carol', userIds: [alice, carol] }),
                ])
                .mockResolvedValueOnce([])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [bob], matchMode: 'includes' },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalConversations).toBe(2)
            expect(structuredContent.conversations).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: 'conv-bob' }),
                    expect.objectContaining({ id: 'conv-group' }),
                ]),
            )
        })

        it('should walk past the first page to reach a match further down', async () => {
            // A full first page forces a second request; the match only appears there.
            const firstPage = Array.from({ length: 500 }, (_, i) =>
                createMockConversation({
                    id: `filler-${i}`,
                    userIds: [alice, 90000 + i],
                    lastActive: new Date(2024, 0, 1, 0, 0, i),
                }),
            )
            const target = createMockConversation({ id: 'conv-target', userIds: [alice, bob] })

            mockCommsApi.conversations.getConversations
                .mockResolvedValueOnce(firstPage)
                .mockResolvedValueOnce([target])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [bob] },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.getConversations).toHaveBeenCalledTimes(2)
            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.conversations[0]).toMatchObject({ id: 'conv-target' })
        })

        it('should report no match distinctly from an empty workspace', async () => {
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ id: 'conv-bob', userIds: [alice, bob] }),
            ])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [carol] },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toContain(
                'No conversation matches those participants',
            )
            expect(extractStructuredContent(result).totalConversations).toBe(0)
        })

        it('should throw when a server-capped page repeats, not report no match', async () => {
            // The server may cap pages well below SCAN_PAGE_SIZE. If a capped page
            // comes back unchanged the cursor is stuck, and returning "no match" would
            // be indistinguishable from the conversation genuinely not existing.
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ id: 'conv-a', userIds: [alice, carol] }),
                createMockConversation({ id: 'conv-b', userIds: [alice, 90001] }),
            ])

            await expect(
                listConversations.execute(
                    { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [bob] },
                    mockCommsApi,
                ),
            ).rejects.toThrow('cursor is not advancing')
        })

        it('should treat a lone repeated boundary row as the end of the list', async () => {
            // Some servers echo the cursor's own row back as the final page. That is
            // exhaustion, not a stall, and must not throw.
            const only = createMockConversation({ id: 'conv-only', userIds: [alice, carol] })
            mockCommsApi.conversations.getConversations.mockResolvedValue([only])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [bob] },
                mockCommsApi,
            )

            expect(extractStructuredContent(result).totalConversations).toBe(0)
        })

        it('should not match every conversation for an empty userIds in includes mode', async () => {
            // `every` over an empty array is vacuously true, so an unguarded includes
            // matcher would return the whole workspace here.
            mockCommsApi.conversations.getConversations.mockResolvedValue([
                createMockConversation({ id: 'conv-bob', userIds: [alice, bob] }),
                createMockConversation({ id: 'conv-self', userIds: [alice] }),
            ])

            const result = await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [], matchMode: 'includes' },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalConversations).toBe(1)
            expect(structuredContent.conversations[0]).toMatchObject({ id: 'conv-self' })
        })

        it('should not resolve the session user for an includes query that does not need it', async () => {
            mockCommsApi.conversations.getConversations
                .mockResolvedValueOnce([
                    createMockConversation({ id: 'conv-bob', userIds: [alice, bob] }),
                ])
                .mockResolvedValueOnce([])

            await listConversations.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [bob], matchMode: 'includes' },
                mockCommsApi,
            )

            expect(mockCommsApi.users.getSessionUser).not.toHaveBeenCalled()
        })

        it('should throw rather than truncate when the cursor stops advancing', async () => {
            // A full page of already-seen rows means the cursor is stuck. Returning
            // what we have would look identical to "no such conversation".
            const stuckPage = Array.from({ length: 500 }, (_, i) =>
                createMockConversation({
                    id: `filler-${i}`,
                    userIds: [alice, 90000 + i],
                    lastActive: new Date(2024, 0, 1, 0, 0, i),
                }),
            )
            mockCommsApi.conversations.getConversations.mockResolvedValue(stuckPage)

            await expect(
                listConversations.execute(
                    { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [bob] },
                    mockCommsApi,
                ),
            ).rejects.toThrow('results would be incomplete')
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
