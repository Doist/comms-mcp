import { AsyncLocalStorage } from 'node:async_hooks'
import { createRequire } from 'node:module'
import { CommsApi } from '@todoist/comms-sdk'
import type { McpServerOptions } from '@todoist/mcp-core/host'

// Read at runtime: `tsc` compiles only `src/`, so the manifest can't be imported. From `src/`
// in tests and from `dist/` once installed, it is one directory up either way.
const { version: COMMS_MCP_VERSION } = createRequire(import.meta.url)('../package.json') as {
    version: string
}

/** What `mcp-tool` says for a request made outside any tool call. */
const UNKNOWN_TOOL = 'unknown'

/** The tool whose call is running, for every request made while it runs. */
const currentTool = new AsyncLocalStorage<string>()

/**
 * Runs `run` as a call of the tool named `tool`: every Comms API request it makes, however
 * deep and however late, is tagged with that name. Concurrent calls each keep their own.
 */
function runAsTool<T>(tool: string, run: () => T): T {
    return currentTool.run(tool, run)
}

/**
 * The headers the Comms API reads to attribute a request to this server and to the tool that
 * made it. `tool` defaults to the tool whose call is running, or `unknown` outside one.
 */
function buildUsageTrackingHeaders(
    tool: string = currentTool.getStore() ?? UNKNOWN_TOOL,
): Record<string, string> {
    return {
        'User-Agent': `comms-mcp/${COMMS_MCP_VERSION}`,
        'Doist-Platform': 'mcp',
        'Doist-Version': COMMS_MCP_VERSION,
        'mcp-tool': tool,
    }
}

/**
 * A Comms API client that tags every request with the usage-tracking headers.
 *
 * The SDK calls `headers` once per request (its retries reuse the result), from inside the
 * request's own async context, so the tool name is whichever call made the request. This keeps
 * the SDK's own transport, with its proxy support and timeouts, rather than replacing it with a
 * `customFetch`.
 */
function createCommsClient({ token, baseUrl }: McpServerOptions): CommsApi {
    return new CommsApi(token, { baseUrl, headers: () => buildUsageTrackingHeaders() })
}

export { COMMS_MCP_VERSION, buildUsageTrackingHeaders, createCommsClient, runAsTool }
