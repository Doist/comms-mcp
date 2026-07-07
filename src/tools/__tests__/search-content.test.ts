import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import { extractTextContent, TEST_IDS } from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { searchContent } from '../search-content.js'

// Mock the Comms API
const mockCommsApi = {
    batch: jest.fn(),
    search: {
        search: jest.fn(),
    },
    channels: {
        getChannel: jest.fn(),
    },
    workspaceUsers: {
        getUserById: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { SEARCH_CONTENT } = ToolNames

describe(`${SEARCH_CONTENT} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // Mock batch to return responses with .data property
        mockCommsApi.batch.mockImplementation(async (...args: readonly unknown[]) => {
            const results = []
            for (const arg of args) {
                const result = await arg
                results.push({ data: result })
            }
            return results as never
        })
    })

    describe('workspace search', () => {
        it('should search across workspace with results', async () => {
            mockCommsApi.search.search.mockResolvedValue({
                items: [
                    {
                        id: `thread_${TEST_IDS.THREAD_1}`,
                        type: 'thread' as const,
                        snippet: 'Test thread matching query',
                        snippetCreatorId: TEST_IDS.USER_1,
                        snippetLastUpdated: new Date('2024-01-01T00:00:00Z'),
                        channelId: TEST_IDS.CHANNEL_1,
                        threadId: TEST_IDS.THREAD_1,
                        channelName: 'Test Channel',
                        channelColor: 1,
                        title: 'Test Thread',
                        closed: false,
                    },
                    // A comment match: still a 'thread' result, with commentId set
                    {
                        id: `thread_${TEST_IDS.THREAD_2}`,
                        type: 'thread' as const,
                        snippet: 'Test comment matching query',
                        snippetCreatorId: TEST_IDS.USER_1,
                        snippetLastUpdated: new Date('2024-01-01T00:00:00Z'),
                        channelId: TEST_IDS.CHANNEL_1,
                        threadId: TEST_IDS.THREAD_2,
                        commentId: TEST_IDS.COMMENT_1,
                    },
                ],
                hasMore: false,
                isPlanRestricted: false,
            })
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                id: TEST_IDS.USER_1,
                fullName: 'Test User 1',
                shortName: 'TU1',
                email: 'user1@test.com',
                userType: 'USER' as const,
                removed: false,
                timezone: 'UTC',
                version: 1,
            } as never)
            mockCommsApi.channels.getChannel.mockResolvedValue({
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

            const result = await searchContent.execute(
                {
                    query: 'test query',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    limit: 50,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.search.search).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: 'test query',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    limit: 50,
                }),
            )

            expect(extractTextContent(result)).toMatchSnapshot()

            const { structuredContent } = result
            expect(structuredContent).toEqual(
                expect.objectContaining({
                    type: 'search_results',
                    query: 'test query',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    totalResults: 2,
                    hasMore: false,
                }),
            )
            expect(structuredContent?.results).toHaveLength(2)
            expect(structuredContent?.results[0]).toEqual(
                expect.objectContaining({
                    id: `thread_${TEST_IDS.THREAD_1}`,
                    type: 'thread',
                    threadId: TEST_IDS.THREAD_1,
                    content: 'Test thread matching query',
                    created: '2024-01-01T00:00:00.000Z',
                    creatorName: 'Test User 1',
                    channelName: 'Test Channel',
                    url: `https://comms.todoist.com/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/t/${TEST_IDS.THREAD_1}/`,
                }),
            )
            // The comment match keeps the thread as container and deep-links to the comment
            expect(structuredContent?.results[1]).toEqual(
                expect.objectContaining({
                    id: `thread_${TEST_IDS.THREAD_2}`,
                    type: 'thread',
                    threadId: TEST_IDS.THREAD_2,
                    commentId: TEST_IDS.COMMENT_1,
                    creatorName: 'Test User 1',
                    url: `https://comms.todoist.com/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/t/${TEST_IDS.THREAD_2}/c/${TEST_IDS.COMMENT_1}`,
                }),
            )
        })

        it('should search with filters', async () => {
            mockCommsApi.search.search.mockResolvedValue({
                items: [
                    {
                        id: `thread_${TEST_IDS.THREAD_1}`,
                        type: 'thread' as const,
                        snippet: 'Filtered result',
                        snippetCreatorId: TEST_IDS.USER_1,
                        snippetLastUpdated: new Date('2024-01-01T00:00:00Z'),
                        channelId: TEST_IDS.CHANNEL_1,
                        threadId: TEST_IDS.THREAD_1,
                    },
                ],
                hasMore: false,
                isPlanRestricted: false,
            })
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                id: TEST_IDS.USER_1,
                fullName: 'Test User 1',
                shortName: 'TU1',
                email: 'user1@test.com',
                userType: 'USER' as const,
                removed: false,
                timezone: 'UTC',
                version: 1,
            } as never)
            mockCommsApi.channels.getChannel.mockResolvedValue({
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

            const result = await searchContent.execute(
                {
                    query: 'filtered',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    channelIds: [TEST_IDS.CHANNEL_1],
                    authorIds: [TEST_IDS.USER_1],
                    mentionSelf: true,
                    dateFrom: '2024-01-01',
                    dateTo: '2024-12-31',
                    limit: 25,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.search.search).toHaveBeenCalledWith({
                query: 'filtered',
                workspaceId: TEST_IDS.WORKSPACE_1,
                channelIds: [TEST_IDS.CHANNEL_1],
                authorIds: [TEST_IDS.USER_1],
                mentionSelf: true,
                dateFrom: '2024-01-01',
                dateTo: '2024-12-31',
                limit: 25,
                cursor: undefined,
            })

            expect(extractTextContent(result)).toMatchSnapshot()
        })

        it('should handle pagination', async () => {
            mockCommsApi.search.search.mockResolvedValue({
                items: [
                    {
                        id: `conversation_${TEST_IDS.CONVERSATION_1}`,
                        type: 'conversation' as const,
                        snippet: 'Page 1 result',
                        snippetCreatorId: TEST_IDS.USER_1,
                        snippetLastUpdated: new Date('2024-01-01T00:00:00Z'),
                        conversationId: TEST_IDS.CONVERSATION_1,
                    },
                ],
                hasMore: true,
                nextCursorMark: 'next-cursor-123',
                isPlanRestricted: false,
            })
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                id: TEST_IDS.USER_1,
                fullName: 'Test User 1',
                shortName: 'TU1',
                email: 'user1@test.com',
                userType: 'USER' as const,
                removed: false,
                timezone: 'UTC',
                version: 1,
            } as never)

            const result = await searchContent.execute(
                {
                    query: 'paginated',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    limit: 10,
                },
                mockCommsApi,
            )

            const { structuredContent } = result
            expect(structuredContent?.hasMore).toBe(true)
            expect(structuredContent?.cursor).toBe('next-cursor-123')

            expect(extractTextContent(result)).toContain('More results available')
        })
    })

    describe('conversation results', () => {
        it('should handle conversation type results with correct URL', async () => {
            mockCommsApi.search.search.mockResolvedValue({
                items: [
                    {
                        id: `conversation_${TEST_IDS.CONVERSATION_1}`,
                        type: 'conversation' as const,
                        snippet: 'Conversation matching query',
                        snippetCreatorId: TEST_IDS.USER_1,
                        snippetLastUpdated: new Date('2024-01-01T00:00:00Z'),
                        conversationId: TEST_IDS.CONVERSATION_1,
                    },
                ],
                hasMore: false,
                isPlanRestricted: false,
            })
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                id: TEST_IDS.USER_1,
                fullName: 'Test User 1',
                shortName: 'TU1',
                email: 'user1@test.com',
                userType: 'USER' as const,
                removed: false,
                timezone: 'UTC',
                version: 1,
            } as never)

            const result = await searchContent.execute(
                {
                    query: 'conversation test',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    limit: 50,
                },
                mockCommsApi,
            )

            const { structuredContent } = result
            expect(structuredContent?.results).toHaveLength(1)
            expect(structuredContent?.results[0]).toEqual(
                expect.objectContaining({
                    id: `conversation_${TEST_IDS.CONVERSATION_1}`,
                    type: 'conversation',
                    conversationId: TEST_IDS.CONVERSATION_1,
                    content: 'Conversation matching query',
                    url: `https://comms.todoist.com/${TEST_IDS.WORKSPACE_1}/msg/${TEST_IDS.CONVERSATION_1}/`,
                }),
            )
        })
    })

    describe('malformed results', () => {
        it('should drop results without a container id', async () => {
            mockCommsApi.search.search.mockResolvedValue({
                items: [
                    {
                        id: `thread_${TEST_IDS.THREAD_1}`,
                        type: 'thread' as const,
                        snippet: 'Valid result',
                        snippetCreatorId: TEST_IDS.USER_1,
                        snippetLastUpdated: new Date('2024-01-01T00:00:00Z'),
                        channelId: TEST_IDS.CHANNEL_1,
                        threadId: TEST_IDS.THREAD_1,
                    },
                    {
                        id: 'thread_orphaned',
                        type: 'thread' as const,
                        snippet: 'Malformed result without threadId',
                        snippetCreatorId: TEST_IDS.USER_1,
                        snippetLastUpdated: new Date('2024-01-01T00:00:00Z'),
                        threadId: null,
                    },
                ],
                hasMore: false,
                isPlanRestricted: false,
            })
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                id: TEST_IDS.USER_1,
                fullName: 'Test User 1',
                shortName: 'TU1',
                email: 'user1@test.com',
                userType: 'USER' as const,
                removed: false,
                timezone: 'UTC',
                version: 1,
            } as never)
            mockCommsApi.channels.getChannel.mockResolvedValue({
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

            const result = await searchContent.execute(
                {
                    query: 'test',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    limit: 50,
                },
                mockCommsApi,
            )

            const { structuredContent } = result
            expect(structuredContent?.results).toHaveLength(1)
            expect(structuredContent?.totalResults).toBe(1)
            expect(structuredContent?.results[0]).toEqual(
                expect.objectContaining({ threadId: TEST_IDS.THREAD_1 }),
            )
        })
    })

    describe('empty results', () => {
        it('should handle no results found', async () => {
            mockCommsApi.search.search.mockResolvedValue({
                items: [],
                hasMore: false,
                isPlanRestricted: false,
            })

            const result = await searchContent.execute(
                {
                    query: 'nonexistent',
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    limit: 50,
                },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('No results found')
            expect(textContent).toMatchSnapshot()
        })
    })

    describe('error handling', () => {
        it('should propagate API errors', async () => {
            mockCommsApi.search.search.mockRejectedValue(new Error('Search API error'))

            await expect(
                searchContent.execute(
                    {
                        query: 'test',
                        workspaceId: TEST_IDS.WORKSPACE_1,
                        limit: 50,
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('Search API error')
        })
    })
})
