import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    createMockChannel,
    extractStructuredContent,
    extractTextContent,
    TEST_ERRORS,
    TEST_IDS,
} from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { listChannels } from '../list-channels.js'

const mockCommsApi = {
    channels: {
        getChannels: jest.fn(),
    },
    workspaceUsers: {
        getUserById: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { LIST_CHANNELS } = ToolNames

describe(`${LIST_CHANNELS} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('listing channels', () => {
        it('should list all channels in a workspace', async () => {
            const otherChannelId = 'channel-id-other'
            const mockChannels = [
                createMockChannel(),
                createMockChannel({
                    id: otherChannelId,
                    name: 'Engineering',
                    public: false,
                    creator: TEST_IDS.USER_2,
                }),
            ]

            mockCommsApi.channels.getChannels.mockResolvedValue(mockChannels)
            mockCommsApi.workspaceUsers.getUserById.mockImplementation(
                async (args: { workspaceId: number; userId: number }) => {
                    if (args.userId === TEST_IDS.USER_1) {
                        return { fullName: 'Alice Johnson' } as never
                    }
                    if (args.userId === TEST_IDS.USER_2) {
                        return { fullName: 'Bob Smith' } as never
                    }
                    throw new Error('User not found')
                },
            )

            const result = await listChannels.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            expect(mockCommsApi.channels.getChannels).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })

            const textContent = extractTextContent(result)
            expect(textContent).toContain('Found 2 channels')
            expect(textContent).toContain('## [General]')
            expect(textContent).toContain('## [Engineering]')
            expect(textContent).toContain('**Public:** Yes')
            expect(textContent).toContain('**Public:** No')
            expect(textContent).toContain('Alice Johnson')
            expect(textContent).toContain('Bob Smith')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent).toEqual({
                type: 'list_channels',
                workspaceId: TEST_IDS.WORKSPACE_1,
                totalChannels: 2,
                channels: expect.arrayContaining([
                    expect.objectContaining({
                        id: TEST_IDS.CHANNEL_1,
                        name: 'General',
                        public: true,
                        archived: false,
                        creatorId: TEST_IDS.USER_1,
                        creatorName: 'Alice Johnson',
                    }),
                    expect.objectContaining({
                        id: otherChannelId,
                        name: 'Engineering',
                        public: false,
                        creatorId: TEST_IDS.USER_2,
                        creatorName: 'Bob Smith',
                    }),
                ]),
            })
        })

        it('should handle empty channel list', async () => {
            mockCommsApi.channels.getChannels.mockResolvedValue([])

            const result = await listChannels.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('No channels found.')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent).toEqual({
                type: 'list_channels',
                workspaceId: TEST_IDS.WORKSPACE_1,
                channels: [],
                totalChannels: 0,
            })
        })

        it('should handle single channel', async () => {
            mockCommsApi.channels.getChannels.mockResolvedValue([createMockChannel()])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice Johnson',
            } as never)

            const result = await listChannels.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('Found 1 channel in')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalChannels).toBe(1)
        })
    })

    describe('channel details', () => {
        it('should include description when present', async () => {
            mockCommsApi.channels.getChannels.mockResolvedValue([
                createMockChannel({ description: 'Main discussion channel' }),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listChannels.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Description:** Main discussion channel')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.channels[0]).toHaveProperty(
                'description',
                'Main discussion channel',
            )
        })

        it('should omit description when not present', async () => {
            mockCommsApi.channels.getChannels.mockResolvedValue([createMockChannel()])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listChannels.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).not.toContain('**Description:**')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.channels[0]).not.toHaveProperty('description')
        })

        it('should show archived status', async () => {
            mockCommsApi.channels.getChannels.mockResolvedValue([
                createMockChannel({ archived: true }),
            ])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listChannels.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Archived:** Yes')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.channels[0].archived).toBe(true)
        })

        it('should include color when present', async () => {
            mockCommsApi.channels.getChannels.mockResolvedValue([createMockChannel({ color: 5 })])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listChannels.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.channels[0]).toHaveProperty('color', 5)
        })

        it('should omit color when not present', async () => {
            mockCommsApi.channels.getChannels.mockResolvedValue([createMockChannel()])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listChannels.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.channels[0]).not.toHaveProperty('color')
        })
    })

    describe('creator resolution', () => {
        it('should deduplicate creator lookups', async () => {
            const mockChannels = [
                createMockChannel({ creator: TEST_IDS.USER_1 }),
                createMockChannel({ id: 'channel-id-2', name: 'Other', creator: TEST_IDS.USER_1 }),
                createMockChannel({ id: 'channel-id-3', name: 'Third', creator: TEST_IDS.USER_2 }),
            ]

            mockCommsApi.channels.getChannels.mockResolvedValue(mockChannels)
            mockCommsApi.workspaceUsers.getUserById.mockImplementation(
                async (args: { workspaceId: number; userId: number }) => {
                    if (args.userId === TEST_IDS.USER_1) return { fullName: 'Alice' } as never
                    if (args.userId === TEST_IDS.USER_2) return { fullName: 'Bob' } as never
                    throw new Error('User not found')
                },
            )

            await listChannels.execute({ workspaceId: TEST_IDS.WORKSPACE_1 }, mockCommsApi)

            // Should only fetch 2 unique creators, not 3
            expect(mockCommsApi.workspaceUsers.getUserById).toHaveBeenCalledTimes(2)
        })

        it('falls back to the raw creator id when getUserById fails for that creator', async () => {
            const mockChannels = [
                createMockChannel({ creator: TEST_IDS.USER_1 }),
                createMockChannel({ id: 'channel-id-2', name: 'Other', creator: TEST_IDS.USER_2 }),
            ]

            mockCommsApi.channels.getChannels.mockResolvedValue(mockChannels)
            mockCommsApi.workspaceUsers.getUserById.mockImplementation(
                async (args: { workspaceId: number; userId: number }) => {
                    if (args.userId === TEST_IDS.USER_1) return { fullName: 'Alice' } as never
                    throw new Error('User not found')
                },
            )

            const result = await listChannels.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            // Resolved creator gets a name; the failing one shows the raw ID
            const text = extractTextContent(result)
            expect(text).toContain(`Alice (${TEST_IDS.USER_1})`)
            expect(text).toContain(`**Creator:** ${TEST_IDS.USER_2}`)

            const structured = result.structuredContent as {
                channels: Array<{ creatorId: number; creatorName?: string }>
            }
            const aliceChannel = structured.channels.find((c) => c.creatorId === TEST_IDS.USER_1)
            const orphanChannel = structured.channels.find((c) => c.creatorId === TEST_IDS.USER_2)
            expect(aliceChannel?.creatorName).toBe('Alice')
            expect(orphanChannel?.creatorName).toBeUndefined()
        })
    })

    describe('includeArchived', () => {
        it('should only fetch active channels by default', async () => {
            mockCommsApi.channels.getChannels.mockResolvedValue([createMockChannel()])
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            await listChannels.execute({ workspaceId: TEST_IDS.WORKSPACE_1 }, mockCommsApi)

            expect(mockCommsApi.channels.getChannels).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.channels.getChannels).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })
        })

        it('should fetch active and archived channels in parallel when includeArchived is true', async () => {
            const activeChannel = createMockChannel({ name: 'Active' })
            const archivedChannel = createMockChannel({
                id: 'channel-id-2',
                name: 'Archived',
                archived: true,
                creator: TEST_IDS.USER_1,
            })

            mockCommsApi.channels.getChannels.mockImplementation(async (args) => {
                if ('archived' in args && args.archived === true) {
                    return [archivedChannel]
                }
                return [activeChannel]
            })
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
                fullName: 'Alice',
            } as never)

            const result = await listChannels.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, includeArchived: true },
                mockCommsApi,
            )

            expect(mockCommsApi.channels.getChannels).toHaveBeenCalledTimes(2)
            expect(mockCommsApi.channels.getChannels).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })
            expect(mockCommsApi.channels.getChannels).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
                archived: true,
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalChannels).toBe(2)
            expect(structuredContent.channels).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'Active', archived: false }),
                    expect.objectContaining({ name: 'Archived', archived: true }),
                ]),
            )
        })
    })

    describe('error handling', () => {
        it('should propagate API errors', async () => {
            const apiError = new Error(TEST_ERRORS.API_UNAUTHORIZED)
            mockCommsApi.channels.getChannels.mockRejectedValue(apiError)

            await expect(
                listChannels.execute({ workspaceId: TEST_IDS.WORKSPACE_1 }, mockCommsApi),
            ).rejects.toThrow(TEST_ERRORS.API_UNAUTHORIZED)
        })
    })
})
