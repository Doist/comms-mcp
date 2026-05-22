import {
    ChannelSchema,
    CommentSchema,
    ConversationMessageSchema,
    ConversationSchema,
    InboxThreadSchema,
    NOTIFY_AUDIENCES,
    SEARCH_RESULT_TYPES,
    SearchResultSchema,
    ThreadSchema,
    UnreadConversationSchema,
    UnreadThreadSchema,
    UserSchema,
    WorkspaceSchema,
    WorkspaceUserSchema,
} from '@doist/comms-sdk'
import { z } from 'zod'

// Re-export SDK schemas for direct use
export {
    ChannelSchema,
    CommentSchema,
    ConversationMessageSchema,
    ConversationSchema,
    InboxThreadSchema,
    SearchResultSchema,
    ThreadSchema,
    UnreadConversationSchema,
    UnreadThreadSchema,
    UserSchema,
    WorkspaceSchema,
    WorkspaceUserSchema,
}

// Custom schemas for tool-specific structured outputs.
//
// ID typing in the Comms API:
//   - channel/thread/comment/conversation/message/group IDs are opaque
//     base58-encoded UUIDv7 strings.
//   - workspaceId and userId are numeric.

/**
 * Schema for load-thread tool output
 */
export const LoadThreadOutputSchema = z.object({
    type: z.literal('thread_data'),
    thread: z.object({
        id: z.string(),
        title: z.string(),
        content: z.string(),
        channelId: z.string(),
        channelName: z.string().optional(),
        workspaceId: z.number(),
        creator: z.number(),
        creatorName: z.string().optional(),
        posted: z.string(),
        commentCount: z.number(),
        isArchived: z.boolean(),
        inInbox: z.boolean(),
        participants: z.array(z.number()).optional(),
        participantNames: z.array(z.string()).optional(),
        threadUrl: z.string(),
    }),
    comments: z.array(
        z.object({
            id: z.string(),
            content: z.string(),
            creator: z.number(),
            creatorName: z.string().optional(),
            threadId: z.string(),
            posted: z.string(),
            commentUrl: z.string(),
        }),
    ),
    totalComments: z.number(),
})

/**
 * Schema for load-conversation tool output
 */
export const LoadConversationOutputSchema = z.object({
    type: z.literal('conversation_data'),
    conversation: z.object({
        id: z.string(),
        workspaceId: z.number(),
        userIds: z.array(z.number()),
        archived: z.boolean(),
        lastActive: z.string(),
        title: z.string().optional(),
        conversationUrl: z.string(),
    }),
    messages: z.array(
        z.object({
            id: z.string(),
            content: z.string(),
            creatorId: z.number(),
            creatorName: z.string().optional(),
            conversationId: z.string(),
            posted: z.string(),
            messageUrl: z.string(),
        }),
    ),
    totalMessages: z.number(),
})

/**
 * Schema for fetch-inbox tool output
 */
export const FetchInboxOutputSchema = z.object({
    type: z.literal('inbox_data'),
    workspaceId: z.number(),
    threads: z.array(
        z.object({
            id: z.string(),
            title: z.string(),
            channelId: z.string(),
            channelName: z.string().optional(),
            creator: z.number(),
            isUnread: z.boolean(),
            isArchived: z.boolean(),
            isStarred: z.boolean(),
            threadUrl: z.string(),
        }),
    ),
    conversations: z.array(
        z.object({
            id: z.string(),
            title: z.string(),
            userIds: z.array(z.number()),
            participantNames: z.array(z.string()),
            isUnread: z.boolean(),
            conversationUrl: z.string(),
        }),
    ),
    unreadCount: z.number(),
    unreadThreads: z.array(z.any()),
    unreadConversations: z.array(z.any()),
    totalThreads: z.number(),
    totalConversations: z.number(),
})

/**
 * Schema for search-content tool output
 */
export const SearchContentOutputSchema = z.object({
    type: z.literal('search_results'),
    query: z.string(),
    workspaceId: z.number(),
    results: z.array(
        z.object({
            id: z.string(),
            type: z.enum(SEARCH_RESULT_TYPES),
            content: z.string(),
            creatorId: z.number(),
            creatorName: z.string().optional(),
            created: z.string(),
            threadId: z.string().optional(),
            conversationId: z.string().optional(),
            channelId: z.string().optional(),
            channelName: z.string().optional(),
            workspaceId: z.number(),
            url: z.string(),
        }),
    ),
    totalResults: z.number(),
    hasMore: z.boolean(),
    cursor: z.string().optional(),
})

