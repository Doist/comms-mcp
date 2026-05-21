import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import { extractTextContent, TEST_IDS } from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { markDone } from '../mark-done.js'

// Mock the Comms API
const mockCommsApi = {
    threads: {
        markRead: jest.fn(),
        markAllRead: jest.fn(),
        clearUnread: jest.fn(),
    },
    conversations: {
        markRead: jest.fn(),
        archiveConversation: jest.fn(),
    },
    inbox: {
        archiveThread: jest.fn(),
        archiveAll: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { MARK_DONE } = ToolNames

describe(`${MARK_DONE} tool`, () => {
    const originalConsoleError = console.error

    beforeEach(() => {
        jest.clearAllMocks()
        console.error = jest.fn()

        mockCommsApi.threads.markRead.mockResolvedValue(undefined as never)
        mockCommsApi.inbox.archiveThread.mockResolvedValue(undefined as never)
        mockCommsApi.conversations.markRead.mockResolvedValue(undefined as never)
        mockCommsApi.conversations.archiveConversation.mockResolvedValue(undefined as never)
    })

    afterEach(() => {
        console.error = originalConsoleError
    })

    describe('marking threads as done', () => {
        it('should mark all threads as done successfully', async () => {
            const result = await markDone.execute(
                {
                    type: 'thread',
                    ids: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2, TEST_IDS.THREAD_3],
                    markRead: true,
                    archive: true,
                },
                mockCommsApi,
            )

            // markRead + archiveThread for each thread = 3 of each
            expect(mockCommsApi.threads.markRead).toHaveBeenCalledTimes(3)
            expect(mockCommsApi.inbox.archiveThread).toHaveBeenCalledTimes(3)

            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    type: 'mark_done_result',
                    itemType: 'thread',
                    mode: 'individual',
                    completed: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2, TEST_IDS.THREAD_3],
                    failed: [],
                    totalRequested: 3,
                    successCount: 3,
                    failureCount: 0,
                    operations: {
                        markRead: true,
                        archive: true,
                        clearUnread: false,
                    },
                }),
            )
        })

        it('should mark thread as read only', async () => {
            const result = await markDone.execute(
                {
                    type: 'thread',
                    ids: [TEST_IDS.THREAD_1],
                    markRead: true,
                    archive: false,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markRead).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.inbox.archiveThread).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should archive thread only', async () => {
            const result = await markDone.execute(
                {
                    type: 'thread',
                    ids: [TEST_IDS.THREAD_1],
                    markRead: false,
                    archive: true,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markRead).not.toHaveBeenCalled()
            expect(mockCommsApi.inbox.archiveThread).toHaveBeenCalledTimes(1)

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should handle partial failures gracefully', async () => {
            mockCommsApi.threads.markRead.mockImplementation(
                async (args: { id: string; objIndex: number }) => {
                    if (args.id === TEST_IDS.THREAD_2) {
                        throw new Error('Thread not found')
                    }
                    return undefined
                },
            )

            const result = await markDone.execute(
                {
                    type: 'thread',
                    ids: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2, TEST_IDS.THREAD_3],
                    markRead: true,
                    archive: true,
                },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    completed: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_3],
                    failed: [
                        expect.objectContaining({
                            item: TEST_IDS.THREAD_2,
                            error: 'Thread not found',
                        }),
                    ],
                    totalRequested: 3,
                    successCount: 2,
                    failureCount: 1,
                }),
            )
        })

        it('should handle all threads failing', async () => {
            mockCommsApi.threads.markRead.mockRejectedValue(new Error('API Error: Network timeout'))

            const result = await markDone.execute(
                {
                    type: 'thread',
                    ids: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2],
                    markRead: true,
                    archive: true,
                },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toMatchSnapshot()
        })
    })

    describe('marking conversations as done', () => {
        it('should mark all conversations as done successfully', async () => {
            const result = await markDone.execute(
                {
                    type: 'conversation',
                    ids: [TEST_IDS.CONVERSATION_1, TEST_IDS.CONVERSATION_2],
                    markRead: true,
                    archive: true,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.conversations.markRead).toHaveBeenCalledTimes(2)
            expect(mockCommsApi.conversations.archiveConversation).toHaveBeenCalledTimes(2)

            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    itemType: 'conversation',
                    completed: [TEST_IDS.CONVERSATION_1, TEST_IDS.CONVERSATION_2],
                    failed: [],
                    totalRequested: 2,
                    successCount: 2,
                    failureCount: 0,
                }),
            )
        })

        it('should handle conversation not found error', async () => {
            mockCommsApi.conversations.markRead.mockRejectedValue(
                new Error('Conversation not found'),
            )

            const result = await markDone.execute(
                {
                    type: 'conversation',
                    ids: [TEST_IDS.CONVERSATION_1],
                    markRead: true,
                    archive: false,
                },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toMatchSnapshot()
        })
    })

    describe('bulk thread operations', () => {
        it('should mark all threads as read and archive in a workspace', async () => {
            mockCommsApi.threads.markAllRead.mockResolvedValue(undefined as never)
            mockCommsApi.inbox.archiveAll.mockResolvedValue(undefined as never)

            const result = await markDone.execute(
                {
                    type: 'thread',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markAllRead).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })
            expect(mockCommsApi.inbox.archiveAll).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })

            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    type: 'mark_done_result',
                    mode: 'bulk',
                    itemType: 'thread',
                    selectors: {
                        workspaceId: TEST_IDS.WORKSPACE_1,
                        channelId: undefined,
                    },
                    operations: {
                        markRead: true,
                        archive: true,
                        clearUnread: false,
                    },
                }),
            )
        })

        it('rejects channel-only bulk archive (would silently drop the archive step)', async () => {
            mockCommsApi.threads.markAllRead.mockResolvedValue(undefined as never)
            mockCommsApi.inbox.archiveAll.mockResolvedValue(undefined as never)

            // `archive: true` set explicitly so the test pins the rejection to
            // the archive-without-workspaceId rule rather than the tool's
            // default. If the default ever changes, this case still tests what
            // it claims to.
            await expect(
                markDone.execute(
                    {
                        type: 'thread',
                        channelId: TEST_IDS.CHANNEL_1,
                        archive: true,
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Archiving by channelId requires workspaceId')

            expect(mockCommsApi.threads.markAllRead).not.toHaveBeenCalled()
            expect(mockCommsApi.inbox.archiveAll).not.toHaveBeenCalled()
        })

        it('marks all read in a channel without archiving when archive=false', async () => {
            mockCommsApi.threads.markAllRead.mockResolvedValue(undefined as never)

            const result = await markDone.execute(
                {
                    type: 'thread',
                    channelId: TEST_IDS.CHANNEL_1,
                    archive: false,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markAllRead).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
            })
            expect(mockCommsApi.inbox.archiveAll).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('scopes archive to a channel when workspaceId + channelId are both provided', async () => {
            mockCommsApi.threads.markAllRead.mockResolvedValue(undefined as never)
            mockCommsApi.inbox.archiveAll.mockResolvedValue(undefined as never)

            const result = await markDone.execute(
                {
                    type: 'thread',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    channelId: TEST_IDS.CHANNEL_1,
                    archive: true,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markAllRead).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
                channelId: TEST_IDS.CHANNEL_1,
            })
            expect(mockCommsApi.inbox.archiveAll).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
                channelIds: [TEST_IDS.CHANNEL_1],
            })

            // Also pin the user-visible reporting so a regression in the
            // selectors payload can't slip through with the SDK calls green.
            const structured = result.structuredContent as {
                mode: string
                selectors?: { workspaceId?: number; channelId?: string }
            }
            expect(structured.mode).toBe('bulk')
            expect(structured.selectors).toEqual({
                workspaceId: TEST_IDS.WORKSPACE_1,
                channelId: TEST_IDS.CHANNEL_1,
            })

            const text = extractTextContent(result)
            expect(text).toContain(`**Workspace ID:** ${TEST_IDS.WORKSPACE_1}`)
            expect(text).toContain(`**Channel ID:** ${TEST_IDS.CHANNEL_1}`)
        })

        it('should clear all unread markers in a workspace', async () => {
            mockCommsApi.threads.clearUnread.mockResolvedValue(undefined as never)

            const result = await markDone.execute(
                {
                    type: 'thread',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    clearUnread: true,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.clearUnread).toHaveBeenCalledWith(TEST_IDS.WORKSPACE_1)
            expect(mockCommsApi.threads.markAllRead).not.toHaveBeenCalled()
            expect(mockCommsApi.inbox.archiveAll).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should mark all as read without archiving in workspace', async () => {
            mockCommsApi.threads.markAllRead.mockResolvedValue(undefined as never)

            const result = await markDone.execute(
                {
                    type: 'thread',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    archive: false,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markAllRead).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })
            expect(mockCommsApi.inbox.archiveAll).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should archive all without marking as read in workspace', async () => {
            mockCommsApi.inbox.archiveAll.mockResolvedValue(undefined as never)

            const result = await markDone.execute(
                {
                    type: 'thread',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    markRead: false,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markAllRead).not.toHaveBeenCalled()
            expect(mockCommsApi.inbox.archiveAll).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should throw error if bulk operations used with conversations', async () => {
            await expect(
                markDone.execute(
                    {
                        type: 'conversation',
                        workspaceId: TEST_IDS.WORKSPACE_1,
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow(
                'Bulk operations (workspaceId, channelId, clearUnread) are only supported for threads',
            )
        })

        it('should throw error if clearUnread used with conversations', async () => {
            await expect(
                markDone.execute(
                    {
                        type: 'conversation',
                        ids: [TEST_IDS.CONVERSATION_1],
                        clearUnread: true,
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow(
                'Bulk operations (workspaceId, channelId, clearUnread) are only supported for threads',
            )
        })

        it('should propagate bulk operation errors', async () => {
            const apiError = new Error('Workspace not found')
            mockCommsApi.threads.markAllRead.mockRejectedValue(apiError)

            await expect(
                markDone.execute(
                    {
                        type: 'thread',
                        workspaceId: TEST_IDS.WORKSPACE_1,
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Bulk operation failed: Workspace not found')
        })

        it('should throw error if no ids or selectors provided', async () => {
            await expect(
                markDone.execute(
                    {
                        type: 'thread',
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Must provide either ids, workspaceId, or channelId')
        })
    })

    describe('next steps logic validation', () => {
        it('should suggest fetch-inbox when all threads complete successfully', async () => {
            const result = await markDone.execute(
                {
                    type: 'thread',
                    ids: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2],
                    markRead: true,
                    archive: true,
                },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toMatchSnapshot()
            expect(textContent).toContain('fetch-inbox')
        })

        it('should suggest reviewing failures when mixed results', async () => {
            mockCommsApi.threads.markRead.mockImplementation(
                async (args: { id: string; objIndex: number }) => {
                    if (args.id === TEST_IDS.THREAD_2) {
                        throw new Error('Thread not found')
                    }
                    return undefined
                },
            )

            const result = await markDone.execute(
                {
                    type: 'thread',
                    ids: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2],
                    markRead: true,
                    archive: true,
                },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toMatchSnapshot()
            expect(textContent).toContain('Review failed items and retry if needed')
        })
    })
})
