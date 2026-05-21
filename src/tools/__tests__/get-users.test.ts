import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    extractStructuredContent,
    extractTextContent,
    TEST_ERRORS,
    TEST_IDS,
} from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { getUsers } from '../get-users.js'

// Mock the Comms API
const mockCommsApi = {
    workspaceUsers: {
        getWorkspaceUsers: jest.fn(),
        getUserById: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { GET_USERS } = ToolNames

const createMockWorkspaceUser = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: TEST_IDS.USER_1,
    fullName: 'Alice Johnson',
    shortName: 'Alice',
    email: 'alice@example.com',
    removed: false,
    timezone: 'America/New_York',
    userType: 'USER' as const,
    version: 1,
    ...overrides,
})

describe(`${GET_USERS} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('fetching all users', () => {
        it('should fetch all workspace users by default', async () => {
            const mockUsers = [
                createMockWorkspaceUser(),
                createMockWorkspaceUser({
                    id: TEST_IDS.USER_2,
                    fullName: 'Bob Smith',
                    shortName: 'Bob',
                    email: 'bob@example.com',
                    userType: 'ADMIN',
                }),
                createMockWorkspaceUser({
                    id: TEST_IDS.USER_3,
                    fullName: 'Charlie Person',
                    shortName: 'Charlie',
                    email: 'charlie@example.com',
                }),
            ]

            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue(mockUsers as never)

            const result = await getUsers.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            expect(mockCommsApi.workspaceUsers.getWorkspaceUsers).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })

            const textContent = extractTextContent(result)
            expect(textContent).toContain(`**Workspace ID:** ${TEST_IDS.WORKSPACE_1}`)
            expect(textContent).toContain('**Total Users:** 3')
            expect(textContent).toContain('## Alice Johnson')
            expect(textContent).toContain('## Bob Smith')
            expect(textContent).toContain('## Charlie Person')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent).toEqual({
                type: 'get_users',
                workspaceId: TEST_IDS.WORKSPACE_1,
                totalUsers: 3,
                filteredUsers: 3,
                users: expect.arrayContaining([
                    expect.objectContaining({
                        id: TEST_IDS.USER_1,
                        name: 'Alice Johnson',
                        email: 'alice@example.com',
                        userType: 'USER',
                    }),
                    expect.objectContaining({
                        id: TEST_IDS.USER_2,
                        name: 'Bob Smith',
                        userType: 'ADMIN',
                    }),
                    expect.objectContaining({
                        id: TEST_IDS.USER_3,
                        name: 'Charlie Person',
                    }),
                ]),
            })
        })

        it('should handle empty userIds array (fetch all)', async () => {
            const mockUsers = [createMockWorkspaceUser()]

            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue(mockUsers as never)

            const result = await getUsers.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [] },
                mockCommsApi,
            )

            expect(mockCommsApi.workspaceUsers.getWorkspaceUsers).toHaveBeenCalledWith({
                workspaceId: TEST_IDS.WORKSPACE_1,
            })

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.users).toHaveLength(1)
        })
    })

    describe('fetching specific users', () => {
        it('should fetch specific users by ID in parallel', async () => {
            mockCommsApi.workspaceUsers.getUserById.mockImplementation(
                async (args: { workspaceId: number; userId: number }) => {
                    if (args.userId === TEST_IDS.USER_1) {
                        return createMockWorkspaceUser() as never
                    }
                    if (args.userId === TEST_IDS.USER_2) {
                        return createMockWorkspaceUser({
                            id: TEST_IDS.USER_2,
                            fullName: 'Bob Smith',
                            shortName: 'Bob',
                            email: 'bob@example.com',
                        }) as never
                    }
                    throw new Error('User not found')
                },
            )

            const result = await getUsers.execute(
                {
                    workspaceId: TEST_IDS.WORKSPACE_1,
                    userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
                },
                mockCommsApi,
            )

            expect(mockCommsApi.workspaceUsers.getUserById).toHaveBeenCalledTimes(2)
            expect(mockCommsApi.workspaceUsers.getWorkspaceUsers).not.toHaveBeenCalled()

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Total Users:** 2')
            expect(textContent).toContain('## Alice Johnson')
            expect(textContent).toContain('## Bob Smith')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalUsers).toBe(2)
            expect(structuredContent.users).toHaveLength(2)
        })

        it('should handle single user ID', async () => {
            mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(
                createMockWorkspaceUser() as never,
            )

            const result = await getUsers.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, userIds: [TEST_IDS.USER_1] },
                mockCommsApi,
            )

            expect(mockCommsApi.workspaceUsers.getUserById).toHaveBeenCalledTimes(1)

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.users).toHaveLength(1)
            expect(structuredContent.users[0]?.id).toBe(TEST_IDS.USER_1)
        })
    })

    describe('search filtering', () => {
        it('should filter users by name (case-insensitive)', async () => {
            const mockUsers = [
                createMockWorkspaceUser({ fullName: 'Alice Johnson' }),
                createMockWorkspaceUser({
                    id: TEST_IDS.USER_2,
                    fullName: 'Bob Smith',
                    email: 'bob@example.com',
                }),
                createMockWorkspaceUser({
                    id: TEST_IDS.USER_3,
                    fullName: 'Alice Cooper',
                    email: 'alice2@example.com',
                }),
            ]

            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue(mockUsers as never)

            const result = await getUsers.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'alice' },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Total Users:** 3 (2 matching search)')
            expect(textContent).toContain('## Alice Johnson')
            expect(textContent).toContain('## Alice Cooper')
            expect(textContent).not.toContain('## Bob Smith')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalUsers).toBe(3)
            expect(structuredContent.filteredUsers).toBe(2)
            expect(structuredContent.users).toHaveLength(2)
        })

        it('should filter users by email (case-insensitive)', async () => {
            const mockUsers = [
                createMockWorkspaceUser({ fullName: 'Alice', email: 'alice@company.com' }),
                createMockWorkspaceUser({
                    id: TEST_IDS.USER_2,
                    fullName: 'Bob',
                    email: 'bob@different.com',
                }),
            ]

            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue(mockUsers as never)

            const result = await getUsers.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'COMPANY' },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Total Users:** 2 (1 matching search)')
            expect(textContent).toContain('## Alice')
            expect(textContent).not.toContain('## Bob')
        })

        it('should handle no search matches', async () => {
            const mockUsers = [createMockWorkspaceUser()]

            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue(mockUsers as never)

            const result = await getUsers.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1, searchText: 'nonexistent' },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Total Users:** 1 (0 matching search)')
            expect(textContent).toContain('No users found.')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.totalUsers).toBe(1)
            expect(structuredContent.filteredUsers).toBe(0)
            expect(structuredContent.users).toHaveLength(0)
        })
    })

    describe('user details', () => {
        it('should display user type and status correctly', async () => {
            const mockUsers = [
                createMockWorkspaceUser({ userType: 'ADMIN', removed: false }),
                createMockWorkspaceUser({
                    id: TEST_IDS.USER_2,
                    fullName: 'Guest User',
                    userType: 'GUEST',
                    removed: true,
                }),
            ]

            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue(mockUsers as never)

            const result = await getUsers.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**User Type:** ADMIN')
            expect(textContent).toContain('**Status:** Active')
            expect(textContent).toContain('**User Type:** GUEST')
            expect(textContent).toContain('**Status:** Removed')
        })

        it('should handle users without email', async () => {
            const mockUsers = [createMockWorkspaceUser({ email: undefined })]

            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue(mockUsers as never)

            const result = await getUsers.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).not.toContain('**Email:**')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.users[0]).not.toHaveProperty('email')
        })
    })

    describe('error handling', () => {
        it('should propagate API errors', async () => {
            const apiError = new Error(TEST_ERRORS.API_UNAUTHORIZED)
            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockRejectedValue(apiError)

            await expect(
                getUsers.execute({ workspaceId: TEST_IDS.WORKSPACE_1 }, mockCommsApi),
            ).rejects.toThrow(TEST_ERRORS.API_UNAUTHORIZED)
        })
    })

    describe('edge cases', () => {
        it('should handle empty user list', async () => {
            mockCommsApi.workspaceUsers.getWorkspaceUsers.mockResolvedValue([])

            const result = await getUsers.execute(
                { workspaceId: TEST_IDS.WORKSPACE_1 },
                mockCommsApi,
            )

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Total Users:** 0')
            expect(textContent).toContain('No users found.')

            const structuredContent = extractStructuredContent(result)
            expect(structuredContent.users).toHaveLength(0)
        })
    })
})
