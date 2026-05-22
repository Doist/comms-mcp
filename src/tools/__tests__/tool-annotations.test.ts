import { jest } from '@jest/globals'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getMcpServer } from '../../mcp-server.js'
import { ToolNames } from '../../utils/tool-names.js'

type ToolExpectation = {
    name: string
    title: string
    readOnlyHint: boolean
    destructiveHint: boolean
    idempotentHint: boolean
}

const TOOL_EXPECTATIONS: ToolExpectation[] = [
    {
        name: ToolNames.USER_INFO,
        title: 'Comms: User Info',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
    {
        name: ToolNames.FETCH_INBOX,
        title: 'Comms: Fetch Inbox',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
    {
        name: ToolNames.LOAD_THREAD,
        title: 'Comms: Load Thread',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
    {
        name: ToolNames.LOAD_CONVERSATION,
        title: 'Comms: Load Conversation',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
    {
        name: ToolNames.SEARCH_CONTENT,
        title: 'Comms: Search Content',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
    {
        name: ToolNames.GET_MENTIONS,
        title: 'Comms: Get Mentions',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
    {
        name: ToolNames.GET_USERS,
        title: 'Comms: Get Users',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
    {
        name: ToolNames.GET_GROUPS,
        title: 'Comms: Get Groups',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
    {
        name: ToolNames.GET_WORKSPACES,
        title: 'Comms: Get Workspaces',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
    {
        name: ToolNames.BUILD_LINK,
        title: 'Comms: Build Link',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
    {
        name: ToolNames.CREATE_THREAD,
        title: 'Comms: Create Thread',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
    },
    {
        name: ToolNames.UPDATE_OBJECT,
        title: 'Comms: Update Object',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
    },
    {
        name: ToolNames.DELETE_OBJECT,
        title: 'Comms: Delete Object',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
    },
    {
        name: ToolNames.REPLY,
        title: 'Comms: Reply',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
    },
    {
        name: ToolNames.REACT,
        title: 'Comms: React',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
    },
    {
        name: ToolNames.MARK_DONE,
        title: 'Comms: Mark Done',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
    },
    {
        name: ToolNames.LIST_CHANNELS,
        title: 'Comms: List Channels',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
    },
]

describe('Tool annotations', () => {
    const registered: Map<string, { annotations?: unknown }> = new Map()

    beforeAll(() => {
        const registerToolSpy = jest.spyOn(McpServer.prototype, 'registerTool')
        getMcpServer({ commsApiKey: 'test-token' })

        const calls = registerToolSpy.mock.calls as unknown as unknown[][]
        for (const [name, toolSpec] of calls) {
            if (typeof name !== 'string') continue
            if (!toolSpec || typeof toolSpec !== 'object') continue

            registered.set(name, toolSpec as { annotations?: unknown })
        }

        registerToolSpy.mockRestore()
    })

    it('should cover all tools', () => {
        expect(Array.from(registered.keys()).sort()).toEqual(
            TOOL_EXPECTATIONS.map((t) => t.name).sort(),
        )
    })

    describe.each(TOOL_EXPECTATIONS)('$name', (toolExpectation) => {
        it('should define required MCP ToolAnnotations hints', () => {
            const toolSpec = registered.get(toolExpectation.name)
            expect(toolSpec).toBeDefined()

            const annotations = toolSpec?.annotations as Record<string, unknown> | undefined
            expect(annotations).toBeDefined()

            expect(annotations).toMatchObject({
                title: toolExpectation.title,
                openWorldHint: false,
            })
        })

        it('should have expected hint values per tool', () => {
            const toolSpec = registered.get(toolExpectation.name)
            expect(toolSpec).toBeDefined()

            const annotations = toolSpec?.annotations as Record<string, unknown> | undefined
            expect(annotations).toBeDefined()

            expect(annotations).toMatchObject({
                readOnlyHint: toolExpectation.readOnlyHint,
                destructiveHint: toolExpectation.destructiveHint,
                idempotentHint: toolExpectation.idempotentHint,
            })
        })
    })
})
