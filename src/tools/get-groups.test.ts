import type { Group, CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    createMockUser,
    extractStructuredContent,
    extractTextContent,
    TEST_ERRORS,
    TEST_IDS,
} from '../utils/test-helpers.js'
import { ToolNames } from '../utils/tool-names.js'
import { getGroups } from './get-groups.js'

const mockCommsApi = {
    groups: {
        getGroups: jest.fn(),
        getGroup: jest.fn(),
    },
    workspaceUsers: {
        getWorkspaceUsers: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { GET_GROUPS } = ToolNames

const createMockGroup = (overrides: Partial<Group> = {}): Group => ({
    id: TEST_IDS.GROUP_1,
    name: 'Product Automation',
    description: 'Automation recipients',
    workspaceId: TEST_IDS.WORKSPACE_1,
    userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
    version: 1,
    ...overrides,
})

describe(`${GET_GROUPS} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('fetching groups', () => {
        it('should fetch all workspace groups by default', async () => {
            const mockGroups = [
                createMockGroup(),
                createMockGroup({
                    id: TEST_IDS.GROUP_2,
                    name: 'Engineering',
                    description: null,
                    userIds: [TEST_IDS.USER_3],
                }),
            ]

            mockCommsApi.groups.getGroups.mockResolvedValue(mockGroups)

            const result = await getGroups.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            expect(mockCommsApi.groups.getGroups).toHaveBeenCalledWith(TEST_IDS.WORKSPACE_1)
            expect(mockCommsApi.groups.getGroup).not.toHaveBeenCalled()

            const textContent = extractTextContent(result)
            expect(textContent).toContain(`**Workspace ID:** ${TEST_IDS.WORKSPACE_1}`)
            expect(textContent).toContain('**Total Groups:** 2')
            expect(textContent).toContain('## Product Automation')
            expect(textContent).toContain('## Engineering')
            expect(textContent).toContain('**Members:** 2')
            expect(textContent).not.toContain('Automation recipients')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent).toEqual({
                type: 'get_groups',
                workspaceId: TEST_IDS.WORKSPACE_1,
                totalGroups: 2,
                filteredGroups: 2,
                groups: expect.arrayContaining([
                    expect.objectContaining({
                        id: TEST_IDS.GROUP_1,
                        name: 'Product Automation',
                        memberCount: 2,
                    }),
                    expect.objectContaining({
                        id: TEST_IDS.GROUP_2,
                        name: 'Engineering',
                        memberCount: 1,
                    }),
                ]),
            })
            expect(structuredContent.groups[0]).not.toHaveProperty('description')
            expect(structuredContent.groups[0]).not.toHaveProperty('userIds')
            expect(structuredContent.groups[0]).not.toHaveProperty('version')
            expect(structuredContent.groups[0]).not.toHaveProperty('members')
            expect(mockCommsApi.workspaceUsers.getWorkspaceUsers).not.toHaveBeenCalled()
        })

        it('should handle empty groupIds array by fetching all groups', async () => {
            mockCommsApi.groups.getGroups.mockResolvedValue([createMockGroup()])

            const result = await getGroups.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, groupIds: [] },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups).toHaveLength(1)
        })
    })

    describe('filtering groups', () => {
        it('should fetch specific groups by ID', async () => {
            const otherGroupId = 'group-id-marketing'
            mockCommsApi.groups.getGroup.mockImplementation(
                async (args: { id: string; workspaceId: number }) => {
                    if (args.id === TEST_IDS.GROUP_1) {
                        return createMockGroup({
                            id: TEST_IDS.GROUP_1,
                            name: 'Product Automation',
                        })
                    }
                    if (args.id === otherGroupId) {
                        return createMockGroup({ id: otherGroupId, name: 'Marketing' })
                    }
                    throw new Error('Group not found')
                },
            )

            const result = await getGroups.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    groupIds: [TEST_IDS.GROUP_1, otherGroupId],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.groups.getGroups).not.toHaveBeenCalled()
            expect(mockCommsApi.groups.getGroup).toHaveBeenCalledTimes(2)

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Total Groups:** 2')
            expect(textContent).toContain('## Product Automation')
            expect(textContent).toContain('## Marketing')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalGroups).toBe(2)
            expect(structuredContent.groups).toHaveLength(2)
        })

        it('should filter groups by name search case-insensitively', async () => {
            const mockGroups = [
                createMockGroup({ id: TEST_IDS.GROUP_1, name: 'Product Automation' }),
                createMockGroup({ id: TEST_IDS.GROUP_2, name: 'Engineering' }),
                createMockGroup({ id: 'group-id-3', name: 'Automation QA' }),
            ]

            mockCommsApi.groups.getGroups.mockResolvedValue(mockGroups)

            const result = await getGroups.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'AUTOMATION' },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Total Groups:** 3 (2 matching search)')
            expect(textContent).toContain('## Product Automation')
            expect(textContent).toContain('## Automation QA')
            expect(textContent).not.toContain('## Engineering')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalGroups).toBe(3)
            expect(structuredContent.filteredGroups).toBe(2)
            expect(structuredContent.groups).toHaveLength(2)
        })

        it('should combine ID and search filters', async () => {
            const otherGroupId = 'group-id-marketing'
            mockCommsApi.groups.getGroup.mockImplementation(
                async (args: { id: string; workspaceId: number }) => {
                    if (args.id === TEST_IDS.GROUP_1) {
                        return createMockGroup({
                            id: TEST_IDS.GROUP_1,
                            name: 'Product Automation',
                        })
                    }
                    if (args.id === otherGroupId) {
                        return createMockGroup({ id: otherGroupId, name: 'Marketing' })
                    }
                    throw new Error('Group not found')
                },
            )

            const result = await getGroups.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    groupIds: [TEST_IDS.GROUP_1, otherGroupId],
                    searchText: 'auto',
                },
                mockCommsApi,
            )

            expect(mockCommsApi.groups.getGroups).not.toHaveBeenCalled()

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Total Groups:** 2 (1 matching search)')
            expect(textContent).toContain('## Product Automation')
            expect(textContent).not.toContain('## Marketing')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalGroups).toBe(2)
            expect(structuredContent.filteredGroups).toBe(1)
            expect(structuredContent.groups).toHaveLength(1)
        })

        it('should handle no matching groups', async () => {
            mockCommsApi.groups.getGroups.mockResolvedValue([createMockGroup()])

            const result = await getGroups.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'nonexistent' },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Total Groups:** 1 (0 matching search)')
            expect(textContent).toContain('No groups found.')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalGroups).toBe(1)
            expect(structuredContent.filteredGroups).toBe(0)
            expect(structuredContent.groups).toHaveLength(0)
        })
    })

    describe('including members', () => {
        it('should list resolved members when includeMembers is true', async () => {
            mockCommsApi.groups.getGroups.mockResolvedValue([
                createMockGroup({ userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2] }),
            ])
            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue([
                createMockUser({
                    id: TEST_IDS.USER_1,
                    fullName: 'Ada Lovelace',
                    email: 'ada@example.com',
                }),
                createMockUser({
                    id: TEST_IDS.USER_2,
                    fullName: 'Grace Hopper',
                    email: 'grace@example.com',
                }),
                createMockUser({ id: TEST_IDS.USER_3, fullName: 'Not In Group' }),
            ])

            const result = await getGroups.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, includeMembers: true },
                mockCommsApi,
            )

            expect(mockCommsApi.workspaceUsers.getWorkspaceUsers).toHaveBeenCalledTimes(1)
            expect(mockCommsApi.workspaceUsers.getWorkspaceUsers).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Members:** 2')
            expect(textContent).toContain(
                `- Ada Lovelace (id:${TEST_IDS.USER_1}) <ada@example.com>`,
            )
            expect(textContent).toContain(
                `- Grace Hopper (id:${TEST_IDS.USER_2}) <grace@example.com>`,
            )
            expect(textContent).not.toContain('Not In Group')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups[0]?.members).toEqual([
                { id: TEST_IDS.USER_1, name: 'Ada Lovelace', email: 'ada@example.com' },
                { id: TEST_IDS.USER_2, name: 'Grace Hopper', email: 'grace@example.com' },
            ])
        })

        it('should fetch workspace users only once and map each member to its own group', async () => {
            mockCommsApi.groups.getGroups.mockResolvedValue([
                createMockGroup({ userIds: [TEST_IDS.USER_1] }),
                createMockGroup({
                    id: TEST_IDS.GROUP_2,
                    name: 'Engineering',
                    userIds: [TEST_IDS.USER_2],
                }),
            ])
            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue([
                createMockUser({
                    id: TEST_IDS.USER_1,
                    fullName: 'Ada Lovelace',
                    email: 'ada@example.com',
                }),
                createMockUser({
                    id: TEST_IDS.USER_2,
                    fullName: 'Grace Hopper',
                    email: 'grace@example.com',
                }),
            ])

            const result = await getGroups.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, includeMembers: true },
                mockCommsApi,
            )

            expect(mockCommsApi.workspaceUsers.getWorkspaceUsers).toHaveBeenCalledTimes(1)

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups[0]?.members).toEqual([
                { id: TEST_IDS.USER_1, name: 'Ada Lovelace', email: 'ada@example.com' },
            ])
            expect(structuredContent.groups[1]?.members).toEqual([
                { id: TEST_IDS.USER_2, name: 'Grace Hopper', email: 'grace@example.com' },
            ])
        })

        it('should return the bare ID for unresolvable members', async () => {
            const unknownUserId = 99999
            mockCommsApi.groups.getGroups.mockResolvedValue([
                createMockGroup({ userIds: [TEST_IDS.USER_1, unknownUserId] }),
            ])
            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue([
                createMockUser({ id: TEST_IDS.USER_1, fullName: 'Ada Lovelace' }),
            ])

            const result = await getGroups.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, includeMembers: true },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain(`- user:${unknownUserId} (id:${unknownUserId})`)

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups[0]?.members?.[1]).toEqual({ id: unknownUserId })
        })

        it('should include members for groups fetched by ID', async () => {
            mockCommsApi.groups.getGroup.mockResolvedValue(
                createMockGroup({ userIds: [TEST_IDS.USER_1] }),
            )
            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue([
                createMockUser({
                    id: TEST_IDS.USER_1,
                    fullName: 'Ada Lovelace',
                    email: 'ada@example.com',
                }),
            ])

            const result = await getGroups.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    groupIds: [TEST_IDS.GROUP_1],
                    includeMembers: true,
                },
                mockCommsApi,
            )

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups[0]?.members).toEqual([
                { id: TEST_IDS.USER_1, name: 'Ada Lovelace', email: 'ada@example.com' },
            ])
        })

        it('should return an empty member list without a directory read for empty groups', async () => {
            mockCommsApi.groups.getGroups.mockResolvedValue([createMockGroup({ userIds: [] })])

            const result = await getGroups.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, includeMembers: true },
                mockCommsApi,
            )

            expect(mockCommsApi.workspaceUsers.getWorkspaceUsers).not.toHaveBeenCalled()

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups[0]?.members).toEqual([])
            expect(extractTextContent(result)).not.toContain('could not be looked up')
        })

        it('should degrade to user IDs and say so when the directory is unreadable', async () => {
            mockCommsApi.groups.getGroups.mockResolvedValue([
                createMockGroup({ userIds: [TEST_IDS.USER_1] }),
            ])
            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockRejectedValue(
                new Error(TEST_ERRORS.API_UNAUTHORIZED),
            )

            const result = await getGroups.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, includeMembers: true },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Note:** Member names could not be looked up')
            expect(textContent).toContain(`- user:${TEST_IDS.USER_1} (id:${TEST_IDS.USER_1})`)

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups[0]?.members).toEqual([{ id: TEST_IDS.USER_1 }])
        })

        it('should skip the user fetch when no groups match', async () => {
            mockCommsApi.groups.getGroups.mockResolvedValue([createMockGroup()])

            const result = await getGroups.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    searchText: 'nonexistent',
                    includeMembers: true,
                },
                mockCommsApi,
            )

            expect(mockCommsApi.workspaceUsers.getWorkspaceUsers).not.toHaveBeenCalled()

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups).toHaveLength(0)
        })
    })

    describe('edge cases', () => {
        it('should handle empty group list', async () => {
            mockCommsApi.groups.getGroups.mockResolvedValue([])

            const result = await getGroups.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Total Groups:** 0')
            expect(textContent).toContain('No groups found.')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.groups).toHaveLength(0)
        })
    })

    describe('error handling', () => {
        it('should propagate API errors', async () => {
            const apiError = new Error(TEST_ERRORS.API_UNAUTHORIZED)
            mockCommsApi.groups.getGroups.mockRejectedValue(apiError)

            await expect(
                getGroups.execute({ workspaceId: TEST_IDS.WORKSPACE_1 }, mockCommsApi),
            ).rejects.toThrow(TEST_ERRORS.API_UNAUTHORIZED)
        })
    })
})