/**
 * Schema for get-mentions tool output
 */
export const GetMentionsOutputSchema = z.object({
    type: z.literal('mentions_results'),
    workspaceId: z.number(),
    results: z.array(
        z.object({
            id: z.string(),
            type: z.enum(SEARCH_RESULT_TYPES),
            content: z.string(),
            creatorId: z.number(),
            creatorName: z.string().optional(),
            created: z.string(),
            threadId: z.string().optional(),
            conversationId: z.string().optional(),
            channelId: z.string().optional(),
            channelName: z.string().optional(),
            workspaceId: z.number(),
            url: z.string(),
        }),
    ),
    totalResults: z.number(),
    hasMore: z.boolean(),
    cursor: z.string().optional(),
})

/**
 * Schema for get-workspaces tool output
 */
export const GetWorkspacesOutputSchema = z.object({
    type: z.literal('get_workspaces'),
    workspaces: z.array(
        z.object({
            id: z.number(),
            name: z.string(),
            creator: z.number(),
            creatorName: z.string().optional(),
            created: z.string(),
            url: z.url(),
            defaultConversation: z.string().optional(),
            defaultConversationTitle: z.string().optional(),
            defaultConversationUrl: z.url().optional(),
            plan: z.string().optional(),
            avatarId: z.string().optional(),
            avatarUrls: z
                .object({
                    s35: z.string(),
                    s60: z.string(),
                    s195: z.string(),
                    s640: z.string(),
                })
                .optional(),
        }),
    ),
})

/**
 * Schema for get-users tool output
 */
export const GetUsersOutputSchema = z.object({
    type: z.literal('get_users'),
    workspaceId: z.number(),
    users: z.array(
        z.object({
            id: z.number(),
            name: z.string(),
            shortName: z.string(),
            email: z.string().optional(),
            userType: z.string(),
            removed: z.boolean(),
            timezone: z.string(),
        }),
    ),
    totalUsers: z.number(),
    filteredUsers: z.number(),
})

/**
 * Schema for get-groups tool output
 */
export const GetGroupsOutputSchema = z.object({
    type: z.literal('get_groups'),
    workspaceId: z.number(),
    groups: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            workspaceId: z.number(),
            memberCount: z.number(),
        }),
    ),
    totalGroups: z.number(),
    filteredGroups: z.number(),
})

/**
 * Schema for user-info tool output.
 *
 * Comms users no longer carry `bot` or `defaultWorkspace`; both are dropped
 * from the structured output. `name` mirrors `User.fullName`.
 */
export const UserInfoOutputSchema = z.object({
    type: z.literal('user_info'),
    userId: z.number(),
    name: z.string(),
    shortName: z.string(),
    email: z.string(),
    timezone: z.string(),
    lang: z.string(),
})

/**
 * Schema for build-link tool output
 */
export const BuildLinkOutputSchema = z.object({
    type: z.literal('link_data'),
    url: z.string(),
    linkType: z.enum(['conversation', 'message', 'thread', 'comment']),
    params: z.object({
        workspaceId: z.number(),
        conversationId: z.string().optional(),
        messageId: z.string().optional(),
        channelId: z.string().optional(),
        threadId: z.string().optional(),
        commentId: z.string().optional(),
    }),
})

/**
 * Schema for create-thread tool output
 */
export const CreateThreadOutputSchema = z.object({
    type: z.literal('create_thread_result'),
    success: z.boolean(),
    threadId: z.string(),
    title: z.string(),
    channelId: z.string(),
    workspaceId: z.number(),
    content: z.string(),
    creator: z.number(),
    created: z.string(),
    threadUrl: z.string(),
    recipients: z.array(z.number()).optional(),
    groups: z.array(z.string()).optional(),
})

/**
 * Schema for update-thread tool output
 */
export const UpdateThreadOutputSchema = z.object({
    type: z.literal('update_thread_result'),
    success: z.boolean(),
    threadId: z.string(),
    title: z.string(),
    channelId: z.string(),
    workspaceId: z.number(),
    content: z.string(),
    threadUrl: z.string(),
    lastEdited: z.string().nullable().optional(),
})

/**
 * Schema for update-comment tool output
 */
