import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    createMockComment,
    createMockThread,
    extractTextContent,
    TEST_IDS,
} from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { loadThread } from '../load-thread.js'

// Mock the Comms API
const mockCommsApi = {
    threads: {
        getThread: jest.fn(),
    },
    comments: {
        getComments: jest.fn(),
    },
    channels: {
        getChannel: jest.fn(),
    },
    workspaceUsers: {
        getUserById: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { LOAD_THREAD } = ToolNames

const makeChannel = () => ({
    id: TEST_IDS.CHANNEL_1,
    name: 'Test Channel',
    workspaceId: TEST_IDS.WORKSPACE_1,
    created: new Date(),
    archived: false,
    public: true,
    color: 0,
    creator: TEST_IDS.USER_1,
    version: 1,
})

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

describe(`${LOAD_THREAD} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('loading threads successfully', () => {
        it('should load thread with comments and participants', async () => {
            const mockThread = createMockThread({
                participants: [TEST_IDS.USER_1, TEST_IDS.USER_2],
            })
            const mockComments = [
                createMockComment({ id: TEST_IDS.COMMENT_1, creator: TEST_IDS.USER_1 }),
                createMockComment({ id: TEST_IDS.COMMENT_2, creator: TEST_IDS.USER_2 }),
            ]

            mockCommsApi.threads.getThread.mockResolvedValue(mockThread)
            mockCommsApi.comments.getComments.mockResolvedValue(mockComments)
            mockCommsApi.channels.getChannel.mockResolvedValue(makeChannel())
            mockCommsApi.workspaceUsers.getUserById.mockImplementation((async (args: {
                workspaceId: number
                userId: number
            }) => {
                if (args.userId === TEST_IDS.USER_1) {
                    return makeUser(TEST_IDS.USER_1, 'Test User 1')
                }
                return makeUser(TEST_IDS.USER_2, 'Test User 2')
            }) as never)

            const result = await loadThread.execute(
                { threadId: TEST_IDS.THREAD_1, limit: 50, includeParticipants: true },
                mockCommsApi,
            )

            expect(mockCommsApi.threads.getThread).toHaveBeenCalledWith(TEST_IDS.THREAD_1)
            expect(mockCommsApi.comments.getComments).toHaveBeenCalledWith({
                threadId: TEST_IDS.THREAD_1,
                newerThan: undefined,
                olderThan: undefined,
                limit: 50,
            })

            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    type: 'thread_data',
                    totalComments: mockThread.commentCount,
                }),
            )
            expect(structuredContent?.thread.id).toBe(TEST_IDS.THREAD_1)
            expect(structuredContent?.thread.title).toBe('Test Thread')
            expect(structuredContent?.thread.channelId).toBe(mockThread.channelId)
            expect(structuredContent?.thread.channelName).toBe('Test Channel')
            expect(structuredContent?.thread.workspaceId).toBe(mockThread.workspaceId)
            expect(structuredContent?.thread.creatorName).toBe('Test User 1')
            expect(structuredContent?.thread.posted).toBe('2024-01-01T00:00:00.000Z')
            expect(structuredContent?.comments).toHaveLength(2)
            const { comments } = structuredContent || {}
            if (comments?.[0]) {
                expect(comments[0].id).toBe(TEST_IDS.COMMENT_1)
                expect(comments[0].creatorName).toBe('Test User 1')
                expect(comments[0].posted).toBe('2024-01-01T00:00:00.000Z')
            }
            expect(structuredContent?.thread.participants).toEqual([
                TEST_IDS.USER_1,
                TEST_IDS.USER_2,
            ])
            expect(structuredContent?.thread.participantNames).toEqual([
                'Test User 1',
                'Test User 2',
            ])
        })

        it('should load thread without participants when includeParticipants is false', async () => {
            const mockThread = createMockThread({
                participants: [TEST_IDS.USER_1, TEST_IDS.USER_2],
            })
            mockCommsApi.threads.getThread.mockResolvedValue(mockThread)
            mockCommsApi.comments.getComments.mockResolvedValue([])
            mockCommsApi.channels.getChannel.mockResolvedValue(makeChannel())
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(
                makeUser(TEST_IDS.USER_1, 'Test User 1') as never,
            )

            const result = await loadThread.execute(
                {
                    threadId: TEST_IDS.THREAD_1,
                    limit: 50,
                    includeParticipants: false,
                },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toMatchSnapshot()
            expect(textContent).not.toContain('## Participants')
        })

        it('should filter comments by date', async () => {
            const mockThread = createMockThread()
            mockCommsApi.threads.getThread.mockResolvedValue(mockThread)
            mockCommsApi.comments.getComments.mockResolvedValue([])
            mockCommsApi.channels.getChannel.mockResolvedValue(makeChannel())
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(
                makeUser(TEST_IDS.USER_1, 'Test User 1') as never,
            )

            const result = await loadThread.execute(
                {
                    threadId: TEST_IDS.THREAD_1,
                    newerThanDate: '2024-01-01',
                    limit: 50,
                    includeParticipants: true,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.comments.getComments).toHaveBeenCalledWith(
                expect.objectContaining({
                    newerThan: expect.any(Date),
                }),
            )

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should handle thread with no comments', async () => {
            const mockThread = createMockThread()
            mockCommsApi.threads.getThread.mockResolvedValue(mockThread)
            mockCommsApi.comments.getComments.mockResolvedValue([])
            mockCommsApi.channels.getChannel.mockResolvedValue(makeChannel())
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(
                makeUser(TEST_IDS.USER_1, 'Test User 1') as never,
            )

            const result = await loadThread.execute(
                { threadId: TEST_IDS.THREAD_1, limit: 50, includeParticipants: true },
                mockCommsApi,
            )

            expect(extractTextContent(result)).toMatchSnapshot()
        })
    })

    describe('attachments', () => {
        const sampleAttachment = {
            attachmentId: 'abc-123',
            fileName: 'ssh-public-key.md',
            fileSize: 580,
            title: 'ssh-public-key.md',
            underlyingType: 'application/octet-stream',
            uploadState: 'uploaded',
            url: 'https://comms.todoist.com/files/abc/as/22222/ssh-public-key.md',
            urlType: 'file',
        }

        it('surfaces comment attachments in structured + text output', async () => {
            const mockThread = createMockThread()
            const mockComment = createMockComment({
                id: TEST_IDS.COMMENT_1,
                creator: TEST_IDS.USER_1,
                attachments: [sampleAttachment],
            })

            mockCommsApi.threads.getThread.mockResolvedValue(mockThread)
            mockCommsApi.comments.getComments.mockResolvedValue([mockComment])
            mockCommsApi.channels.getChannel.mockResolvedValue(makeChannel())
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(
                makeUser(TEST_IDS.USER_1, 'Test User 1') as never,
            )

            const result = await loadThread.execute(
                { threadId: TEST_IDS.THREAD_1, limit: 50, includeParticipants: true },
                mockCommsApi,
            )

            const { structuredContent } = result
            expect(structuredContent?.comments[0]?.attachments).toHaveLength(1)
            expect(structuredContent?.comments[0]?.attachments?.[0]).toMatchObject({
                fileName: 'ssh-public-key.md',
                url: sampleAttachment.url,
            })

            const text = extractTextContent(result)
            expect(text).toContain('**Attachments (1):**')
            expect(text).toContain('ssh-public-key.md')
            expect(text).toContain(sampleAttachment.url)
        })

        it('surfaces thread-body attachments', async () => {
            const mockThread = createMockThread({ attachments: [sampleAttachment] })
            mockCommsApi.threads.getThread.mockResolvedValue(mockThread)
            mockCommsApi.comments.getComments.mockResolvedValue([])
            mockCommsApi.channels.getChannel.mockResolvedValue(makeChannel())
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(
                makeUser(TEST_IDS.USER_1, 'Test User 1') as never,
            )

            const result = await loadThread.execute(
                { threadId: TEST_IDS.THREAD_1, limit: 50, includeParticipants: true },
                mockCommsApi,
            )

            const { structuredContent } = result
            expect(structuredContent?.thread.attachments).toHaveLength(1)
            expect(extractTextContent(result)).toContain('**Attachments (1):**')
        })

        it('omits attachments field when there are none', async () => {
            const mockThread = createMockThread()
            const mockComment = createMockComment({ attachments: [] })
            mockCommsApi.threads.getThread.mockResolvedValue(mockThread)
            mockCommsApi.comments.getComments.mockResolvedValue([mockComment])
            mockCommsApi.channels.getChannel.mockResolvedValue(makeChannel())
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(
                makeUser(TEST_IDS.USER_1, 'Test User 1') as never,
            )

            const result = await loadThread.execute(
                { threadId: TEST_IDS.THREAD_1, limit: 50, includeParticipants: true },
                mockCommsApi,
            )

            const { structuredContent } = result
            expect(structuredContent?.thread.attachments).toBeUndefined()
            expect(structuredContent?.comments[0]?.attachments).toBeUndefined()
            expect(extractTextContent(result)).not.toContain('**Attachments')
        })
    })

    describe('error handling', () => {
        it('should propagate thread not found error', async () => {
            const apiError = new Error('Thread not found')
            mockCommsApi.threads.getThread.mockRejectedValue(apiError)

            await expect(
                loadThread.execute(
                    { threadId: TEST_IDS.THREAD_1, limit: 50, includeParticipants: true },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Thread not found')
        })
    })
})
