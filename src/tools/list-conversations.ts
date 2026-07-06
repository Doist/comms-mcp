import { getFullCommsURL, type CommsApi, type Conversation } from '@doist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { limitedAll } from '../utils/concurrency.js'
import { ListConversationsOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {
    workspaceId: z.number().describe('The workspace ID to list conversations from.'),
    includeArchived: z
        .boolean()
        .optional()
        .describe(
            'Whether to include archived conversations. If true, both active and archived conversations are returned. Defaults to false (active conversations only).',
        ),
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
}

// Only resolve names for the first few participants of each conversation. A large
// group DM would otherwise produce an unbounded participant string; callers that
// need every participant should load the conversation directly.
const MAX_DISPLAYED_PARTICIPANTS = 5

async function generateConversationsList(
    client: CommsApi,
    workspaceId: number,
    includeArchived: boolean,
): Promise<{ textContent: string; structuredContent: ListConversationsStructured }> {
    // By default only fetch active conversations; optionally include archived ones too
    let conversations: Conversation[]
    if (includeArchived) {
        const [active, archived] = await Promise.all([
            client.conversations.getConversations({ workspaceId }),
            client.conversations.getConversations({ workspaceId, archived: true }),
        ])
        conversations = [...active, ...archived]
    } else {
        conversations = await client.conversations.getConversations({ workspaceId })
    }

    if (conversations.length === 0) {
        return {
            textContent: '# Conversations\n\nNo conversations found.',
            structuredContent: {
                type: 'list_conversations',
                workspaceId,
                conversations: [],
                totalConversations: 0,
            },
        }
    }

    // For each conversation, only the first few participants are shown, so we only
    // need names for those. Collect them into a deduplicated set and resolve the
    // names, tolerating individual failures so a single deleted/inaccessible user
    // doesn't fail the whole list. Bounded concurrency keeps the socket pool / rate
    // limiter happy on big workspaces.
    const displayUserIdsByConversation = new Map<string, number[]>()
    const idsToResolve = new Set<number>()
    for (const conversation of conversations) {
        const displayIds = conversation.userIds.slice(0, MAX_DISPLAYED_PARTICIPANTS)
        displayUserIdsByConversation.set(conversation.id, displayIds)
        for (const userId of displayIds) {
            idsToResolve.add(userId)
        }
    }

    const participantLookup: Record<number, string> = {}
    if (idsToResolve.size > 0) {
        const idArray = Array.from(idsToResolve)
        const users = await limitedAll(idArray, (userId) =>
            client.workspaceUsers.getUserById({ workspaceId, userId }).catch(() => null),
        )
        for (let i = 0; i < idArray.length; i++) {
            const userId = idArray[i]
            const user = users[i]
            if (userId !== undefined && user) {
                participantLookup[userId] = user.fullName
            }
        }
    }

    const lines: string[] = ['# Conversations', '']
    lines.push(
        `Found ${conversations.length} conversation${conversations.length === 1 ? '' : 's'} in workspace ${workspaceId}:`,
        '',
    )

    for (const conversation of conversations) {
        const conversationUrl =
            conversation.url ?? getFullCommsURL({ workspaceId, conversationId: conversation.id })
        const heading = conversation.title?.trim()
            ? conversation.title
            : `Conversation ${conversation.id}`

        lines.push(`## [${heading}](${conversationUrl})`)
        lines.push(`**ID:** ${conversation.id}`)
        lines.push(`**Archived:** ${conversation.archived ? 'Yes' : 'No'}`)
        lines.push(`**Last Active:** ${conversation.lastActive.toISOString()}`)

        const displayIds = displayUserIdsByConversation.get(conversation.id) ?? []
        const displayNames = displayIds.map((id) => participantLookup[id] ?? String(id))
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

    const textContent = lines.join('\n')

    const structuredContent: ListConversationsStructured = {
        type: 'list_conversations',
        workspaceId,
        conversations: conversations.map((conversation) => {
            const displayIds = displayUserIdsByConversation.get(conversation.id) ?? []
            const resolvedNames = displayIds
                .map((id) => participantLookup[id])
                .filter((name): name is string => name !== undefined)

            return {
                id: conversation.id,
                workspaceId: conversation.workspaceId,
                ...(conversation.title && { title: conversation.title }),
                userIds: displayIds,
                ...(resolvedNames.length > 0 && { participantNames: resolvedNames }),
                archived: conversation.archived,
                lastActive: conversation.lastActive.toISOString(),
                ...(conversation.snippet && { snippet: conversation.snippet }),
                conversationUrl:
                    conversation.url ??
                    getFullCommsURL({ workspaceId, conversationId: conversation.id }),
            }
        }),
        totalConversations: conversations.length,
    }

    return { textContent, structuredContent }
}

const listConversations = {
    name: ToolNames.LIST_CONVERSATIONS,
    description:
        'List conversations (direct messages) in a workspace. By default returns only active conversations; set includeArchived to true to also include archived conversations. Returns conversation IDs, titles, partial list of participant user IDs and names, archive status, last-active timestamps, snippets, and URLs.',
    parameters: ArgsSchema,
    outputSchema: ListConversationsOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(args, client) {
        const { workspaceId, includeArchived = false } = args
        const result = await generateConversationsList(client, workspaceId, includeArchived)

        return getToolOutput({
            textContent: result.textContent,
            structuredContent: result.structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof ListConversationsOutputSchema.shape>

export { listConversations, type ListConversationsStructured }
