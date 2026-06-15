import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import {
    createMockWorkspace,
    extractStructuredContent,
    extractTextContent,
    TEST_ERRORS,
    TEST_IDS,
} from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { getWorkspaces } from '../get-workspaces.js'

// Mock the Comms API
const mockCommsApi = {
    workspaces: {
        getWorkspaces: jest.fn(),
    },
    conversations: {
        getConversation: jest.fn(),
    },
    workspaceUsers: {
        getUserById: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { GET_WORKSPACES } = ToolNames

const mockCreator = {
    id: TEST_IDS.USER_1,
    fullName: 'Test User',
    shortName: 'TU',
    removed: false,
    timezone: 'UTC',
    userType: 'USER' as const,
    version: 1,
}

const mockConversation = {
    id: TEST_IDS.CONVERSATION_1,
    workspaceId: TEST_IDS.WORKSPACE_1,
    userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
    title: 'Team Discussion',
    lastObjIndex: 0,
    snippet: '',
    snippetCreators: [],
    archived: false,
    creator: TEST_IDS.USER_1,
    created: new Date(),
    lastActive: new Date(),
}

describe(`${GET_WORKSPACES} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('should generate workspaces list with all required fields', async () => {
        const mockWorkspace1 = createMockWorkspace()
        const mockWorkspace2 = createMockWorkspace({
            id: TEST_IDS.WORKSPACE_2,
            name: 'Second Workspace',
            plan: 'unlimited',
        })

        mockCommsApi.workspaces.getWorkspaces.mockResolvedValue([mockWorkspace1, mockWorkspace2])
        mockCommsApi.conversations.getConversation.mockResolvedValue(mockConversation as never)
        mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(mockCreator as never)

        const result = await getWorkspaces.execute({}, mockCommsApi)

        expect(mockCommsApi.workspaces.getWorkspaces).toHaveBeenCalledWith()

        const textContent = extractTextContent(result)
        expect(textContent).toContain('Found 2 workspaces:')
        expect(textContent).toContain('Test Workspace')
        expect(textContent).toContain('Second Workspace')
        expect(textContent).toContain(`**ID:** ${TEST_IDS.WORKSPACE_1}`)
        expect(textContent).toContain(`**ID:** ${TEST_IDS.WORKSPACE_2}`)
        expect(textContent).toContain(`**Creator:** Test User (${TEST_IDS.USER_1})`)
        expect(textContent).toContain(
            `**Default Conversation:** [Team Discussion](https://comms.todoist.com/${TEST_IDS.WORKSPACE_1}/msg/${TEST_IDS.CONVERSATION_1}/) (${TEST_IDS.CONVERSATION_1})`,
        )
        expect(textContent).toContain(`**Plan:** free`)
        expect(textContent).toContain(`**Plan:** unlimited`)

        const structuredContent = extractStructuredContent(result)
        expect(structuredContent).toEqual({
            type: 'get_workspaces',
            workspaces: [
                expect.objectContaining({
                    id: mockWorkspace1.id,
                    name: mockWorkspace1.name,
                    creator: mockWorkspace1.creator,
                    creatorName: 'Test User',
                    created: mockWorkspace1.created.toISOString(),
                    url: `https://comms.todoist.com/${mockWorkspace1.id}/`,
                    defaultConversation: mockWorkspace1.defaultConversation,
                    defaultConversationTitle: 'Team Discussion',
                    defaultConversationUrl: `https://comms.todoist.com/${mockWorkspace1.id}/msg/${mockWorkspace1.defaultConversation}/`,
                    plan: mockWorkspace1.plan,
                }),
                expect.objectContaining({
                    id: mockWorkspace2.id,
                    name: mockWorkspace2.name,
                    creator: mockWorkspace2.creator,
                    creatorName: 'Test User',
                    created: mockWorkspace2.created.toISOString(),
                    url: `https://comms.todoist.com/${mockWorkspace2.id}/`,
                    defaultConversation: mockWorkspace2.defaultConversation,
                    defaultConversationTitle: 'Team Discussion',
                    defaultConversationUrl: `https://comms.todoist.com/${mockWorkspace2.id}/msg/${mockWorkspace2.defaultConversation}/`,
                    plan: mockWorkspace2.plan,
                }),
            ],
        })
    })

    it('should handle a single workspace', async () => {
        const mockWorkspace = createMockWorkspace()

        mockCommsApi.workspaces.getWorkspaces.mockResolvedValue([mockWorkspace])
        mockCommsApi.conversations.getConversation.mockResolvedValue(mockConversation as never)
        mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(mockCreator as never)

        const result = await getWorkspaces.execute({}, mockCommsApi)

        const textContent = extractTextContent(result)
        expect(textContent).toContain('Found 1 workspace:')
        expect(textContent).toContain('Test Workspace')

        const structuredContent = extractStructuredContent(result)
        expect(structuredContent.workspaces).toHaveLength(1)
    })

    it('should handle no workspaces', async () => {
        mockCommsApi.workspaces.getWorkspaces.mockResolvedValue([])

        const result = await getWorkspaces.execute({}, mockCommsApi)

        const textContent = extractTextContent(result)
        expect(textContent).toContain('No workspaces found.')

        const structuredContent = extractStructuredContent(result)
        expect(structuredContent.workspaces).toHaveLength(0)
    })

    it('should handle workspaces without optional fields', async () => {
        const mockWorkspace = createMockWorkspace({
            defaultConversation: undefined,
            plan: undefined,
        })

        mockCommsApi.workspaces.getWorkspaces.mockResolvedValue([mockWorkspace])
        mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(mockCreator as never)

        const result = await getWorkspaces.execute({}, mockCommsApi)

        const textContent = extractTextContent(result)
        expect(textContent).not.toContain('Default Conversation')
        expect(textContent).not.toContain('Plan:')
    })

    it('should handle conversations without titles', async () => {
        const mockWorkspace = createMockWorkspace()

        mockCommsApi.workspaces.getWorkspaces.mockResolvedValue([mockWorkspace])
        mockCommsApi.conversations.getConversation.mockResolvedValue({
            ...mockConversation,
            title: null,
        } as never)
        mockCommsApi.workspaceUsers.getUserById.mockResolvedValue(mockCreator as never)

        const result = await getWorkspaces.execute({}, mockCommsApi)

        const textContent = extractTextContent(result)
        expect(textContent).toContain(
            `**Default Conversation:** [Conversation with users: ${TEST_IDS.USER_1}, ${TEST_IDS.USER_2}](https://comms.todoist.com/${TEST_IDS.WORKSPACE_1}/msg/${TEST_IDS.CONVERSATION_1}/) (${TEST_IDS.CONVERSATION_1})`,
        )
    })

    it('should propagate API errors', async () => {
        const apiError = new Error(TEST_ERRORS.API_UNAUTHORIZED)
        mockCommsApi.workspaces.getWorkspaces.mockRejectedValue(apiError)

        await expect(getWorkspaces.execute({}, mockCommsApi)).rejects.toThrow(
            TEST_ERRORS.API_UNAUTHORIZED,
        )
    })
})