export const UpdateCommentOutputSchema = z.object({
    type: z.literal('update_comment_result'),
    success: z.boolean(),
    commentId: z.string(),
    threadId: z.string(),
    channelId: z.string(),
    workspaceId: z.number(),
    content: z.string(),
    commentUrl: z.string(),
    lastEdited: z.string().nullable().optional(),
})

/**
 * Schema for update-message tool output
 */
export const UpdateMessageOutputSchema = z.object({
    type: z.literal('update_message_result'),
    success: z.boolean(),
    messageId: z.string(),
    conversationId: z.string(),
    workspaceId: z.number(),
    content: z.string(),
    messageUrl: z.string(),
    lastEdited: z.string().nullable().optional(),
})

/**
 * Schema for update-object tool output.
 *
 * The MCP `outputSchema` field requires a flat `z.ZodRawShape`, so we expose a single
 * object schema whose `type` discriminator selects which optional fields are populated:
 *  - `update_thread_result`  → threadId, title, channelId, threadUrl
 *  - `update_comment_result` → commentId, threadId, channelId, commentUrl
 *  - `update_message_result` → messageId, conversationId, messageUrl
 * Consumers should narrow on `type`. The per-variant schemas above remain authoritative
 * for typed construction inside the tool.
 */
export const UpdateObjectOutputSchema = z.object({
    type: z.enum(['update_thread_result', 'update_comment_result', 'update_message_result']),
    success: z.boolean(),
    content: z.string(),
    workspaceId: z.number(),
    lastEdited: z.string().nullable().optional(),
    // thread fields
    threadId: z.string().optional(),
    title: z.string().optional(),
    channelId: z.string().optional(),
    threadUrl: z.string().optional(),
    // comment fields
    commentId: z.string().optional(),
    commentUrl: z.string().optional(),
    // message fields
    messageId: z.string().optional(),
    conversationId: z.string().optional(),
    messageUrl: z.string().optional(),
})

/**
 * Schema for delete-thread branch of delete-object output
 */
export const DeleteThreadOutputSchema = z.object({
    type: z.literal('delete_thread_result'),
    success: z.boolean(),
    targetType: z.literal('thread'),
    threadId: z.string(),
})

/**
 * Schema for delete-comment branch of delete-object output
 */
export const DeleteCommentOutputSchema = z.object({
    type: z.literal('delete_comment_result'),
    success: z.boolean(),
    targetType: z.literal('comment'),
    commentId: z.string(),
})

/**
 * Schema for delete-message branch of delete-object output
 */
export const DeleteMessageOutputSchema = z.object({
    type: z.literal('delete_message_result'),
    success: z.boolean(),
    targetType: z.literal('message'),
    messageId: z.string(),
})

/**
 * Schema for delete-object tool output.
 *
 * The Comms SDK delete endpoints return no body, so the structured payload simply
 * confirms which object was deleted. The `type` discriminator selects which
 * id field is populated:
 *  - `delete_thread_result`  → threadId
 *  - `delete_comment_result` → commentId
 *  - `delete_message_result` → messageId
 */
export const DeleteObjectOutputSchema = z.object({
    type: z.enum(['delete_thread_result', 'delete_comment_result', 'delete_message_result']),
    success: z.boolean(),
    targetType: z.enum(['thread', 'comment', 'message']),
    threadId: z.string().optional(),
    commentId: z.string().optional(),
    messageId: z.string().optional(),
})

/**
 * Schema for reply tool output
 */
export const ReplyOutputSchema = z.object({
    type: z.literal('reply_result'),
    success: z.boolean(),
    targetType: z.enum(['thread', 'conversation']),
    targetId: z.string(),
    replyId: z.string(),
    content: z.string(),
    created: z.string(),
    replyUrl: z.string(),
    recipients: z.array(z.number()).optional(),
    notifyAudience: z.enum(NOTIFY_AUDIENCES).optional(),
    groups: z.array(z.string()).optional(),
})

/**
 * Schema for react tool output
 */
export const ReactOutputSchema = z.object({
    type: z.literal('reaction_result'),
    success: z.boolean(),
    operation: z.enum(['add', 'remove']),
    targetType: z.enum(['thread', 'comment', 'message']),
    targetId: z.string(),
    emoji: z.string(),
    targetUrl: z.string(),
})

/**
 * Schema for mark-done tool output
 */
