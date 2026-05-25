import { jest } from '@jest/globals'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getMcpServer } from '../../mcp-server.js'
import { ToolNames } from '../../utils/tool-names.js'

describe('getMcpServer tool context', () => {
    it('forwards baseUrl to registered tool callbacks', async () => {
        const registerToolSpy = jest.spyOn(McpServer.prototype, 'registerTool')

        getMcpServer({
            commsApiKey: 'test-token',
            baseUrl: 'https://comms.staging.todoist.com//',
        })

        const buildLinkCall = registerToolSpy.mock.calls.find(
            ([name]) => name === ToolNames.BUILD_LINK,
        )
        registerToolSpy.mockRestore()

        expect(buildLinkCall).toBeDefined()
        const callback = buildLinkCall?.[2] as (
            args: Record<string, unknown>,
            context: unknown,
        ) => Promise<{ structuredContent?: { url?: string } }>

        const result = await callback(
            { workspaceId: 123, conversationId: '456', fullUrl: true },
            {},
        )

        expect(result.structuredContent?.url).toBe(
            'https://comms.staging.todoist.com/a/123/msg/456/',
        )
    })
})
