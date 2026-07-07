import { getFullCommsURL, type SearchResult } from '@doist/comms-sdk'
import type { SearchResultItem } from './output-schemas.js'

// Search result before URL/name enrichment, discriminated the same way as the output.
export type RawSearchResult = {
    id: string
    content: string
    creatorId: number
    created: string
} & (
    | { type: 'thread'; threadId: string; commentId?: string; channelId?: string }
    | { type: 'conversation'; conversationId: string; messageId: string }
)

/**
 * Normalizes SDK search results into the discriminated shape shared by
 * search-content and get-mentions. The search API only emits 'thread' and
 * 'conversation' results, each with its container id set; a comment match is a
 * 'thread' result with commentId set, a message match a 'conversation' result
 * with messageId set. Results missing a required id are dropped with a logged
 * warning.
 */
export function toRawSearchResults(items: SearchResult[], toolName: string): RawSearchResult[] {
    const results = items.flatMap((r): RawSearchResult[] => {
        const common = {
            id: r.id,
            content: r.snippet,
            creatorId: r.snippetCreatorId,
            created: r.snippetLastUpdated.toISOString(),
        }
        if (r.type === 'thread' && r.threadId != null) {
            return [
                {
                    ...common,
                    type: 'thread' as const,
                    threadId: r.threadId,
                    commentId: r.commentId ?? undefined,
                    channelId: r.channelId ?? undefined,
                },
            ]
        }
        if (r.type === 'conversation' && r.conversationId != null && r.messageId != null) {
            return [
                {
                    ...common,
                    type: 'conversation' as const,
                    conversationId: r.conversationId,
                    messageId: r.messageId,
                },
            ]
        }
        return []
    })

    if (results.length < items.length) {
        console.error(`${toolName}: dropped search result(s) missing a required id`, {
            dropped: items.length - results.length,
        })
    }

    return results
}

/**
 * Enriches raw search results with creator/channel names and permalinks.
 * Comment deep-links require a channel (see build-link); without one the URL
 * falls back to the plain thread link.
 */
export function toSearchResultItems(
    results: RawSearchResult[],
    {
        workspaceId,
        userLookup,
        channelLookup,
    }: {
        workspaceId: number
        userLookup: Record<number, string>
        channelLookup: Record<string, string>
    },
): SearchResultItem[] {
    return results.map((r): SearchResultItem => {
        const common = {
            creatorName: userLookup[r.creatorId],
            workspaceId,
        }
        if (r.type === 'thread') {
            return {
                ...r,
                ...common,
                channelName: r.channelId ? channelLookup[r.channelId] : undefined,
                url: getFullCommsURL({
                    workspaceId,
                    threadId: r.threadId,
                    channelId: r.channelId,
                    commentId: r.channelId ? r.commentId : undefined,
                }),
            }
        }
        return {
            ...r,
            ...common,
            url: getFullCommsURL({
                workspaceId,
                conversationId: r.conversationId,
                messageId: r.messageId,
            }),
        }
    })
}
