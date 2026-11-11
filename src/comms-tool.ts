import type { CommsApi } from '@todoist/comms-sdk'
import type { AnyMcpTool, McpTool } from '@todoist/mcp-core'
import type { z } from 'zod'

/**
 * A Comms tool that can be used in an MCP server or other conversational AI interfaces: an
 * `McpTool` from `@todoist/mcp-core` whose `execute` receives the Comms API client.
 *
 * `execute` returns `{ textContent, structuredContent }`; registration shapes that into the MCP
 * result, so a tool never builds one itself.
 */
type CommsTool<
    Params extends z.ZodRawShape,
    Output extends z.ZodRawShape = Record<string, never>,
> = McpTool<Params, Output, CommsApi>

/** A Comms tool of any parameter and output shape, for collections that hold tools of mixed shapes. */
type AnyCommsTool = AnyMcpTool<CommsApi>

export type { AnyCommsTool, CommsTool }
