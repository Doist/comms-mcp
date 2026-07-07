import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { type GetMentionsOutput, GetMentionsOutputSchema } from '../utils/output-schemas.js'
import { toRawSearchResults, toSearchResultItems } from '../utils/search-results.js'
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

type GetMentionsStructured = GetMentionsOutput

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

        const results = toRawSearchResults(response.items, 'get-mentions')

        const hasMore = response.hasMore
        const responseCursor = response.nextCursorMark

        let userLookup: Record<number, string> = {}
        let channelLookup: Record<string, string> = {}

        if (results.length > 0) {
            const userIds = new Set<number>()
            const channelIdSet = new Set<string>()
            for (const result of results) {
                userIds.add(result.creatorId)
                if (result.type === 'thread' && result.channelId) {
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
                    uniqueChannelIds.map((id) => client.channels.getChannel(id).catch(() => null)),
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

                if (result.type === 'thread') {
                    lines.push(`**Thread:** ${result.threadId}`)
                    if (result.commentId) {
                        lines.push(`**Comment:** ${result.commentId}`)
                    }
                    if (result.channelId) {
                        const channelName = channelLookup[result.channelId]
                        lines.push(`**Channel:** ${channelName} (${result.channelId})`)
                    }
                } else {
                    lines.push(`**Conversation:** ${result.conversationId}`)
                    lines.push(`**Message:** ${result.messageId}`)
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
            results: toSearchResultItems(results, { workspaceId, userLookup, channelLookup }),
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
