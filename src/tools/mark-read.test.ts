import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    createMockConversation,
    createMockThread,
    extractTextContent,
    TEST_IDS,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { markRead } from './mark-read.js'

const mockCommsApi = {
    threads: {
        getUnread: jest.fn(),
        getThread: jest.fn(),
        markRead: jest.fn(),
        markAllRead: jest.fn(),
    },
    conversations: {
        getUnread: jest.fn(),
        getConversation: jest.fn(),
        markRead: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { MARK_READ } = ToolNames
const WORKSPACE_ID = TEST_IDS.WORKSPACE_1

function unreadThread(threadId: string, objIndex = -1) {
    return { threadId, channelId: TEST_IDS.CHANNEL_1, objIndex, directMention: false }
}

function unreadConversation(conversationId: string, objIndex = 0) {
    return { conversationId, objIndex, directMention: false }
}

function setUnread({
    threads = [] as string[],
    conversations = [] as string[],
}: {
    threads?: string[]
    conversations?: string[]
}) {
    mockCommsApi.threads.getUnread.mockResolvedValue({
        data: threads.map((id) => unreadThread(id)),
        version: 1,
        inboxUnread: threads.length,
    })
    mockCommsApi.conversations.getUnread.mockResolvedValue({
        data: conversations.map((id) => unreadConversation(id)),
        version: 1,
    })
}

describe(`${MARK_READ} tool`, () => {
    const originalConsoleError = console.error

    beforeEach(() => {
        jest.clearAllMocks()
        console.error = jest.fn()

        setUnread({})
        mockCommsApi.threads.getThread.mockImplementation(async (id: string) =>
            createMockThread({ id, commentCount: 4, lastObjIndex: 3 }),
        )
        mockCommsApi.threads.markRead.mockResolvedValue({ status: 'ok' } as never)
        mockCommsApi.threads.markAllRead.mockResolvedValue({ status: 'ok' } as never)
        mockCommsApi.conversations.getConversation.mockImplementation(async (id: string) =>
            createMockConversation({ id, messageCount: 8, lastObjIndex: 7 }),
        )
        mockCommsApi.conversations.markRead.mockResolvedValue({ status: 'ok' } as never)
    })

    afterEach(() => {
        console.error = originalConsoleError
    })

    describe('argument validation', () => {
        it('rejects all combined with explicit IDs', async () => {
            await expect(
                markRead.execute(
                    { workspaceId: WORKSPACE_ID, all: true, threadIds: [TEST_IDS.THREAD_1] },
                    mockCommsApi,
                ),
            ).rejects.toThrow('`all` cannot be combined with threadIds or conversationIds')
        })

        it('rejects a call with nothing to mark', async () => {
            await expect(
                markRead.execute({ workspaceId: WORKSPACE_ID }, mockCommsApi),
            ).rejects.toThrow('Provide threadIds, conversationIds, or all: true')

            await expect(
                markRead.execute(
                    { workspaceId: WORKSPACE_ID, threadIds: [], conversationIds: [] },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Provide threadIds, conversationIds, or all: true')
        })
    })

    describe('individual IDs', () => {
        it('marks unread threads read through their last comment', async () => {
            setUnread({ threads: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2] })

            const result = await markRead.execute(
                { workspaceId: WORKSPACE_ID, threadIds: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2] },
                mockCommsApi,
            )

            // objIndex 0 would only cover the thread post and leave the badge
            // in place, so the position comes from each thread record.
            expect(mockCommsApi.threads.markRead).toHaveBeenCalledTimes(2)
            expect(mockCommsApi.threads.markRead).toHaveBeenCalledWith({
                id: TEST_IDS.THREAD_1,
                objIndex: 3,
            })
            expect(mockCommsApi.threads.markRead).toHaveBeenCalledWith({
                id: TEST_IDS.THREAD_2,
                objIndex: 3,
            })
            expect(mockCommsApi.threads.markAllRead).not.toHaveBeenCalled()
            // Conversations were not requested, so their unread list is not fetched.
            expect(mockCommsApi.conversations.getUnread).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()
            expect(result.structuredContent).toEqual({
                type: 'mark_read_result',
                workspaceId: WORKSPACE_ID,
                mode: 'individual',
                threads: { marked: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2], alreadyRead: [] },
                conversations: { marked: [], alreadyRead: [] },
                failed: [],
                markedCount: 2,
                failureCount: 0,
            })
        })

        it('marks unread conversations read through their last message', async () => {
            setUnread({ conversations: [TEST_IDS.CONVERSATION_1] })

            const result = await markRead.execute(
                { workspaceId: WORKSPACE_ID, conversationIds: [TEST_IDS.CONVERSATION_1] },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.markRead).toHaveBeenCalledWith({
                id: TEST_IDS.CONVERSATION_1,
                objIndex: 7,
            })
            expect(mockCommsApi.threads.getUnread).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()
            expect(result.structuredContent).toEqual(
                expect.objectContaining({
                    threads: { marked: [], alreadyRead: [] },
                    conversations: { marked: [TEST_IDS.CONVERSATION_1], alreadyRead: [] },
                    markedCount: 1,
                }),
            )
        })

        it('skips items that are not in the unread list and reports them as alreadyRead', async () => {
            setUnread({ threads: [TEST_IDS.THREAD_2], conversations: [] })

            const result = await markRead.execute(
                {
                    workspaceId: WORKSPACE_ID,
                    threadIds: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2],
                    conversationIds: [TEST_IDS.CONVERSATION_1],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.getThread).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.threads.markRead).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.threads.markRead).toHaveBeenCalledWith({
                id: TEST_IDS.THREAD_2,
                objIndex: 3,
            })
            expect(mockCommsApi.conversations.markRead).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()
            expect(result.structuredContent).toEqual(
                expect.objectContaining({
                    threads: { marked: [TEST_IDS.THREAD_2], alreadyRead: [TEST_IDS.THREAD_1] },
                    conversations: { marked: [], alreadyRead: [TEST_IDS.CONVERSATION_1] },
                    markedCount: 1,
                    failureCount: 0,
                }),
            )
        })

        it('dedupes repeated IDs', async () => {
            setUnread({ threads: [TEST_IDS.THREAD_1] })

            const result = await markRead.execute(
                {
                    workspaceId: WORKSPACE_ID,
                    threadIds: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_1, TEST_IDS.THREAD_2],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markRead).toHaveBeenCalledTimes(1)
            expect(result.structuredContent).toEqual(
                expect.objectContaining({
                    threads: { marked: [TEST_IDS.THREAD_1], alreadyRead: [TEST_IDS.THREAD_2] },
                    markedCount: 1,
                }),
            )
        })

        it('reports a thread whose record cannot be loaded as failed and continues', async () => {
            setUnread({ threads: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2] })
            mockCommsApi.threads.getThread.mockImplementation(async (id: string) => {
                if (id === TEST_IDS.THREAD_1) {
                    throw new Error('Thread not found')
                }
                return createMockThread({ id, commentCount: 4, lastObjIndex: 3 })
            })

            const result = await markRead.execute(
                { workspaceId: WORKSPACE_ID, threadIds: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2] },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markRead).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.threads.markRead).toHaveBeenCalledWith({
                id: TEST_IDS.THREAD_2,
                objIndex: 3,
            })

            expect(extractTextContent(result)).toMatchSnapshot()
            expect(result.structuredContent).toEqual(
                expect.objectContaining({
                    threads: { marked: [TEST_IDS.THREAD_2], alreadyRead: [] },
                    failed: [
                        { item: TEST_IDS.THREAD_1, itemType: 'thread', error: 'Thread not found' },
                    ],
                    markedCount: 1,
                    failureCount: 1,
                }),
            )
            expect(console.error).toHaveBeenCalledWith(
                `${MARK_READ}: operations failed: Thread not found`,
                expect.objectContaining({
                    failed: 1,
                    failedSample: [
                        { item: TEST_IDS.THREAD_1, itemType: 'thread', error: 'Thread not found' },
                    ],
                }),
            )
        })

        it('reports a conversation markRead failure without affecting other items', async () => {
            setUnread({
                threads: [TEST_IDS.THREAD_1],
                conversations: [TEST_IDS.CONVERSATION_1, TEST_IDS.CONVERSATION_2],
            })
            mockCommsApi.conversations.markRead.mockImplementation(async (args: { id: string }) => {
                if (args.id === TEST_IDS.CONVERSATION_2) {
                    throw new Error('Request failed with status 403')
                }
                return { status: 'ok' } as never
            })

            const result = await markRead.execute(
                {
                    workspaceId: WORKSPACE_ID,
                    threadIds: [TEST_IDS.THREAD_1],
                    conversationIds: [TEST_IDS.CONVERSATION_1, TEST_IDS.CONVERSATION_2],
                },
                mockCommsApi,
            )

            expect(result.structuredContent).toEqual(
                expect.objectContaining({
                    threads: { marked: [TEST_IDS.THREAD_1], alreadyRead: [] },
                    conversations: { marked: [TEST_IDS.CONVERSATION_1], alreadyRead: [] },
                    failed: [
                        {
                            item: TEST_IDS.CONVERSATION_2,
                            itemType: 'conversation',
                            error: 'Request failed with status 403',
                        },
                    ],
                    markedCount: 2,
                    failureCount: 1,
                }),
            )
        })

        it('does not log when nothing failed', async () => {
            setUnread({ threads: [TEST_IDS.THREAD_1] })

            await markRead.execute(
                { workspaceId: WORKSPACE_ID, threadIds: [TEST_IDS.THREAD_1] },
                mockCommsApi,
            )

            expect(console.error).not.toHaveBeenCalled()
        })

        it('propagates a failure to load the unread list', async () => {
            mockCommsApi.threads.getUnread.mockRejectedValue(
                new Error('Request failed with status 401'),
            )

            await expect(
                markRead.execute(
                    { workspaceId: WORKSPACE_ID, threadIds: [TEST_IDS.THREAD_1] },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Request failed with status 401')
        })
    })

    describe('all unread in workspace', () => {
        it('uses one markAllRead call for threads and marks conversations individually', async () => {
            setUnread({
                threads: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2],
                conversations: [TEST_IDS.CONVERSATION_1],
            })

            const result = await markRead.execute(
                { workspaceId: WORKSPACE_ID, all: true },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markAllRead).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.threads.markAllRead).toHaveBeenCalledWith({
                workspaceId: WORKSPACE_ID,
            })
            expect(mockCommsApi.threads.markRead).not.toHaveBeenCalled()
            expect(mockCommsApi.conversations.markRead).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.conversations.markRead).toHaveBeenCalledWith({
                id: TEST_IDS.CONVERSATION_1,
                objIndex: 7,
            })

            expect(extractTextContent(result)).toMatchSnapshot()
            expect(result.structuredContent).toEqual({
                type: 'mark_read_result',
                workspaceId: WORKSPACE_ID,
                mode: 'all',
                threads: { marked: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2], alreadyRead: [] },
                conversations: { marked: [TEST_IDS.CONVERSATION_1], alreadyRead: [] },
                failed: [],
                markedCount: 3,
                failureCount: 0,
            })
        })

        it('caps the IDs echoed in the text output while keeping them all in structuredContent', async () => {
            const threadIds = Array.from({ length: 8 }, (_, i) => `thread-id-${i + 1}`)
            setUnread({ threads: threadIds })

            const result = await markRead.execute(
                { workspaceId: WORKSPACE_ID, all: true },
                mockCommsApi,
            )

            const text = extractTextContent(result)
            expect(text).toContain(`**Marked:** ${threadIds.slice(0, 5).join(', ')} … and 3 more`)
            expect(text).not.toContain('thread-id-8')
            expect(result.structuredContent).toEqual(
                expect.objectContaining({
                    threads: { marked: threadIds, alreadyRead: [] },
                    markedCount: 8,
                }),
            )
        })

        it('skips markAllRead when no threads are unread', async () => {
            setUnread({ conversations: [TEST_IDS.CONVERSATION_1] })

            const result = await markRead.execute(
                { workspaceId: WORKSPACE_ID, all: true },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markAllRead).not.toHaveBeenCalled()
            expect(result.structuredContent).toEqual(
                expect.objectContaining({
                    threads: { marked: [], alreadyRead: [] },
                    conversations: { marked: [TEST_IDS.CONVERSATION_1], alreadyRead: [] },
                    markedCount: 1,
                }),
            )
        })

        it('reports nothing to do when the workspace has no unread items', async () => {
            const result = await markRead.execute(
                { workspaceId: WORKSPACE_ID, all: true },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markAllRead).not.toHaveBeenCalled()
            expect(mockCommsApi.conversations.markRead).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()
            expect(result.structuredContent).toEqual(
                expect.objectContaining({ mode: 'all', markedCount: 0, failureCount: 0 }),
            )
        })

        it('reports every unread thread as failed when markAllRead fails, and still marks conversations', async () => {
            setUnread({
                threads: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2],
                conversations: [TEST_IDS.CONVERSATION_1],
            })
            mockCommsApi.threads.markAllRead.mockRejectedValue(
                new Error('Request failed with status 500'),
            )

            const result = await markRead.execute(
                { workspaceId: WORKSPACE_ID, all: true },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.markRead).toHaveBeenCalledTimes(1)
            expect(result.structuredContent).toEqual(
                expect.objectContaining({
                    threads: { marked: [], alreadyRead: [] },
                    conversations: { marked: [TEST_IDS.CONVERSATION_1], alreadyRead: [] },
                    failed: [
                        {
                            item: TEST_IDS.THREAD_1,
                            itemType: 'thread',
                            error: 'Request failed with status 500',
                        },
                        {
                            item: TEST_IDS.THREAD_2,
                            itemType: 'thread',
                            error: 'Request failed with status 500',
                        },
                    ],
                    markedCount: 1,
                    failureCount: 2,
                }),
            )
        })
    })
})
