import { type SearchResultType, getFullCommsURL } from '@doist/comms-sdk'
import { z } from 'zod'
import { getToolOutput } from '../mcp-helpers.js'
import type { CommsTool } from '../comms-tool.js'
import { GetMentionsOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {
    workspaceId: z.number().describe('The workspace ID to search in.'),
    channelIds: z.array(z.string()).optional().describe('Filter by channel IDs.'),
    authorIds: z.array(z.number()).optional().describe('Filter by author user IDs.'),
    dateFrom: z.string().optional().describe('Start date for filtering (YYYY-MM-DD).'),
    dateTo: z.string().optional().describe('End date for filtering (YYYY-MM-DD).'),
    limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe('Maximum number of results to return.'),
    cursor: z.string().optional().describe('Cursor for pagination.'),
}

type GetMentionsStructured = {
    type: 'mentions_results'
    workspaceId: number
    results: Array<{
        id: string
        type: SearchResultType
        content: string
        creatorId: number
        creatorName?: string
        created: string
        threadId?: string
        conversationId?: string
        channelId?: string
        channelName?: string
        workspaceId: number
        url: string
    }>
    totalResults: number
    hasMore: boolean
    cursor?: string
}

const getMentions = {
    name: ToolNames.GET_MENTIONS,
    description:
        'Fetch threads, comments, and messages that mention the current user. Supports filtering by channel, author, and date range. Use this instead of search-content when no keyword query is needed.',
    parameters: ArgsSchema,
    outputSchema: GetMentionsOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(args, client) {
        const { workspaceId, channelIds, authorIds, dateFrom, dateTo, limit, cursor } = args

        const response = await client.search.search({
            workspaceId,
            mentionSelf: true,
            channelIds,
            authorIds,
            dateFrom,
            dateTo,
            limit,
            cursor,
        })

        const results = response.items.map((r) => ({
            id: r.id,
            type: r.type,
            content: r.snippet,
            creatorId: r.snippetCreatorId,
            created: r.snippetLastUpdated.toISOString(),
            threadId: r.threadId ?? undefined,
            conversationId: r.conversationId ?? undefined,
            channelId: r.channelId ?? undefined,
            workspaceId,
        }))

        const hasMore = response.hasMore
        const responseCursor = response.nextCursorMark

        let userLookup: Record<number, string> = {}
        let channelLookup: Record<string, string> = {}

        if (results.length > 0) {
            const userIds = new Set<number>()
            const channelIdSet = new Set<string>()
            for (const result of results) {
                userIds.add(result.creatorId)
                if (result.channelId) {
                    channelIdSet.add(result.channelId)
                }
            }

            const uniqueUserIds = Array.from(userIds)
            const uniqueChannelIds = Array.from(channelIdSet)
            const [users, channels] = await Promise.all([
                Promise.all(
                    uniqueUserIds.map((id) =>
                        client.workspaceUsers
                            .getUserById({ workspaceId, userId: id })
                            .catch(() => null),
                    ),
                ),
                Promise.all(
                    uniqueChannelIds.map((id) =>
                        client.channels.getChannel(id).catch(() => null),
                    ),
                ),
            ])

            userLookup = users.reduce<Record<number, string>>((acc, user) => {
                if (user) acc[user.id] = user.fullName
                return acc
            }, {})

            channelLookup = channels.reduce<Record<string, string>>((acc, channel) => {
                if (channel) acc[channel.id] = channel.name
                return acc
            }, {})
        }

        const lines: string[] = [`# Mentions in Workspace ${workspaceId}`, '']

        lines.push(`**Results Found:** ${results.length}`)
        lines.push(`**More Available:** ${hasMore ? 'Yes' : 'No'}`)
        lines.push('')

        if (results.length === 0) {
            lines.push('_No mentions found_')
        } else {
            lines.push('## Results')
            lines.push('')

            for (const result of results) {
                const date = result.created.split('T')[0]
                const typeLabel = result.type.charAt(0).toUpperCase() + result.type.slice(1)
                const creatorName = userLookup[result.creatorId]

                lines.push(`### ${typeLabel} ${result.id}`)
                lines.push(
                    `**Created:** ${date} | **Creator:** ${creatorName} (${result.creatorId})`,
                )

                if (result.threadId) {
                    lines.push(`**Thread:** ${result.threadId}`)
                }
                if (result.conversationId) {
                    lines.push(`**Conversation:** ${result.conversationId}`)
                }
                if (result.channelId) {
                    const channelName = channelLookup[result.channelId]
                    lines.push(`**Channel:** ${channelName} (${result.channelId})`)
                }

                lines.push('')
                const contentPreview =
                    result.content.length > 200
                        ? `${result.content.substring(0, 200)}...`
                        : result.content
                lines.push(contentPreview)
                lines.push('')
            }
        }

        if (hasMore) {
            lines.push('## Next Steps')
            lines.push('')
            lines.push('More results available. Use the cursor to fetch the next page.')
        }

        const structuredContent: GetMentionsStructured = {
            type: 'mentions_results',
            workspaceId,
            results: results.map((r) => {
                let url: string
                if (r.type === 'thread' && r.threadId !== undefined) {
                    url = getFullCommsURL({
                        workspaceId,
                        threadId: r.threadId,
                        channelId: r.channelId,
                    })
                } else if (
                    r.type === 'comment' &&
                    r.threadId !== undefined &&
                    r.channelId !== undefined
                ) {
                    url = getFullCommsURL({
                        workspaceId,
                        threadId: r.threadId,
                        channelId: r.channelId,
                        commentId: r.id,
                    })
                } else if (r.type === 'conversation' && r.conversationId !== undefined) {
                    url = getFullCommsURL({
                        workspaceId,
                        conversationId: r.conversationId,
                    })
                } else if (r.type === 'message' && r.conversationId !== undefined) {
                    url = getFullCommsURL({
                        workspaceId,
                        conversationId: r.conversationId,
                        messageId: r.id,
                    })
                } else {
                    url = ''
                }
                return {
                    ...r,
                    creatorName: userLookup[r.creatorId],
                    channelName: r.channelId ? channelLookup[r.channelId] : undefined,
                    url,
                }
            }),
            totalResults: results.length,
            hasMore,
            cursor: responseCursor,
        }

        return getToolOutput({
            textContent: lines.join('\n'),
            structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof GetMentionsOutputSchema.shape>

export { getMentions, type GetMentionsStructured }
