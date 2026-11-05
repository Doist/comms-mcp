import { type CommsApi, type Conversation, isNotFound } from '@doist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { limitedAll } from '../utils/concurrency.js'
import { resolveUsersWithLog } from '../utils/degrade.js'
import { ListConversationsOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { getConversationUrl } from '../utils/url-helpers.js'

const ArgsSchema = {
    workspaceId: z.number().describe('The workspace ID to list conversations from.'),
    includeArchived: z
        .boolean()
        .optional()
        .describe(
            'Whether to include archived conversations. If true, both active and archived conversations are returned. Defaults to false (active conversations only).',
        ),
    searchText: z
        .string()
        .optional()
        .describe(
            'Optional search text to find group chats by title. Matches whole words in the titles of titled group chats only: direct messages, untitled group chats, and participant names do not match.',
        ),
    limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
            'Maximum number of search results per page. Only used with searchText. Defaults to 20.',
        ),
    cursor: z
        .string()
        .optional()
        .describe('Cursor for the next page of search results. Only used with searchText.'),
}

type ConversationData = {
    id: string
    workspaceId: number
    title?: string
    userIds: number[]
    participantNames?: string[]
    archived: boolean
    lastActive: string
    snippet?: string
    conversationUrl: string
}

type ListConversationsStructured = Record<string, unknown> & {
    type: 'list_conversations'
    workspaceId: number
    conversations: ConversationData[]
    totalConversations: number
    hasMore?: boolean
    cursor?: string
}

type SearchPage = {
    conversations: Conversation[]
    hasMore: boolean
    cursor?: string
}

// Only resolve names for the first few participants of each conversation. A large
// group DM would otherwise produce an unbounded participant string; callers that
// need every participant should load the conversation directly. The full set of
// participant IDs is still returned in `userIds`.
const MAX_DISPLAYED_PARTICIPANTS = 5

const DEFAULT_SEARCH_LIMIT = 20

// Resolve user IDs to names. IDs that can't be resolved are simply absent from
// the returned map.
async function resolveParticipantNames(
    client: CommsApi,
    workspaceId: number,
    userIds: number[],
): Promise<Record<number, string>> {
    const users = await resolveUsersWithLog(
        client,
        ToolNames.LIST_CONVERSATIONS,
        'failed to resolve conversation participant',
        workspaceId,
        userIds,
    )
    const lookup: Record<number, string> = {}
    for (const [id, user] of users) {
        lookup[id] = user.fullName
    }
    return lookup
}

async function searchConversations(
    client: CommsApi,
    workspaceId: number,
    searchText: string,
    includeArchived: boolean,
    limit: number,
    cursor: string | undefined,
): Promise<SearchPage> {
    const { items, hasMore, nextCursorMark } = await client.search.search({
        type: 'conversations',
        query: searchText,
        workspaceId,
        limit,
        cursor,
    })
    const conversationIds = new Set(
        items.flatMap((hit) =>
            hit.type === 'conversation' && hit.conversationId ? [hit.conversationId] : [],
        ),
    )
    const conversations = await limitedAll([...conversationIds], async (id) => {
        try {
            return await client.conversations.getConversation(id)
        } catch (error) {
            if (isNotFound(error)) {
                return null
            }
            throw error
        }
    })
    const dropped = conversations.filter((conversation) => conversation === null).length
    if (dropped > 0) {
        console.error(
            `${ToolNames.LIST_CONVERSATIONS}: dropped search hits for missing conversations`,
            { dropped, of: conversations.length },
        )
    }
    return {
        conversations: conversations.filter(
            (conversation): conversation is Conversation =>
                conversation !== null && (includeArchived || !conversation.archived),
        ),
        hasMore,
        cursor: nextCursorMark,
    }
}

function getSearchPageOutput(searchPage: SearchPage | undefined): {
    lines: string[]
    fields: { hasMore?: boolean; cursor?: string }
} {
    if (!searchPage) {
        return { lines: [], fields: {} }
    }
    const { hasMore, cursor } = searchPage
    return {
        lines: hasMore
            ? [
                  '## Next Steps',
                  '',
                  'More results available. Use the cursor to fetch the next page.',
              ]
            : [],
        fields: { hasMore, ...(cursor && { cursor }) },
    }
}

