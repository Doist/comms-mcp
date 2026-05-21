import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import { extractTextContent, TEST_IDS } from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { deleteObject } from '../delete-object.js'

const mockCommsApi = {
    threads: {
        deleteThread: jest.fn(),
    },
    comments: {
        deleteComment: jest.fn(),
    },
    conversationMessages: {
        deleteMessage: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { DELETE_OBJECT } = ToolNames

describe(`${DELETE_OBJECT} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('targetType: thread', () => {
        it('should delete a thread by ID', async () => {
            ;(mockCommsApi.threads.deleteThread as jest.Mock).mockResolvedValue(undefined as never)

            const result = await deleteObject.execute(
                {
                    targetType: 'thread',
                    targetId: TEST_IDS.THREAD_1,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.deleteThread).toHaveBeenCalledWith(TEST_IDS.THREAD_1)
            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual({
                type: 'delete_thread_result',
                success: true,
                targetType: 'thread',
                threadId: TEST_IDS.THREAD_1,
            })
        })

        it('should propagate API errors when deleting a thread', async () => {
            ;(mockCommsApi.threads.deleteThread as jest.Mock).mockRejectedValue(
                new Error('Thread not found') as never,
            )

            await expect(
                deleteObject.execute(
                    {
                        targetType: 'thread',
                        targetId: TEST_IDS.THREAD_1,
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Thread not found')
        })
    })

    describe('targetType: comment', () => {
        it('should delete a comment by ID', async () => {
            ;(mockCommsApi.comments.deleteComment as jest.Mock).mockResolvedValue(
                undefined as never,
            )

            const result = await deleteObject.execute(
                {
                    targetType: 'comment',
                    targetId: TEST_IDS.COMMENT_1,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.comments.deleteComment).toHaveBeenCalledWith(TEST_IDS.COMMENT_1)
            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual({
                type: 'delete_comment_result',
                success: true,
                targetType: 'comment',
                commentId: TEST_IDS.COMMENT_1,
            })
        })

        it('should propagate API errors when deleting a comment', async () => {
            ;(mockCommsApi.comments.deleteComment as jest.Mock).mockRejectedValue(
                new Error('Comment not found') as never,
            )

            await expect(
                deleteObject.execute(
                    {
                        targetType: 'comment',
                        targetId: TEST_IDS.COMMENT_1,
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Comment not found')
        })
    })

    describe('targetType: message', () => {
        it('should delete a conversation message by ID', async () => {
            ;(mockCommsApi.conversationMessages.deleteMessage as jest.Mock).mockResolvedValue(
                undefined as never,
            )

            const result = await deleteObject.execute(
                {
                    targetType: 'message',
                    targetId: TEST_IDS.MESSAGE_1,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.conversationMessages.deleteMessage).toHaveBeenCalledWith(
                TEST_IDS.MESSAGE_1,
            )
            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual({
                type: 'delete_message_result',
                success: true,
                targetType: 'message',
                messageId: TEST_IDS.MESSAGE_1,
            })
        })

        it('should propagate API errors when deleting a message', async () => {
            ;(mockCommsApi.conversationMessages.deleteMessage as jest.Mock).mockRejectedValue(
                new Error('Message not found') as never,
            )

            await expect(
                deleteObject.execute(
                    {
                        targetType: 'message',
                        targetId: TEST_IDS.MESSAGE_1,
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Message not found')
        })
    })

    describe('routing', () => {
        const routingCases = [
            {
                targetType: 'thread' as const,
                targetId: TEST_IDS.THREAD_1,
                expectedMethod: 'threads.deleteThread',
            },
            {
                targetType: 'comment' as const,
                targetId: TEST_IDS.COMMENT_1,
                expectedMethod: 'comments.deleteComment',
            },
            {
                targetType: 'message' as const,
                targetId: TEST_IDS.MESSAGE_1,
                expectedMethod: 'conversationMessages.deleteMessage',
            },
        ]

        it.each(routingCases)(
            'should only call $expectedMethod when targetType is $targetType',
            async ({ targetType, targetId }) => {
                ;(mockCommsApi.threads.deleteThread as jest.Mock).mockResolvedValue(
                    undefined as never,
                )
                ;(mockCommsApi.comments.deleteComment as jest.Mock).mockResolvedValue(
                    undefined as never,
                )
                ;(mockCommsApi.conversationMessages.deleteMessage as jest.Mock).mockResolvedValue(
                    undefined as never,
                )

                await deleteObject.execute({ targetType, targetId }, mockCommsApi)

                expect(mockCommsApi.threads.deleteThread).toHaveBeenCalledTimes(
                    targetType === 'thread' ? 1 : 0,
                )
                expect(mockCommsApi.comments.deleteComment).toHaveBeenCalledTimes(
                    targetType === 'comment' ? 1 : 0,
                )
                expect(mockCommsApi.conversationMessages.deleteMessage).toHaveBeenCalledTimes(
                    targetType === 'message' ? 1 : 0,
                )
            },
        )
    })
})
