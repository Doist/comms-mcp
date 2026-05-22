import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import { extractTextContent, TEST_IDS } from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { fetchInbox } from '../fetch-inbox.js'

// Mock the Comms API
const mockCommsApi = {
    inbox: {
        getInbox: jest.fn(),
        getCount: jest.fn(),
    },
    threads: {
        getUnread: jest.fn(),
    },
    conversations: {
        getUnread: jest.fn(),
        getConversation: jest.fn(),
    },
    channels: {
        getChannel: jest.fn(),
    },
    workspaceUsers: {
        getUserById: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { FETCH_INBOX } = ToolNames

function makeInboxThread(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: TEST_IDS.THREAD_1,
        title: 'Test Thread',
        content: 'Thread content',
        creator: TEST_IDS.USER_1,
        channelId: TEST_IDS.CHANNEL_1,
        workspaceId: TEST_IDS.WORKSPACE_1,
        commentCount: 0,
        lastUpdated: new Date(),
        posted: new Date(),
        snippet: 'snippet',
        snippetCreator: TEST_IDS.USER_1,
        isSaved: false,
        pinned: false,
        isArchived: false,
        inInbox: true,
        closed: false,
        url: `https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/t/${TEST_IDS.THREAD_1}/`,
        ...overrides,
    }
}

function makeChannel(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: TEST_IDS.CHANNEL_1,
        name: 'Test Channel',
        workspaceId: TEST_IDS.WORKSPACE_1,
        created: new Date(),
        archived: false,
        public: true,
        color: 0,
        creator: TEST_IDS.USER_1,
        version: 1,
        ...overrides,
    }
}

