import type { CommsApi, Conversation } from '@doist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { limitedAll } from '../utils/concurrency.js'
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
// need every participant should load the conversation directly. The full set of
// participant IDs is still returned in `userIds`.
const MAX_DISPLAYED_PARTICIPANTS = 5

// Above this many unique participants to resolve, a single workspace-roster fetch
// is cheaper than one getUserById round trip per participant. Below it, targeted
// lookups avoid pulling the whole roster for a handful of names.
const PARTICIPANT_ROSTER_THRESHOLD = 20

// Resolve user IDs to names. For a small number of IDs, look each up individually
// (bounded concurrency, tolerating individual failures); for larger sets, fetch the
// workspace roster once and resolve locally. IDs that can't be resolved are simply
// absent from the returned map.
async function resolveParticipantNames(
    client: CommsApi,
    workspaceId: number,
    userIds: number[],
): Promise<Record<number, string>> {
    const lookup: Record<number, string> = {}
    if (userIds.length === 0) {
        return lookup
    }

    if (userIds.length > PARTICIPANT_ROSTER_THRESHOLD) {
        const roster = await client.workspaceUsers
            .getWorkspaceUsers({ workspaceId })
            .catch(() => [])
        for (const user of roster) {
            lookup[user.id] = user.fullName
        }
        return lookup
    }

    // Tolerate individual failures so a single deleted/inaccessible user doesn't fail
    // the whole list; bounded concurrency keeps the socket pool / rate limiter happy.
    const users = await limitedAll(userIds, (userId) =>
        client.workspaceUsers.getUserById({ workspaceId, userId }).catch(() => null),
    )
    userIds.forEach((userId, i) => {
        const user = users[i]
        if (user) {
            lookup[userId] = user.fullName
        }
    })
    return lookup
}

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
    const displayNamesFor = (displayIds: number[]) =>
        displayIds.map((id) => participantLookup[id] ?? String(id))

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
    }

    return { textContent, structuredContent }
}

const listConversations = {
    name: ToolNames.LIST_CONVERSATIONS,
    description:
        'List conversations (direct messages) in a workspace. By default returns only active conversations; set includeArchived to true to also include archived conversations. Returns conversation IDs, titles, the full list of participant user IDs (with names resolved for the first few), archive status, last-active timestamps, snippets, and URLs.',
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
