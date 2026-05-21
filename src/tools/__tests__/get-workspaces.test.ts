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
    channels: {
        getChannel: jest.fn(),
    },
    conversations: {
        getConversation: jest.fn(),
    },
    workspaceUsers: {
        getUserById: jest.fn(),
    },
    batch: jest.fn(),
} as unknown as jest.Mocked<CommsApi>

const { GET_WORKSPACES } = ToolNames

describe(`${GET_WORKSPACES} tool`, () => {
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

    it('should generate workspaces list with all required fields', async () => {
        const mockWorkspace1 = createMockWorkspace()
        const mockWorkspace2 = createMockWorkspace({
            id: TEST_IDS.WORKSPACE_2,
            name: 'Second Workspace',
            plan: 'unlimited',
        })

        mockCommsApi.workspaces.getWorkspaces.mockResolvedValue([mockWorkspace1, mockWorkspace2])
        mockCommsApi.channels.getChannel.mockResolvedValue({
            id: TEST_IDS.CHANNEL_1,
            name: 'General',
            workspaceId: TEST_IDS.WORKSPACE_1,
            creator: TEST_IDS.USER_1,
            public: true,
            archived: false,
            created: new Date(),
            version: 1,
        })
        mockCommsApi.conversations.getConversation.mockResolvedValue({
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
        })
        mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
            id: TEST_IDS.USER_1,
            name: 'Test User',
            shortName: 'TU',
            bot: false,
            removed: false,
            timezone: 'UTC',
            userType: 'USER' as const,
            version: 1,
        })

        const result = await getWorkspaces.execute({}, mockCommsApi)

        expect(mockCommsApi.workspaces.getWorkspaces).toHaveBeenCalledWith()
        expect(mockCommsApi.batch).toHaveBeenCalled()

        // Test text content contains expected information
        const textContent = extractTextContent(result)
        expect(textContent).toContain('Found 2 workspaces:')
        expect(textContent).toContain('Test Workspace')
        expect(textContent).toContain('Second Workspace')
        expect(textContent).toContain(`**ID:** ${TEST_IDS.WORKSPACE_1}`)
        expect(textContent).toContain(`**ID:** ${TEST_IDS.WORKSPACE_2}`)
        expect(textContent).toContain(`**Creator:** Test User (${TEST_IDS.USER_1})`)
        expect(textContent).toContain(
            `**Default Channel:** [General](https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/) (${TEST_IDS.CHANNEL_1})`,
        )
        expect(textContent).toContain(
            `**Default Conversation:** [Team Discussion](https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/msg/${TEST_IDS.CONVERSATION_1}/) (${TEST_IDS.CONVERSATION_1})`,
        )
        expect(textContent).toContain(`**Plan:** free`)
        expect(textContent).toContain(`**Plan:** unlimited`)

        // Test structured content
        const structuredContent = extractStructuredContent(result)
        expect(structuredContent).toEqual({
            type: 'get_workspaces',
            workspaces: [
                {
                    id: mockWorkspace1.id,
                    name: mockWorkspace1.name,
                    creator: mockWorkspace1.creator,
                    creatorName: 'Test User',
                    created: mockWorkspace1.created.toISOString(),
                    url: `https://comms.todoist.com/a/${mockWorkspace1.id}/`,
                    defaultChannel: mockWorkspace1.defaultChannel,
                    defaultChannelName: 'General',
                    defaultChannelUrl: `https://comms.todoist.com/a/${mockWorkspace1.id}/ch/${mockWorkspace1.defaultChannel}/`,
                    defaultConversation: mockWorkspace1.defaultConversation,
                    defaultConversationTitle: 'Team Discussion',
                    defaultConversationUrl: `https://comms.todoist.com/a/${mockWorkspace1.id}/msg/${mockWorkspace1.defaultConversation}/`,
                    plan: mockWorkspace1.plan,
                },
                {
                    id: mockWorkspace2.id,
                    name: mockWorkspace2.name,
                    creator: mockWorkspace2.creator,
                    creatorName: 'Test User',
                    created: mockWorkspace2.created.toISOString(),
                    url: `https://comms.todoist.com/a/${mockWorkspace2.id}/`,
                    defaultChannel: mockWorkspace2.defaultChannel,
                    defaultChannelName: 'General',
                    defaultChannelUrl: `https://comms.todoist.com/a/${mockWorkspace2.id}/ch/${mockWorkspace2.defaultChannel}/`,
                    defaultConversation: mockWorkspace2.defaultConversation,
                    defaultConversationTitle: 'Team Discussion',
                    defaultConversationUrl: `https://comms.todoist.com/a/${mockWorkspace2.id}/msg/${mockWorkspace2.defaultConversation}/`,
                    plan: mockWorkspace2.plan,
                },
            ],
        })
    })

    it('should handle a single workspace', async () => {
        const mockWorkspace = createMockWorkspace()

        mockCommsApi.workspaces.getWorkspaces.mockResolvedValue([mockWorkspace])
        mockCommsApi.channels.getChannel.mockResolvedValue({
            id: TEST_IDS.CHANNEL_1,
            name: 'General',
            workspaceId: TEST_IDS.WORKSPACE_1,
            creator: TEST_IDS.USER_1,
            public: true,
            archived: false,
            created: new Date(),
            version: 1,
        })
        mockCommsApi.conversations.getConversation.mockResolvedValue({
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
        })
        mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
            id: TEST_IDS.USER_1,
            name: 'Test User',
            shortName: 'TU',
            bot: false,
            removed: false,
            timezone: 'UTC',
            userType: 'USER' as const,
            version: 1,
        })

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
            defaultChannel: undefined,
            defaultConversation: undefined,
            plan: undefined,
        })

        mockCommsApi.workspaces.getWorkspaces.mockResolvedValue([mockWorkspace])
        mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
            id: TEST_IDS.USER_1,
            name: 'Test User',
            shortName: 'TU',
            bot: false,
            removed: false,
            timezone: 'UTC',
            userType: 'USER' as const,
            version: 1,
        })

        const result = await getWorkspaces.execute({}, mockCommsApi)

        const textContent = extractTextContent(result)
        expect(textContent).not.toContain('Default Channel')
        expect(textContent).not.toContain('Default Conversation')
        expect(textContent).not.toContain('Plan:')
    })

    it('should handle workspaces with only default channel', async () => {
        const mockWorkspace = createMockWorkspace({
            defaultConversation: undefined,
        })

        mockCommsApi.workspaces.getWorkspaces.mockResolvedValue([mockWorkspace])
        mockCommsApi.channels.getChannel.mockResolvedValue({
            id: TEST_IDS.CHANNEL_1,
            name: 'General',
            workspaceId: TEST_IDS.WORKSPACE_1,
            creator: TEST_IDS.USER_1,
            public: true,
            archived: false,
            created: new Date(),
            version: 1,
        })
        mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
            id: TEST_IDS.USER_1,
            name: 'Test User',
            shortName: 'TU',
            bot: false,
            removed: false,
            timezone: 'UTC',
            userType: 'USER' as const,
            version: 1,
        })

        const result = await getWorkspaces.execute({}, mockCommsApi)

        const textContent = extractTextContent(result)
        expect(textContent).toContain(
            `**Default Channel:** [General](https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/) (${TEST_IDS.CHANNEL_1})`,
        )
        expect(textContent).not.toContain('Default Conversation')
    })

    it('should handle conversations without titles', async () => {
        const mockWorkspace = createMockWorkspace()

        mockCommsApi.workspaces.getWorkspaces.mockResolvedValue([mockWorkspace])
        mockCommsApi.channels.getChannel.mockResolvedValue({
            id: TEST_IDS.CHANNEL_1,
            name: 'General',
            workspaceId: TEST_IDS.WORKSPACE_1,
            creator: TEST_IDS.USER_1,
            public: true,
            archived: false,
            created: new Date(),
            version: 1,
        })
        mockCommsApi.conversations.getConversation.mockResolvedValue({
            id: TEST_IDS.CONVERSATION_1,
            workspaceId: TEST_IDS.WORKSPACE_1,
            userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
            title: null,
            lastObjIndex: 0,
            snippet: '',
            snippetCreators: [],
            archived: false,
            creator: TEST_IDS.USER_1,
            created: new Date(),
            lastActive: new Date(),
        })
        mockCommsApi.workspaceUsers.getUserById.mockResolvedValue({
            id: TEST_IDS.USER_1,
            name: 'Test User',
            shortName: 'TU',
            bot: false,
            removed: false,
            timezone: 'UTC',
            userType: 'USER' as const,
            version: 1,
        })

        const result = await getWorkspaces.execute({}, mockCommsApi)

        const textContent = extractTextContent(result)
        expect(textContent).toContain(
            `**Default Conversation:** [Conversation with users: ${TEST_IDS.USER_1}, ${TEST_IDS.USER_2}](https://comms.todoist.com/a/${TEST_IDS.WORKSPACE_1}/msg/${TEST_IDS.CONVERSATION_1}/) (${TEST_IDS.CONVERSATION_1})`,
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