async function generateConversationsList(
    client: CommsApi,
    workspaceId: number,
    includeArchived: boolean,
    searchText: string | undefined,
    limit: number | undefined,
    cursor: string | undefined,
): Promise<{ textContent: string; structuredContent: ListConversationsStructured }> {
    // By default only fetch active conversations; optionally include archived ones too
    let conversations: Conversation[]
    let searchPage: SearchPage | undefined
    if (searchText) {
        searchPage = await searchConversations(
            client,
            workspaceId,
            searchText,
            includeArchived,
            limit ?? DEFAULT_SEARCH_LIMIT,
            cursor,
        )
        conversations = searchPage.conversations
    } else if (includeArchived) {
        const [active, archived] = await Promise.all([
            client.conversations.getConversations({ workspaceId }),
            client.conversations.getConversations({ workspaceId, archived: true }),
        ])
        conversations = [...active, ...archived]
    } else {
        conversations = await client.conversations.getConversations({ workspaceId })
    }

    const searchPageOutput = getSearchPageOutput(searchPage)

    if (conversations.length === 0) {
        return {
            textContent: [
                '# Conversations',
                '',
                'No conversations found.',
                ...(searchPageOutput.lines.length > 0 ? ['', ...searchPageOutput.lines] : []),
            ].join('\n'),
            structuredContent: {
                type: 'list_conversations',
                workspaceId,
                conversations: [],
                totalConversations: 0,
                ...searchPageOutput.fields,
            },
        }
    }

    // Only the first few participants of each conversation are displayed, so only
    // those names need resolving. Collect them into a deduplicated set.
    const displayUserIdsByConversation = new Map<string, number[]>()
    const idsToResolve = new Set<number>()
    for (const conversation of conversations) {
        const displayIds = conversation.userIds.slice(0, MAX_DISPLAYED_PARTICIPANTS)
        displayUserIdsByConversation.set(conversation.id, displayIds)
        for (const userId of displayIds) {
            idsToResolve.add(userId)
        }
    }

    const participantLookup = await resolveParticipantNames(
        client,
        workspaceId,
        Array.from(idsToResolve),
    )

    // Names for the displayed participants, positionally aligned with the first
    // entries of the conversation's `userIds`. An ID that couldn't be resolved to a
    // name falls back to its stringified ID so alignment is preserved.
    function displayNamesFor(displayIds: number[]): string[] {
        return displayIds.map((id) => participantLookup[id] ?? String(id))
    }

    const lines: string[] = ['# Conversations', '']
    lines.push(
        `Found ${conversations.length} conversation${conversations.length === 1 ? '' : 's'} in workspace ${workspaceId}:`,
        '',
    )

    for (const conversation of conversations) {
        const conversationUrl = conversation.url ?? getConversationUrl(workspaceId, conversation.id)
        const heading = conversation.title?.trim()
            ? conversation.title
            : `Conversation ${conversation.id}`

        lines.push(`## [${heading}](${conversationUrl})`)
        lines.push(`**ID:** ${conversation.id}`)
        lines.push(`**Archived:** ${conversation.archived ? 'Yes' : 'No'}`)
        lines.push(`**Last Active:** ${conversation.lastActive.toISOString()}`)

        const displayIds = displayUserIdsByConversation.get(conversation.id) ?? []
        const displayNames = displayNamesFor(displayIds)
        const remaining = conversation.userIds.length - displayIds.length
        const participantsSummary =
            remaining > 0
                ? `${displayNames.join(', ')}, and ${remaining} more`
                : displayNames.join(', ')
        lines.push(`**Participants:** ${participantsSummary}`)

        if (conversation.snippet) {
            lines.push(`**Snippet:** ${conversation.snippet}`)
        }

        lines.push('')
    }

    lines.push(...searchPageOutput.lines)

    const textContent = lines.join('\n')

    const structuredContent: ListConversationsStructured = {
        type: 'list_conversations',
        workspaceId,
        conversations: conversations.map((conversation) => {
            const displayIds = displayUserIdsByConversation.get(conversation.id) ?? []
            const displayNames = displayNamesFor(displayIds)

            return {
                id: conversation.id,
                workspaceId: conversation.workspaceId,
                ...(conversation.title && { title: conversation.title }),
                userIds: conversation.userIds,
                ...(displayNames.length > 0 && { participantNames: displayNames }),
                archived: conversation.archived,
                lastActive: conversation.lastActive.toISOString(),
                ...(conversation.snippet && { snippet: conversation.snippet }),
                conversationUrl:
                    conversation.url ?? getConversationUrl(workspaceId, conversation.id),
            }
        }),
        totalConversations: conversations.length,
        ...searchPageOutput.fields,
    }

    return { textContent, structuredContent }
}

const listConversations = {
    name: ToolNames.LIST_CONVERSATIONS,
    description:
        'List conversations (direct messages and group chats) in a workspace, or find group chats by title with searchText. Without searchText, returns the first page of conversations. searchText matches whole words in the titles of titled group chats only: direct messages, untitled group chats, and participant names do not match. Its results are paged with limit and cursor, and a page can have fewer results than limit, so follow hasMore. By default returns only active conversations; set includeArchived to true to also include archived conversations. Returns conversation IDs, titles, the full list of participant user IDs (with names resolved for the first few), archive status, last-active timestamps, snippets, and URLs.',
    parameters: ArgsSchema,
    outputSchema: ListConversationsOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(args, client) {
        const { workspaceId, includeArchived = false, searchText, limit, cursor } = args
        if (!searchText && (limit !== undefined || cursor !== undefined)) {
            throw new Error('`limit` and `cursor` require `searchText`.')
        }
        const result = await generateConversationsList(
            client,
            workspaceId,
            includeArchived,
            searchText,
            limit,
            cursor,
        )

        return getToolOutput({
            textContent: result.textContent,
            structuredContent: result.structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof ListConversationsOutputSchema.shape>

export { listConversations, type ListConversationsStructured }
