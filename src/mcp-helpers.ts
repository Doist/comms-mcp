import type { CommsApi } from '@doist/comms-sdk'
import { createToolRegistrar } from '@doist/mcp-core'
import type { McpServer } from '@modelcontextprotocol/server'
import type { AnyCommsTool } from './comms-tool.js'

/**
 * Whether to return the structured content directly, vs. in the `content` part of the output.
 *
 * The `structuredContent` part of the output is relatively new in the spec, and it's not yet
 * supported by all clients. This flag controls whether we return the structured content using this
 * new feature of the MCP protocol or not.
 *
 * If `false`, the `structuredContent` is also returned as stringified JSON in one of the `content`
 * parts, ahead of the summary.
 *
 * Eventually we should be able to remove this, and change the code to always work with the
 * structured content returned directly, once most or all MCP clients support it.
 */
const USE_STRUCTURED_CONTENT =
    process.env.USE_STRUCTURED_CONTENT === 'true' || process.env.NODE_ENV === 'test'

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : 'An unknown error occurred'
}

/**
 * Registers Comms tools on an MCP server, bound to one Comms API client.
 *
 * Schema caching, annotations, result shaping and turning a thrown error into an error result
 * come from `@doist/mcp-core`; its default error log names the tool and never its arguments.
 */
function registerTools({
    tools,
    server,
    client,
}: {
    tools: readonly AnyCommsTool[]
    server: McpServer
    client: CommsApi
}): void {
    const register = createToolRegistrar<CommsApi>({
        titlePrefix: 'Comms',
        createContext: () => client,
        formatError,
        structuredContentAsText: !USE_STRUCTURED_CONTENT,
    })

    for (const tool of tools) {
        register(server, tool)
    }
}

export { registerTools }