describe(`${FETCH_INBOX} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('fetching inbox successfully', () => {
        it('should fetch inbox with threads', async () => {
            mockCommsApi.inbox.getInbox.mockResolvedValue([
                makeInboxThread({ id: TEST_IDS.THREAD_1, title: 'Test Thread 1', commentCount: 3 }),
                makeInboxThread({
                    id: TEST_IDS.THREAD_2,
                    title: 'Test Thread 2',
                    creator: TEST_IDS.USER_2,
                    snippetCreator: TEST_IDS.USER_2,
                    isSaved: true,
                    url: `https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/t/${TEST_IDS.THREAD_2}/`,
                }),
            ])
            mockCommsApi.inbox.getCount.mockResolvedValue(5)
            mockCommsApi.threads.getUnread.mockResolvedValue({
                data: [
                    {
                        threadId: TEST_IDS.THREAD_1,
                        channelId: TEST_IDS.CHANNEL_1,
                        objIndex: 100,
                        directMention: false,
                    },
                ],
                version: 1,
            })
            mockCommsApi.conversations.getUnread.mockResolvedValue({ data: [], version: 1 })
            mockCommsApi.channels.getChannel.mockResolvedValue(makeChannel())

            const result = await fetchInbox.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, limit: 50, onlyUnread: false },
                mockCommsApi,
            )

            expect(mockCommsApi.inbox.getInbox).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
                newerThan: undefined,
                olderThan: undefined,
                limit: 50,
                archiveFilter: 'active',
            })
            expect(mockCommsApi.inbox.getCount).toHaveBeenCalledWith(TEST_IDS.WORKSPACE_1)
            expect(mockCommsApi.threads.getUnread).toHaveBeenCalledWith(TEST_IDS.WORKSPACE_1)
            expect(mockCommsApi.conversations.getUnread).toHaveBeenCalledWith(TEST_IDS.WORKSPACE_1)
            expect(mockCommsApi.channels.getChannel).toHaveBeenCalledWith(TEST_IDS.CHANNEL_1)
            // Two threads share a channel — verify we hit `getChannel` once,
            // not per-thread, so the inbox stays cheap as it scales.
            expect(mockCommsApi.channels.getChannel).toHaveBeenCalledTimes(1)

            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    type: 'inbox_data',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    unreadCount: 1,
                    totalThreads: 2,
                    totalConversations: 0,
                }),
            )
            expect(structuredContent?.threads).toHaveLength(2)
            expect(structuredContent?.conversations).toHaveLength(0)
            const { threads } = structuredContent || {}
            if (threads?.[0] && threads[1]) {
                expect(threads[0].id).toBe(TEST_IDS.THREAD_1)
                expect(threads[0].channelName).toBe('Test Channel')
                // toBe (not toContain): 'comms.staging.todoist.com' contains
                // 'comms.todoist.com', so toContain wouldn't catch a rewrite
                // regression on a staging-targeted run.
                expect(threads[0].threadUrl).toBe(
                    `https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/t/${TEST_IDS.THREAD_1}/`,
                )
                expect(threads[0].isUnread).toBe(true)
                expect(threads[1].isStarred).toBe(true)
            }
        })

        it('should filter only unread items when requested', async () => {
            mockCommsApi.inbox.getInbox.mockResolvedValue([
                makeInboxThread({ id: TEST_IDS.THREAD_1, title: 'Unread Thread' }),
                makeInboxThread({
                    id: TEST_IDS.THREAD_2,
                    title: 'Read Thread',
                    creator: TEST_IDS.USER_2,
                    snippetCreator: TEST_IDS.USER_2,
                    url: `https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/t/${TEST_IDS.THREAD_2}/`,
                }),
            ])
            mockCommsApi.inbox.getCount.mockResolvedValue(1)
            mockCommsApi.threads.getUnread.mockResolvedValue({
                data: [
                    {
                        threadId: TEST_IDS.THREAD_1,
                        channelId: TEST_IDS.CHANNEL_1,
                        objIndex: 100,
                        directMention: false,
                    },
                ],
                version: 1,
            })
            mockCommsApi.conversations.getUnread.mockResolvedValue({ data: [], version: 1 })
            mockCommsApi.channels.getChannel.mockResolvedValue(makeChannel())

            const result = await fetchInbox.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, limit: 50, onlyUnread: true },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toMatchSnapshot()
            expect(extractTextContent(result)).not.toContain('Read Thread')
            expect(extractTextContent(result)).toContain('Unread Thread')
        })

        it('should handle empty inbox', async () => {
            mockCommsApi.inbox.getInbox.mockResolvedValue([])
            mockCommsApi.inbox.getCount.mockResolvedValue(0)
            mockCommsApi.threads.getUnread.mockResolvedValue({ data: [], version: 1 })
            mockCommsApi.conversations.getUnread.mockResolvedValue({ data: [], version: 1 })

            const result = await fetchInbox.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, limit: 50, onlyUnread: false },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should filter by date range', async () => {
            mockCommsApi.inbox.getInbox.mockResolvedValue([])
            mockCommsApi.inbox.getCount.mockResolvedValue(0)
            mockCommsApi.threads.getUnread.mockResolvedValue({ data: [], version: 1 })
            mockCommsApi.conversations.getUnread.mockResolvedValue({ data: [], version: 1 })

            const result = await fetchInbox.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    sinceDate: '2024-01-01',
                    untilDate: '2024-01-31',
                    limit: 50,
                    onlyUnread: false,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.inbox.getInbox).toHaveBeenCalledWith(
                expect.objectContaining({
                    newerThan: expect.any(Date),
                    olderThan: expect.any(Date),
                }),
            )

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should fetch inbox with unread conversations', async () => {
            mockCommsApi.inbox.getInbox.mockResolvedValue([])
            mockCommsApi.inbox.getCount.mockResolvedValue(0)
            mockCommsApi.threads.getUnread.mockResolvedValue({ data: [], version: 1 })
            mockCommsApi.conversations.getUnread.mockResolvedValue({
                data: [
                    {
                        conversationId: TEST_IDS.CONVERSATION_1,
                        objIndex: 5,
                        directMention: false,
                    },
                    {
                        conversationId: TEST_IDS.CONVERSATION_2,
                        objIndex: 3,
                        directMention: true,
                    },
                ],
                version: 1,
            })
            mockCommsApi.conversations.getConversation.mockImplementation((id: string) => {
                if (id === TEST_IDS.CONVERSATION_1) {
                    return Promise.resolve({
                        id: TEST_IDS.CONVERSATION_1,
                        workspaceId: TEST_IDS.WORKSPACE_1,
                        userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                        messageCount: 10,
                        lastObjIndex: 5,
                        snippet: 'Latest message',
                        snippetCreators: [TEST_IDS.USER_2],
                        lastActive: new Date(),
                        archived: false,
                        created: new Date(),
                        creator: TEST_IDS.USER_1,
                        url: `https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/msg/${TEST_IDS.CONVERSATION_1}/`,
                    }) as never
                }
                return Promise.resolve({
                    id: TEST_IDS.CONVERSATION_2,
                    title: 'Project Discussion',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    userIds: [TEST_IDS.USER_1, TEST_IDS.USER_3],
                    messageCount: 3,
                    lastObjIndex: 3,
                    snippet: 'Project update',
                    snippetCreators: [TEST_IDS.USER_3],
                    lastActive: new Date(),
                    archived: false,
                    created: new Date(),
                    creator: TEST_IDS.USER_1,
                    url: `https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/msg/${TEST_IDS.CONVERSATION_2}/`,
                }) as never
            })
            mockCommsApi.workspaceUsers.getUserById.mockImplementation(
                (args: { workspaceId: number; userId: number }) => {
                    if (args.userId === TEST_IDS.USER_1) {
                        return Promise.resolve({
                            id: TEST_IDS.USER_1,
                            fullName: 'Alice',
                            shortName: 'Alice',
                            timezone: 'UTC',
                            removed: false,
                            userType: 'USER' as const,
                            version: 1,
                        }) as never
                    }
                    if (args.userId === TEST_IDS.USER_2) {
                        return Promise.resolve({
                            id: TEST_IDS.USER_2,
                            fullName: 'Bob',
                            shortName: 'Bob',
                            timezone: 'UTC',
                            removed: false,
                            userType: 'USER' as const,
                            version: 1,
                        }) as never
                    }
                    return Promise.resolve({
                        id: TEST_IDS.USER_3,
                        fullName: 'Charlie',
                        shortName: 'Charlie',
                        timezone: 'UTC',
                        removed: false,
                        userType: 'USER' as const,
                        version: 1,
                    }) as never
                },
            )

            const result = await fetchInbox.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, limit: 50, onlyUnread: false },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toMatchSnapshot()
            expect(extractTextContent(result)).toContain('## Conversations (2)')
            expect(extractTextContent(result)).toContain('DM with Alice, Bob')
            expect(extractTextContent(result)).toContain('Project Discussion')

            const { structuredContent } = result
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    totalConversations: 2,
                }),
            )
            expect(structuredContent?.conversations).toHaveLength(2)
            const { conversations } = structuredContent || {}
            if (conversations?.[0] && conversations[1]) {
                expect(conversations[0].id).toBe(TEST_IDS.CONVERSATION_1)
                expect(conversations[0].participantNames).toEqual(['Alice', 'Bob'])
                expect(conversations[0].isUnread).toBe(true)
                expect(conversations[0].conversationUrl).toBe(
                    `https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/msg/${TEST_IDS.CONVERSATION_1}/`,
                )
                expect(conversations[1].title).toBe('Project Discussion')
            }
        })

        it('should not display conversations when none are unread', async () => {
            mockCommsApi.inbox.getInbox.mockResolvedValue([makeInboxThread()])
            mockCommsApi.inbox.getCount.mockResolvedValue(1)
            mockCommsApi.threads.getUnread.mockResolvedValue({
                data: [
                    {
                        threadId: TEST_IDS.THREAD_1,
                        channelId: TEST_IDS.CHANNEL_1,
                        objIndex: 1,
                        directMention: false,
                    },
                ],
                version: 1,
            })
            mockCommsApi.conversations.getUnread.mockResolvedValue({ data: [], version: 1 })
            mockCommsApi.channels.getChannel.mockResolvedValue(makeChannel())

            const result = await fetchInbox.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, limit: 50, onlyUnread: false },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toMatchSnapshot()
            expect(extractTextContent(result)).not.toContain('## Conversations')
            expect(extractTextContent(result)).not.toContain('Total Conversations')

            const { structuredContent } = result
            expect(structuredContent?.totalConversations).toBe(0)
            expect(structuredContent?.conversations).toHaveLength(0)
        })

        describe('archiveFilter', () => {
            function createThread({
                id,
                title,
                creator,
                isArchived,
            }: {
                id: string
                title: string
                creator: number
                isArchived: boolean
            }) {
                return makeInboxThread({
                    id,
                    title,
                    content: `${title} content`,
                    creator,
                    snippet: `${title} snippet`,
                    snippetCreator: creator,
                    isArchived,
                    closed: isArchived,
                    commentCount: 1,
                    url: `https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/t/${id}/`,
                })
            }

            function mockArchiveFilterInbox(threads: Array<ReturnType<typeof createThread>>) {
                mockCommsApi.inbox.getInbox.mockResolvedValue(threads)
                mockCommsApi.inbox.getCount.mockResolvedValue(0)
                mockCommsApi.threads.getUnread.mockResolvedValue({ data: [], version: 1 })
                mockCommsApi.conversations.getUnread.mockResolvedValue({ data: [], version: 1 })
                mockCommsApi.channels.getChannel.mockResolvedValue(makeChannel())
            }

            it('should default to active threads', async () => {
                mockArchiveFilterInbox([
                    createThread({
                        id: TEST_IDS.THREAD_1,
                        title: 'Active Thread',
                        creator: TEST_IDS.USER_1,
                        isArchived: false,
                    }),
                ])

                const result = await fetchInbox.execute(
                    { workspaceId: TEST_IDS.WORKSPACE_1, limit: 50, onlyUnread: false },
                    mockCommsApi,
                )

                expect(mockCommsApi.inbox.getInbox).toHaveBeenCalledWith(
                    expect.objectContaining({ archiveFilter: 'active' }),
                )
                const textContent = extractTextContent(result)
                expect(textContent).toContain('Active Thread')
                expect(textContent).not.toContain('Archived Thread')
                expect(textContent).not.toContain('Active Thread [archived]')
                expect(result.structuredContent?.threads).toEqual([
                    expect.objectContaining({
                        id: TEST_IDS.THREAD_1,
                        isArchived: false,
                    }),
                ])
            })

            it('should return archived threads when requested', async () => {
                mockArchiveFilterInbox([
                    createThread({
                        id: TEST_IDS.THREAD_2,
                        title: 'Archived Thread',
                        creator: TEST_IDS.USER_2,
                        isArchived: true,
                    }),
                ])

                const result = await fetchInbox.execute(
                    {
                        workspaceId: TEST_IDS.WORKSPACE_1,
                        limit: 50,
                        onlyUnread: false,
                        archiveFilter: 'archived',
                    },
                    mockCommsApi,
                )

                expect(mockCommsApi.inbox.getInbox).toHaveBeenCalledWith(
                    expect.objectContaining({ archiveFilter: 'archived' }),
                )
                const textContent = extractTextContent(result)
                expect(textContent).toContain('Archived Thread [archived]')
                expect(textContent).not.toContain('Active Thread')
                expect(result.structuredContent?.threads).toEqual([
                    expect.objectContaining({
                        id: TEST_IDS.THREAD_2,
                        isArchived: true,
                    }),
                ])
            })

            it('should return active and archived threads when requested', async () => {
                mockArchiveFilterInbox([
                    createThread({
                        id: TEST_IDS.THREAD_1,
                        title: 'Active Thread',
                        creator: TEST_IDS.USER_1,
                        isArchived: false,
                    }),
                    createThread({
                        id: TEST_IDS.THREAD_2,
                        title: 'Archived Thread',
                        creator: TEST_IDS.USER_2,
                        isArchived: true,
                    }),
                ])

                const result = await fetchInbox.execute(
                    {
                        workspaceId: TEST_IDS.WORKSPACE_1,
                        limit: 50,
                        onlyUnread: false,
                        archiveFilter: 'all',
                    },
                    mockCommsApi,
                )

                expect(mockCommsApi.inbox.getInbox).toHaveBeenCalledWith(
                    expect.objectContaining({ archiveFilter: 'all' }),
                )
                const textContent = extractTextContent(result)
                expect(textContent).toContain('Active Thread')
                expect(textContent).toContain('Archived Thread [archived]')
                expect(textContent).not.toContain('Active Thread [archived]')
                expect(result.structuredContent?.threads).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            id: TEST_IDS.THREAD_1,
                            isArchived: false,
                        }),
                        expect.objectContaining({
                            id: TEST_IDS.THREAD_2,
                            isArchived: true,
                        }),
                    ]),
                )
            })
        })
    })

    describe('missing URL fallback', () => {
        it('should construct threadUrl via getFullCommsURL when SDK omits url field', async () => {
            mockCommsApi.inbox.getInbox.mockResolvedValue([
                makeInboxThread({ title: 'Thread Without URL', url: undefined }),
            ])
            mockCommsApi.inbox.getCount.mockResolvedValue(1)
            mockCommsApi.threads.getUnread.mockResolvedValue({
                data: [
                    {
                        threadId: TEST_IDS.THREAD_1,
                        channelId: TEST_IDS.CHANNEL_1,
                        objIndex: 1,
                        directMention: false,
                    },
                ],
                version: 1,
            })
            mockCommsApi.conversations.getUnread.mockResolvedValue({ data: [], version: 1 })
            mockCommsApi.channels.getChannel.mockResolvedValue(makeChannel())

            const result = await fetchInbox.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, limit: 50, onlyUnread: false },
                mockCommsApi,
            )

            const { structuredContent } = result
            expect(structuredContent?.threads).toHaveLength(1)
            const threadUrl = structuredContent?.threads?.[0]?.threadUrl
            expect(threadUrl).toBe(
                `https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/t/${TEST_IDS.THREAD_1}/`,
            )
        })

        it('should construct conversationUrl via getFullCommsURL when SDK omits url field', async () => {
            mockCommsApi.inbox.getInbox.mockResolvedValue([])
            mockCommsApi.inbox.getCount.mockResolvedValue(0)
            mockCommsApi.threads.getUnread.mockResolvedValue({ data: [], version: 1 })
            mockCommsApi.conversations.getUnread.mockResolvedValue({
                data: [
                    {
                        conversationId: TEST_IDS.CONVERSATION_1,
                        objIndex: 5,
                        directMention: false,
                    },
                ],
                version: 1,
            })
            mockCommsApi.conversations.getConversation.mockResolvedValue({
                id: TEST_IDS.CONVERSATION_1,
                workspaceId: TEST_IDS.WORKSPACE_1,
                userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                messageCount: 10,
                lastObjIndex: 5,
                snippet: 'Latest message',
                snippetCreators: [TEST_IDS.USER_2],
                lastActive: new Date(),
                archived: false,
                created: new Date(),
                creator: TEST_IDS.USER_1,
                // url intentionally omitted
            } as never)
            mockCommsApi.workspaceUsers.getUserById.mockImplementation(
                (args: { workspaceId: number; userId: number }) => {
                    if (args.userId === TEST_IDS.USER_1) {
                        return Promise.resolve({
                            id: TEST_IDS.USER_1,
                            fullName: 'Alice',
                            shortName: 'Alice',
                            timezone: 'UTC',
                            removed: false,
                            userType: 'USER' as const,
                            version: 1,
                        }) as never
                    }
                    return Promise.resolve({
                        id: TEST_IDS.USER_2,
                        fullName: 'Bob',
                        shortName: 'Bob',
                        timezone: 'UTC',
                        removed: false,
                        userType: 'USER' as const,
                        version: 1,
                    }) as never
                },
            )

            const result = await fetchInbox.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, limit: 50, onlyUnread: false },
                mockCommsApi,
            )

            const { structuredContent } = result
            expect(structuredContent?.conversations).toHaveLength(1)
            const conversationUrl = structuredContent?.conversations?.[0]?.conversationUrl
            expect(conversationUrl).toBe(
                `https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/msg/${TEST_IDS.CONVERSATION_1}/`,
            )
        })
    })

    describe('error handling', () => {
        it('should propagate API errors', async () => {
            const apiError = new Error('API Error: Unauthorized')
            mockCommsApi.inbox.getInbox.mockRejectedValue(apiError)

            await expect(
                fetchInbox.execute(
                    { workspaceId: TEST_IDS.WORKSPACE_1, limit: 50, onlyUnread: false },
                    mockCommsApi,
                ),
            ).rejects.toThrow('API Error: Unauthorized')
        })
    })
})
