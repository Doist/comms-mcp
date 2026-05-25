import { CommsApi } from '@doist/comms-sdk'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTool } from './mcp-helpers.js'
import { buildLink } from './tools/build-link.js'
import { createThread } from './tools/create-thread.js'
import { deleteObject } from './tools/delete-object.js'
import { fetchInbox } from './tools/fetch-inbox.js'
import { getGroups } from './tools/get-groups.js'
import { getMentions } from './tools/get-mentions.js'
import { getUsers } from './tools/get-users.js'
import { getWorkspaces } from './tools/get-workspaces.js'
import { listChannels } from './tools/list-channels.js'
import { loadConversation } from './tools/load-conversation.js'
import { loadThread } from './tools/load-thread.js'
import { markDone } from './tools/mark-done.js'
import { react } from './tools/react.js'
import { reply } from './tools/reply.js'
import { searchContent } from './tools/search-content.js'
import { updateObject } from './tools/update-object.js'
import { userInfo } from './tools/user-info.js'
import type { ServerOptions } from './utils/server-options.js'
import { normalizeBaseUrl } from './utils/url-helpers.js'

const instructions = `
## Comms Communication Tools

You have access to comprehensive Comms management tools for team communication and collaboration. Use these tools to help users manage threads, messages, channels, and team interactions effectively.

### Core Capabilities:
- Create and manage conversations and threads
- Send and update messages
- Organize channels and workspaces
- Handle team communication workflows

### Tool Usage Guidelines:

- **fetch-inbox**: Use to fetch inbox threads for a workspace, along with unread conversations and counts. Supports archiveFilter values of active, archived, or all; use all when the user needs both open and done threads. Optionally set onlyUnread to focus on unread items.
- **list-channels**: Use to discover channels in a workspace. Requires a workspace ID. Optionally set includeArchived to true to also list archived channels. Returns channel names, IDs, descriptions, visibility, archive status, and URLs.
- **get-groups**: Use to discover group IDs in a workspace before notifying groups from tools that support group notifications. Requires a workspace ID. Optionally filter by group IDs or search text. Returns group IDs, names, and member counts without member lists or descriptions.
- **create-thread**: Use to create a new channel thread. Optionally pass recipients for user IDs and groups for group IDs; call get-users or get-groups first when resolving names.
- **reply**: Use to reply to a thread or conversation. Thread replies notify everyone who has interacted with the thread by default. Optionally pass recipients for user IDs or groups for group IDs to override that default, and/or notifyAudience ("channel" | "thread") to add a broader audience on top of recipients/groups. Passing groups or notifyAudience to a conversation reply is rejected.
- **get-mentions**: Use to fetch threads, comments, and messages that mention the current user. Prefer this over search-content when no keyword query is needed (search-content requires a non-empty query). Supports filtering by channel, author, and date range, and exposes a cursor for pagination.
- **update-object**: Use to edit something you previously sent. Pass targetType ("thread", "comment", or "message"), targetId, and the new content. For threads you may also pass title (and may pass title without content). title is only valid for threads.
- **delete-object**: Use to permanently delete a thread, comment, or conversation message. Pass targetType ("thread", "comment", or "message") and targetId. Deletion is irreversible — confirm with the user before invoking. Deleting a thread also removes all of its comments. Only the object's creator or a workspace admin can delete; the Comms API will reject the call otherwise.

### Best Practices:

1. **Communication**: Write clear, professional messages. Consider context and audience.

2. **Organization**: Use appropriate channels and threads for different topics.

3. **Collaboration**: Respect team communication patterns and workflows.

Always provide clear context and maintain professional communication standards.
`

/**
 * Create the MCP server.
 * @param commsApiKey - The API key for the Comms account.
 * @param baseUrl - Optional base URL for the Comms API.
 * @returns the MCP server.
 */
function getMcpServer({ commsApiKey, baseUrl }: ServerOptions) {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
    const server = new McpServer(
        { name: 'comms-mcp-server', version: '0.1.0' },
        {
            capabilities: {
                tools: { listChanged: true },
            },
            instructions,
        },
    )

    const comms = new CommsApi(commsApiKey, { baseUrl: normalizedBaseUrl })
    const toolContext = normalizedBaseUrl ? { baseUrl: normalizedBaseUrl } : undefined

    // Register tools
    registerTool(userInfo, server, comms, toolContext)
    registerTool(getWorkspaces, server, comms, toolContext)
    registerTool(getUsers, server, comms, toolContext)
    registerTool(getGroups, server, comms, toolContext)
    registerTool(fetchInbox, server, comms, toolContext)
    registerTool(loadThread, server, comms, toolContext)
    registerTool(loadConversation, server, comms, toolContext)
    registerTool(searchContent, server, comms, toolContext)
    registerTool(getMentions, server, comms, toolContext)
    registerTool(buildLink, server, comms, toolContext)
    registerTool(createThread, server, comms, toolContext)
    registerTool(updateObject, server, comms, toolContext)
    registerTool(deleteObject, server, comms, toolContext)
    registerTool(reply, server, comms, toolContext)
    registerTool(react, server, comms, toolContext)
    registerTool(markDone, server, comms, toolContext)
    registerTool(listChannels, server, comms, toolContext)

    return server
}

export { getMcpServer }
