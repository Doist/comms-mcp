import type {
    Channel,
    Comment,
    Conversation,
    ConversationMessage,
    Thread,
    User,
    Workspace,
} from '@doist/comms-sdk'
import type { getToolOutput } from '../mcp-helpers.js'

/**
 * Creates a mock Channel with all required properties and sensible defaults.
 * Pass only the properties you want to override for your specific test.
 */
export function createMockChannel(overrides: Partial<Channel> = {}): Channel {
    return {
        id: TEST_IDS.CHANNEL_1,
        name: 'General',
        creator: TEST_IDS.USER_1,
        public: true,
        workspaceId: TEST_IDS.WORKSPACE_1,
        archived: false,
        created: new Date('2024-01-01T00:00:00Z'),
        version: 1,
        url: `https://comms.todoist.com/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/`,
        ...overrides,
    }
}

/**
 * Creates a mock Thread with all required properties and sensible defaults.
 * Pass only the properties you want to override for your specific test.
 */
export function createMockThread(overrides: Partial<Thread> = {}): Thread {
    return {
        id: TEST_IDS.THREAD_1,
        title: 'Test Thread',
        content: 'Test thread content',
        channelId: TEST_IDS.CHANNEL_1,
        workspaceId: TEST_IDS.WORKSPACE_1,
        creator: TEST_IDS.USER_1,
        posted: new Date('2024-01-01T00:00:00Z'),
        lastUpdated: new Date('2024-01-01T00:00:00Z'),
        pinned: false,
        snippet: 'Test thread content',
        snippetCreator: TEST_IDS.USER_1,
        systemMessage: null,
        attachments: [],
        groups: [],
        reactions: {},
        recipients: [],
        commentCount: 0,
        isArchived: false,
        inInbox: true,
        participants: [TEST_IDS.USER_1],
        url: `https://comms.todoist.com/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/t/${TEST_IDS.THREAD_1}/`,
        ...overrides,
    }
}

/**
 * Creates a mock Comment with all required properties and sensible defaults.
 * Pass only the properties you want to override for your specific test.
 */
export function createMockComment(overrides: Partial<Comment> = {}): Comment {
    return {
        id: TEST_IDS.COMMENT_1,
        content: 'Test comment content',
        threadId: TEST_IDS.THREAD_1,
        workspaceId: TEST_IDS.WORKSPACE_1,
        channelId: TEST_IDS.CHANNEL_1,
        creator: TEST_IDS.USER_1,
        posted: new Date('2024-01-01T00:00:00Z'),
        systemMessage: null,
        attachments: [],
        reactions: {},
        objIndex: 1,
        url: `https://comms.todoist.com/${TEST_IDS.WORKSPACE_1}/ch/${TEST_IDS.CHANNEL_1}/t/${TEST_IDS.THREAD_1}/c/${TEST_IDS.COMMENT_1}`,
        ...overrides,
    }
}

/**
 * Creates a mock Conversation with all required properties and sensible defaults.
 * Pass only the properties you want to override for your specific test.
 */
export function createMockConversation(overrides: Partial<Conversation> = {}): Conversation {
    return {
        id: TEST_IDS.CONVERSATION_1,
        workspaceId: TEST_IDS.WORKSPACE_1,
        userIds: [TEST_IDS.USER_1, TEST_IDS.USER_2],
        messageCount: 0,
        lastObjIndex: 0,
        snippet: '',
        snippetCreators: [],
        archived: false,
        creator: TEST_IDS.USER_1,
        created: new Date('2024-01-01T00:00:00Z'),
        lastActive: new Date('2024-01-01T00:00:00Z'),
        url: `https://comms.todoist.com/${TEST_IDS.WORKSPACE_1}/msg/${TEST_IDS.CONVERSATION_1}/`,
        ...overrides,
    }
}

/**
 * Creates a mock ConversationMessage with all required properties and sensible defaults.
 * Pass only the properties you want to override for your specific test.
 */
export function createMockConversationMessage(
    overrides: Partial<ConversationMessage> = {},
): ConversationMessage {
    return {
        id: TEST_IDS.MESSAGE_1,
        content: 'Test message content',
        creator: TEST_IDS.USER_1,
        conversationId: TEST_IDS.CONVERSATION_1,
        workspaceId: TEST_IDS.WORKSPACE_1,
        posted: new Date('2024-01-01T00:00:00Z'),
        systemMessage: null,
        attachments: [],
        reactions: {},
        objIndex: 1,
        lastEdited: null,
        url: `https://comms.todoist.com/${TEST_IDS.WORKSPACE_1}/msg/${TEST_IDS.CONVERSATION_1}/m/${TEST_IDS.MESSAGE_1}`,
        ...overrides,
    }
}