export const MarkDoneOutputSchema = z.object({
    type: z.literal('mark_done_result'),
    itemType: z.enum(['thread', 'conversation']),
    mode: z.enum(['individual', 'bulk']),
    completed: z.array(z.string()),
    failed: z.array(
        z.object({
            item: z.string(),
            error: z.string(),
        }),
    ),
    totalRequested: z.number(),
    successCount: z.number(),
    failureCount: z.number(),
    operations: z.object({
        markRead: z.boolean(),
        archive: z.boolean(),
        clearUnread: z.boolean(),
    }),
    selectors: z
        .object({
            workspaceId: z.number().optional(),
            channelId: z.string().optional(),
        })
        .optional(),
})

/**
 * Schema for list-channels tool output
 */
export const ListChannelsOutputSchema = z.object({
    type: z.literal('list_channels'),
    workspaceId: z.number(),
    channels: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().optional(),
            public: z.boolean(),
            archived: z.boolean(),
            creatorId: z.number(),
            creatorName: z.string().optional(),
            created: z.string(),
            channelUrl: z.string(),
            color: z.number().optional(),
        }),
    ),
    totalChannels: z.number(),
})

/**
 * Union of all possible structured outputs for type safety
 */
export const StructuredOutputSchema = z.union([
    LoadThreadOutputSchema,
    LoadConversationOutputSchema,
    FetchInboxOutputSchema,
    SearchContentOutputSchema,
    GetWorkspacesOutputSchema,
    GetUsersOutputSchema,
    GetGroupsOutputSchema,
    UserInfoOutputSchema,
    BuildLinkOutputSchema,
    CreateThreadOutputSchema,
    UpdateThreadOutputSchema,
    UpdateCommentOutputSchema,
    UpdateMessageOutputSchema,
    DeleteThreadOutputSchema,
    DeleteCommentOutputSchema,
    DeleteMessageOutputSchema,
    ReplyOutputSchema,
    ReactOutputSchema,
    MarkDoneOutputSchema,
    ListChannelsOutputSchema,
])

/**
 * Type definitions for the structured outputs
 */
export type CreateThreadOutput = z.infer<typeof CreateThreadOutputSchema>
export type UpdateThreadOutput = z.infer<typeof UpdateThreadOutputSchema>
export type UpdateCommentOutput = z.infer<typeof UpdateCommentOutputSchema>
export type UpdateMessageOutput = z.infer<typeof UpdateMessageOutputSchema>
export type UpdateObjectOutput = z.infer<typeof UpdateObjectOutputSchema>

/**
 * Strictly-typed union of the three per-branch update outputs. Use this in the tool
 * to construct structured payloads — `UpdateObjectOutput` is the looser MCP-facing shape.
 */
export type UpdateObjectStructured = UpdateThreadOutput | UpdateCommentOutput | UpdateMessageOutput
export type DeleteThreadOutput = z.infer<typeof DeleteThreadOutputSchema>
export type DeleteCommentOutput = z.infer<typeof DeleteCommentOutputSchema>
export type DeleteMessageOutput = z.infer<typeof DeleteMessageOutputSchema>
export type DeleteObjectOutput = z.infer<typeof DeleteObjectOutputSchema>

/**
 * Strictly-typed union of the three per-branch delete outputs. Use this in the tool
 * to construct structured payloads — `DeleteObjectOutput` is the looser MCP-facing shape.
 */
export type DeleteObjectStructured = DeleteThreadOutput | DeleteCommentOutput | DeleteMessageOutput
export type LoadThreadOutput = z.infer<typeof LoadThreadOutputSchema>
export type LoadConversationOutput = z.infer<typeof LoadConversationOutputSchema>
export type FetchInboxOutput = z.infer<typeof FetchInboxOutputSchema>
export type SearchContentOutput = z.infer<typeof SearchContentOutputSchema>
export type GetWorkspacesOutput = z.infer<typeof GetWorkspacesOutputSchema>
export type GetUsersOutput = z.infer<typeof GetUsersOutputSchema>
export type GetGroupsOutput = z.infer<typeof GetGroupsOutputSchema>
export type UserInfoOutput = z.infer<typeof UserInfoOutputSchema>
export type BuildLinkOutput = z.infer<typeof BuildLinkOutputSchema>
export type ReplyOutput = z.infer<typeof ReplyOutputSchema>
export type ReactOutput = z.infer<typeof ReactOutputSchema>
export type MarkDoneOutput = z.infer<typeof MarkDoneOutputSchema>
export type ListChannelsOutput = z.infer<typeof ListChannelsOutputSchema>
export type StructuredOutput = z.infer<typeof StructuredOutputSchema>
