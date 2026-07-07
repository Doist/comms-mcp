import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { type SearchContentOutput, SearchContentOutputSchema } from '../utils/output-schemas.js'
import { toRawSearchResults, toSearchResultItems } from '../utils/search-results.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {
    query: z.string().min(1).describe('The search query string.'),
    workspaceId: z.number().describe('The workspace ID to search in.'),
    channelIds: z.array(z.string()).optional().describe('Filter by channel IDs.'),
    authorIds: z.array(z.number()).optional().describe('Filter by author user IDs.'),
    mentionSelf: z.boolean().optional().describe('Filter by mentions of current user.'),
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

type SearchContentStructured = SearchContentOutput

const searchContent = {
    name: ToolNames.SEARCH_CONTENT,
    description:
        'Search across a workspace for threads, comments, and messages. Supports filtering by channels, authors, dates, and mentions.',
    parameters: ArgsSchema,
    outputSchema: SearchContentOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(args, client) {
        const {
            query,
            workspaceId,
            channelIds,
            authorIds,
            mentionSelf,
            dateFrom,
            dateTo,
            limit,
            cursor,
        } = args

        // Perform global workspace search
        const response = await client.search.search({
            query,
            workspaceId,
            channelIds,
            authorIds,
            mentionSelf,
            dateFrom,
            dateTo,
            limit,
            cursor,
        })

        const results = toRawSearchResults(response.items, 'search-content')

        const hasMore = response.hasMore
        const responseCursor = response.nextCursorMark

        // Initialize lookup maps
        let userLookup: Record<number, string> = {}
        let channelLookup: Record<string, string> = {}

        // Only fetch user and channel info if there are results
        if (results.length > 0) {
            // Collect unique user IDs and channel IDs
            const userIds = new Set<number>()
            const channelIdSet = new Set<string>()
            for (const result of results) {
                userIds.add(result.creatorId)
                if (result.type === 'thread' && result.channelId) {
                    channelIdSet.add(result.channelId)
                }
            }

            // Fetch all users and channels in parallel
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

        // Build text content
        const lines: string[] = [`# Search Results for "${query}"`, '']

        lines.push(`**Search Scope:** Workspace ${workspaceId}`)
        lines.push(`**Results Found:** ${results.length}`)
        lines.push(`**More Available:** ${hasMore ? 'Yes' : 'No'}`)
        lines.push('')

        if (results.length === 0) {
            lines.push('_No results found_')
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
                }

                lines.push('')
                // Truncate long content
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

        const structuredContent: SearchContentStructured = {
            type: 'search_results',
            query,
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
} satisfies CommsTool<typeof ArgsSchema, typeof SearchContentOutputSchema.shape>

export { searchContent, type SearchContentStructured }