/**
 * Creates a mock User with all required properties and sensible defaults.
 * Pass only the properties you want to override for your specific test.
 */
export function createMockUser(overrides: Partial<User> = {}): User {
    return {
        id: TEST_IDS.USER_1,
        email: 'test@example.com',
        fullName: 'Test User',
        shortName: 'Test',
        timezone: 'UTC',
        lang: 'en',
        removed: false,
        ...overrides,
    }
}

/**
 * Creates a mock Workspace with all required properties and sensible defaults.
 * Pass only the properties you want to override for your specific test.
 */
export function createMockWorkspace(overrides: Partial<Workspace> = {}): Workspace {
    return {
        id: TEST_IDS.WORKSPACE_1,
        name: 'Test Workspace',
        creator: TEST_IDS.USER_1,
        created: new Date('2024-01-01T00:00:00Z'),
        defaultConversation: TEST_IDS.CONVERSATION_1,
        plan: 'free',
        ...overrides,
    }
}

/**
 * Common error messages used across tests.
 */
export const TEST_ERRORS = {
    API_RATE_LIMIT: 'API Error: Rate limit exceeded',
    API_UNAUTHORIZED: 'API Error: Unauthorized',
    THREAD_NOT_FOUND: 'Thread not found',
    CONVERSATION_NOT_FOUND: 'Conversation not found',
} as const

/**
 * Extracts the text content from a tool output for snapshot testing.
 * This allows tests to match against just the text content while tools return structured output.
 */
export function extractTextContent(toolOutput: unknown): string {
    if (typeof toolOutput === 'string') {
        return toolOutput
    }

    if (typeof toolOutput === 'object' && toolOutput !== null && 'content' in toolOutput) {
        const output = toolOutput as { content: unknown }
        if (
            Array.isArray(output.content) &&
            output.content[0] &&
            typeof output.content[0] === 'object' &&
            output.content[0] !== null &&
            'type' in output.content[0] &&
            'text' in output.content[0] &&
            output.content[0].type === 'text'
        ) {
            return output.content[0].text as string
        }
    }

    throw new Error('Expected tool output to have text content')
}

/**
 * Extracts the structured content from a tool output for testing.
 * This handles both the new `structuredContent` field and legacy JSON-encoded content.
 */
export function extractStructuredContent(
    output: ReturnType<typeof getToolOutput>,
): Record<string, unknown> {
    // Check for new structuredContent field first
    if ('structuredContent' in output && typeof output.structuredContent === 'object') {
        return output.structuredContent as Record<string, unknown>
    }

    // Fall back to checking for JSON content in the content array
    if ('content' in output && Array.isArray(output.content)) {
        for (const item of output.content) {
            if (
                typeof item === 'object' &&
                item !== null &&
                'type' in item &&
                'text' in item &&
                item.type === 'text' &&
                'mimeType' in item &&
                item.mimeType === 'application/json'
            ) {
                return JSON.parse(item.text as string) as Record<string, unknown>
            }
        }
    }

    throw new Error('Expected tool output to have structured content')
}

/**
 * Common mock IDs used across tests for consistency.
 *
 * Channel/thread/comment/conversation/message/group IDs are opaque base58
 * UUIDv7 strings in the Comms API; workspace/user IDs are numeric.
 * The string IDs below are stable fixtures — not real base58 — and exist
 * purely so tests have predictable values to assert on.
 */
export const TEST_IDS = {
    THREAD_1: 'thread-id-1',
    THREAD_2: 'thread-id-2',
    THREAD_3: 'thread-id-3',
    COMMENT_1: 'comment-id-1',
    COMMENT_2: 'comment-id-2',
    CONVERSATION_1: 'conv-id-1',
    CONVERSATION_2: 'conv-id-2',
    MESSAGE_1: 'msg-id-1',
    MESSAGE_2: 'msg-id-2',
    CHANNEL_1: 'channel-id-1',
    GROUP_1: 'group-id-1',
    GROUP_2: 'group-id-2',
    WORKSPACE_1: 11111,
    WORKSPACE_2: 11112,
    USER_1: 22222,
    USER_2: 44444,
    USER_3: 55555,
} as const

/**
 * Fixed date for consistent test snapshots.
 * Use this instead of new Date() in tests to avoid snapshot drift.
 */
export const TODAY = '2025-01-01' as const
