import { describeToolAnnotations } from '@todoist/mcp-core/testing'
import { getMcpServer } from '../mcp-server.js'
import { ToolNames } from '../utils/tool-names.js'

// Clients decide from these hints whether a call needs the user's confirmation, so each tool's are
// pinned here as a client receives them on tools/list.
describeToolAnnotations({
    createServer: () => getMcpServer({ token: 'test-token' }),
    expected: {
        [ToolNames.USER_INFO]: {
            title: 'Comms: User Info',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.UPDATE_USER_INFO]: {
            title: 'Comms: Update User Info',
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
        },
        [ToolNames.FETCH_INBOX]: {
            title: 'Comms: Fetch Inbox',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.LOAD_THREAD]: {
            title: 'Comms: Load Thread',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.LOAD_CONVERSATION]: {
            title: 'Comms: Load Conversation',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.SEARCH_CONTENT]: {
            title: 'Comms: Search Content',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.GET_MENTIONS]: {
            title: 'Comms: Get Mentions',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.GET_USERS]: {
            title: 'Comms: Get Users',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.GET_GROUPS]: {
            title: 'Comms: Get Groups',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.GET_WORKSPACES]: {
            title: 'Comms: Get Workspaces',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.BUILD_LINK]: {
            title: 'Comms: Build Link',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.CREATE_CHANNEL]: {
            title: 'Comms: Create Channel',
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
        },
        [ToolNames.UPDATE_CHANNEL]: {
            title: 'Comms: Update Channel',
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.CREATE_THREAD]: {
            title: 'Comms: Create Thread',
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
        },
        [ToolNames.CREATE_CONVERSATION]: {
            title: 'Comms: Create Conversation',
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
        },
        [ToolNames.UPDATE_OBJECT]: {
            title: 'Comms: Update Object',
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.DELETE_OBJECT]: {
            title: 'Comms: Delete Object',
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
        },
        [ToolNames.REPLY]: {
            title: 'Comms: Reply',
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
        },
        [ToolNames.REACT]: {
            title: 'Comms: React',
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
        },
        [ToolNames.MARK_DONE]: {
            title: 'Comms: Mark Done',
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: true,
        },
        [ToolNames.MARK_READ]: {
            title: 'Comms: Mark Read',
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.LIST_CHANNELS]: {
            title: 'Comms: List Channels',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        [ToolNames.LIST_CONVERSATIONS]: {
            title: 'Comms: List Conversations',
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
        },
    },
})
