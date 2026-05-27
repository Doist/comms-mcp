import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    createMockThread,
    extractStructuredContent,
    extractTextContent,
    TEST_IDS,
} from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { createThread } from '../create-thread.js'

const mockCommsApi = {
    threads: {
        createThread: jest.fn(),
    },
    inbox: {
        unarchiveThread: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { CREATE_THREAD } = ToolNames

describe(`${CREATE_THREAD} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
        delete process.env.COMMS_CREATE_THREAD_DISPLAY_IN_INBOX
    })

    describe('creating threads', () => {
        it('should create a thread in a channel', async () => {
            const mockThread = createMockThread({
                title: 'New Discussion',
                content: 'Let us discuss this topic',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'New Discussion',
                    content: 'Let us discuss this topic',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
                title: 'New Discussion',
                content: 'Let us discuss this topic',
                recipients: undefined,
                groups: undefined,
            })
            expect(mockCommsApi.inbox.unarchiveThread).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    type: 'create_thread_result',
                    success: true,
                    threadId: mockThread.id,
                    title: 'New Discussion',
                    channelId: TEST_IDS.CHANNEL_1,
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    content: 'Let us discuss this topic',
                    threadUrl: expect.stringContaining('comms.todoist.com'),
                }),
            )
        })

        it('should create a thread with recipients', async () => {
            const mockThread = createMockThread({
                title: 'Notify Users',
                content: 'Important update',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Notify Users',
                    content: 'Important update',
                    recipients: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
                title: 'Notify Users',
                content: 'Important update',
                recipients: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                groups: undefined,
            })
            expect(mockCommsApi.inbox.unarchiveThread).not.toHaveBeenCalled()

            expect(extractTextContent(result)).toMatchSnapshot()

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.recipients).toEqual([TEST_IDS.USER_1, TEST_IDS.USER_2])
            expect(structuredContent).not.toHaveProperty('groups')
        })

        it('should create a thread with groups', async () => {
            const mockThread = createMockThread({
                title: 'Notify Groups',
                content: 'Important group update',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Notify Groups',
                    content: 'Important group update',
                    groups: [100, 200],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
                title: 'Notify Groups',
                content: 'Important group update',
                recipients: undefined,
                groups: [100, 200],
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups).toEqual([100, 200])
            expect(structuredContent).not.toHaveProperty('recipients')
        })

        it('should preserve empty groups when creating a thread', async () => {
            const mockThread = createMockThread({
                title: 'Empty Groups',
                content: 'No group recipients',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Empty Groups',
                    content: 'No group recipients',
                    groups: [],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
                title: 'Empty Groups',
                content: 'No group recipients',
                recipients: undefined,
                groups: [],
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups).toEqual([])
            expect(structuredContent).not.toHaveProperty('recipients')
        })

        it('should create a thread with recipients and groups', async () => {
            const mockThread = createMockThread({
                title: 'Notify Users and Groups',
                content: 'Important broad update',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Notify Users and Groups',
                    content: 'Important broad update',
                    recipients: [TEST_IDS.USER_1],
                    groups: [100],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.createThread).toHaveBeenCalledWith({
                channelId: TEST_IDS.CHANNEL_1,
                title: 'Notify Users and Groups',
                content: 'Important broad update',
                recipients: [TEST_IDS.USER_1],
                groups: [100],
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.recipients).toEqual([TEST_IDS.USER_1])
            expect(structuredContent.groups).toEqual([100])
        })

        it('should unarchive the thread when displayInInbox is true', async () => {
            const mockThread = createMockThread({
                title: 'Inbox Thread',
                content: 'Should appear in Inbox',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)
            mockCommsApi.inbox.unarchiveThread.mockResolvedValue(undefined as never)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Inbox Thread',
                    content: 'Should appear in Inbox',
                    displayInInbox: true,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.inbox.unarchiveThread).toHaveBeenCalledWith(mockThread.id)
            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should unarchive the thread when COMMS_CREATE_THREAD_DISPLAY_IN_INBOX env var is set', async () => {
            process.env.COMMS_CREATE_THREAD_DISPLAY_IN_INBOX = 'true'

            const mockThread = createMockThread({
                title: 'Env Var Thread',
                content: 'Should appear in Inbox via env var',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)
            mockCommsApi.inbox.unarchiveThread.mockResolvedValue(undefined as never)

            const result = await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Env Var Thread',
                    content: 'Should appear in Inbox via env var',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.inbox.unarchiveThread).toHaveBeenCalledWith(mockThread.id)
            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should not unarchive when displayInInbox is false even if env var is set', async () => {
            process.env.COMMS_CREATE_THREAD_DISPLAY_IN_INBOX = 'true'

            const mockThread = createMockThread({
                title: 'Explicit False Thread',
                content: 'Should not unarchive',
            })
            mockCommsApi.threads.createThread.mockResolvedValue(mockThread)

            await createThread.execute(
                {
                    channelId: TEST_IDS.CHANNEL_1,
                    title: 'Explicit False Thread',
                    content: 'Should not unarchive',
                    displayInInbox: false,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.inbox.unarchiveThread).not.toHaveBeenCalled()
        })
    })

    describe('error handling', () => {
        it('should propagate API errors', async () => {
            const apiError = new Error('Channel not found')
            mockCommsApi.threads.createThread.mockRejectedValue(apiError)

            await expect(
                createThread.execute(
                    {
                        channelId: TEST_IDS.CHANNEL_1,
                        title: 'Test Thread',
                        content: 'Test content',
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Channel not found')
        })
    })
})
