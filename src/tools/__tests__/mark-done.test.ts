import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import { extractTextContent, TEST_IDS } from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { markDone } from '../mark-done.js'

// Mock the Comms API
const mockCommsApi = {
    batch: jest.fn(),
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
    // Store original console.error
    const originalConsoleError = console.error

    beforeEach(() => {
        jest.clearAllMocks()
        // By default, batch succeeds
        mockCommsApi.batch.mockResolvedValue([] as never)
        // Suppress console.error for tests that expect errors
        console.error = jest.fn()

        // Setup mocks to return batch descriptors when called with {batch: true}
        mockCommsApi.threads.markRead.mockImplementation(
            (args: { id: number; objIndex: number }, options?: { batch?: boolean }) => {
                if (options?.batch) {
                    return {
                        method: 'POST',
                        url: '/threads/mark_read',
                        params: { id: args.id, obj_index: args.objIndex },
                    } as never
                }
                return Promise.resolve(undefined) as never
            },
        )
        mockCommsApi.inbox.archiveThread.mockImplementation(
            (id: number, options?: { batch?: boolean }) => {
                if (options?.batch) {
                    return { method: 'POST', url: '/inbox/archive', params: { id } } as never
                }
                return Promise.resolve(undefined) as never
            },
        )
        mockCommsApi.conversations.markRead.mockImplementation(
            (args: { id: number }, options?: { batch?: boolean }) => {
                if (options?.batch) {
                    return {
                        method: 'POST',
                        url: '/conversations/mark_read',
                        params: args,
                    } as never
                }
                return Promise.resolve(undefined) as never
            },
        )
        mockCommsApi.conversations.archiveConversation.mockImplementation(
            (id: number, options?: { batch?: boolean }) => {
                if (options?.batch) {
                    return {
                        method: 'POST',
                        url: '/conversations/archive',
                        params: { id },
                    } as never
                }
                return Promise.resolve(undefined) as never
            },
        )
    })

    afterEach(() => {
        // Restore console.error
        console.error = originalConsoleError
    })

    describe('marking threads as done', () => {
        it('should mark all threads as done successfully', async () => {
            // Don't override mock implementations - they're set up in beforeEach to handle batch mode
            const result = await markDone.execute(
                {
                    type: 'thread',
                    ids: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2, TEST_IDS.THREAD_3],
                    markRead: true,
                    archive: true,
                },
                mockCommsApi,
            )

            // Verify batch was called (operations are batched)
            expect(mockCommsApi.batch).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.batch).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'POST', url: '/threads/mark_read' }),
                expect.objectContaining({ method: 'POST', url: '/inbox/archive' }),
                expect.objectContaining({ method: 'POST', url: '/threads/mark_read' }),
                expect.objectContaining({ method: 'POST', url: '/inbox/archive' }),
                expect.objectContaining({ method: 'POST', url: '/threads/mark_read' }),
                expect.objectContaining({ method: 'POST', url: '/inbox/archive' }),
            )

            // Verify result is a concise summary
            expect(extractTextContent(result)).toMatchSnapshot()

            // Verify structured content
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
            mockCommsApi.threads.markRead.mockResolvedValue(undefined)

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
            mockCommsApi.inbox.archiveThread.mockResolvedValue(undefined)

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
            // Mock batch to fail, triggering fallback to individual operations
            mockCommsApi.batch.mockRejectedValueOnce(new Error('Batch failed'))

            // Don't reset mocks - the batch descriptor implementations need to stay in place
            // But we need to set up the fallback behavior for when batch fails
            // The mock implementation in beforeEach handles {batch: true}, but when called without batch option,
            // it returns Promise.resolve(undefined). We need to override this for the fallback calls.

            // When batch fails, the code will call these functions again WITHOUT {batch: true}
            // We need to set up separate behavior for those non-batch calls
            // First 3 calls are for building batch descriptors (with {batch: true})
            // Next 3 calls are the fallback (without {batch: true})
            let markReadCallCount = 0
            mockCommsApi.threads.markRead.mockImplementation(
                (args: { id: number; objIndex: number }, options?: { batch?: boolean }) => {
                    markReadCallCount++
                    // First 3 calls: return batch descriptors
                    if (markReadCallCount <= 3 && options?.batch) {
                        return {
                            method: 'POST',
                            url: '/threads/mark_read',
                            params: { id: args.id, obj_index: args.objIndex },
                        } as never
                    }
                    // Next 3 calls: fallback behavior
                    if (markReadCallCount === 4) return Promise.resolve(undefined) as never // thread-1 succeeds
                    if (markReadCallCount === 5)
                        return Promise.reject(new Error('Thread not found')) as never // thread-2 fails
                    if (markReadCallCount === 6) return Promise.resolve(undefined) as never // thread-3 succeeds
                    return Promise.resolve(undefined) as never
                },
            )

            mockCommsApi.inbox.archiveThread.mockResolvedValue(undefined)

            const result = await markDone.execute(
                {
                    type: 'thread',
                    ids: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2, TEST_IDS.THREAD_3],
                    markRead: true,
                    archive: true,
                },
                mockCommsApi,
            )

            // Verify only successful completions are reported
            expect(extractTextContent(result)).toMatchSnapshot()

            // Verify structured content with partial failures
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
            // Mock batch to fail, triggering fallback to individual operations
            mockCommsApi.batch.mockRejectedValueOnce(new Error('Batch failed'))

            const apiError = new Error('API Error: Network timeout')
            mockCommsApi.threads.markRead.mockRejectedValue(apiError)

            const result = await markDone.execute(
                {
                    type: 'thread',
                    ids: [TEST_IDS.THREAD_1, TEST_IDS.THREAD_2],
                    markRead: true,
                    archive: true,
                },
                mockCommsApi,
            )

            // Verify no threads were completed
            expect(extractTextContent(result)).toMatchSnapshot()
        })
    })

    describe('marking conversations as done', () => {
        it('should mark all conversations as done successfully', async () => {
            // Don't override mock implementations - they're set up in beforeEach to handle batch mode
            const result = await markDone.execute(
                {
                    type: 'conversation',
                    ids: [TEST_IDS.CONVERSATION_1, TEST_IDS.CONVERSATION_2],
                    markRead: true,
                    archive: true,
                },
                mockCommsApi,
            )

            // Verify batch was called (operations are batched)
            expect(mockCommsApi.batch).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.batch).toHaveBeenCalledWith(
                expect.objectContaining({ method: 'POST', url: '/conversations/mark_read' }),
                expect.objectContaining({ method: 'POST', url: '/conversations/archive' }),
                expect.objectContaining({ method: 'POST', url: '/conversations/mark_read' }),
                expect.objectContaining({ method: 'POST', url: '/conversations/archive' }),
            )

            expect(extractTextContent(result)).toMatchSnapshot()

            // Verify structured content
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
            mockCommsApi.threads.markAllRead.mockResolvedValue(undefined)
            mockCommsApi.inbox.archiveAll.mockResolvedValue(undefined)

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

        it('should mark all threads as read and archive in a channel', async () => {
            mockCommsApi.threads.markAllRead.mockResolvedValue(undefined)
            mockCommsApi.inbox.archiveAll.mockResolvedValue(undefined)

            const result = await markDone.execute(
                {
                    type: 'thread',
                    channelId: TEST_IDS.CHANNEL_1,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.markAllRead).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
            })
            expect(mockCommsApi.inbox.archiveAll).toHaveBeenCalledWith({
                workspaceId: 0,
                channelIds: [TEST_IDS.CHANNEL_1],
            })

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should clear all unread markers in a workspace', async () => {
            mockCommsApi.threads.clearUnread.mockResolvedValue(undefined)

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
            mockCommsApi.threads.markAllRead.mockResolvedValue(undefined)

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
            mockCommsApi.inbox.archiveAll.mockResolvedValue(undefined)

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
            mockCommsApi.threads.markRead.mockResolvedValue(undefined)
            mockCommsApi.inbox.archiveThread.mockResolvedValue(undefined)

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
            // Mock batch to fail, triggering fallback to individual operations
            mockCommsApi.batch.mockRejectedValueOnce(new Error('Batch failed'))

            // Setup mock implementation to handle batch calls first, then fallback calls
            let markReadCallCount = 0
            mockCommsApi.threads.markRead.mockImplementation(
                (args: { id: number; objIndex: number }, options?: { batch?: boolean }) => {
                    markReadCallCount++
                    // First 2 calls: return batch descriptors (with {batch: true})
                    if (markReadCallCount <= 2 && options?.batch) {
                        return {
                            method: 'POST',
                            url: '/threads/mark_read',
                            params: { id: args.id, obj_index: args.objIndex },
                        } as never
                    }
                    // Next 2 calls: fallback behavior (without {batch: true})
                    if (markReadCallCount === 3) return Promise.resolve(undefined) as never // thread-1 succeeds
                    if (markReadCallCount === 4)
                        return Promise.reject(new Error('Thread not found')) as never // thread-2 fails
                    return Promise.resolve(undefined) as never
                },
            )

            mockCommsApi.inbox.archiveThread.mockResolvedValue(undefined)

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
