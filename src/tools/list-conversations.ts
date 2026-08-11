import type { CommsApi, Conversation } from '@doist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { limitedAll } from '../utils/concurrency.js'
import { ListConversationsOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { getConversationUrl } from '../utils/url-helpers.js'

const MATCH_MODES = ['exact', 'includes'] as const

const ArgsSchema = {
    workspaceId: z.number().describe('The workspace ID to list conversations from.'),
    includeArchived: z
        .boolean()
        .optional()
        .describe(
            'Whether to include archived conversations. If true, both active and archived conversations are returned. Defaults to false (active conversations only).',
        ),
    userIds: z
        .array(z.number())
        .optional()
        .describe(
            'Filter to conversations with these participants, excluding yourself (you are always implied). An empty array matches the conversation containing only you. Omit to list without filtering. Use get-users to resolve names to IDs.',
        ),
    matchMode: z
        .enum(MATCH_MODES)
        .optional()
        .default('exact')
        .describe(
            'How userIds is matched. "exact" (default) returns the single conversation whose participants are exactly you plus userIds — use this to find a specific direct or group conversation. "includes" returns every conversation containing all of userIds, and possibly others.',
        ),
    limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe('Maximum number of conversations to return.'),
    cursor: z.string().optional().describe('Cursor for pagination.'),
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
    hasMore: boolean
    cursor?: string
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

// Page size used when scanning for a participant match. Larger than the caller's
// `limit` because these pages are walked internally and never rendered — only the
// matches are. The server caps the page itself, so this is an upper bound.
const SCAN_PAGE_SIZE = 500

// Runaway guard for the internal scan. At SCAN_PAGE_SIZE this covers workspaces far
// larger than any real one; hitting it means something is wrong, and reporting a
// partial result would be indistinguishable from "no such conversation".
const MAX_SCAN_PAGES = 50

type PageCursor = { olderThan: Date; beforeId: string }

// The server's cursor is the compound (lastActive, id) of the last row seen, but
// callers get a single opaque string — matching the cursor contract of
// search-content and get-mentions, and keeping the compound shape an
// implementation detail rather than something an LLM has to assemble by hand.
function encodeCursor(conversation: Conversation): string {
    const payload = JSON.stringify({
        olderThan: conversation.lastActive.toISOString(),
        beforeId: conversation.id,
    })
    return Buffer.from(payload, 'utf8').toString('base64url')
}

const CursorSchema = z.object({ olderThan: z.iso.datetime(), beforeId: z.string().min(1) })

function decodeCursor(raw: string): PageCursor {
    let parsed: unknown
    try {
        parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
    } catch {
        parsed = undefined
    }

    const result = CursorSchema.safeParse(parsed)
    if (!result.success) {
        throw new Error('Invalid cursor: expected a cursor returned by a previous call.')
    }

    return { olderThan: new Date(result.data.olderThan), beforeId: result.data.beforeId }
}

// Omitting `archived` entirely returns active and archived in one stream, which is
// what `includeArchived` wants — and it keeps a single cursor. Requesting the two
// states separately would need two independent cursors, and concatenating them
// would double-count archived rows.
function buildPageArgs(
    workspaceId: number,
    includeArchived: boolean,
    limit: number,
    cursor: PageCursor | undefined,
) {
    return {
        workspaceId,
        limit,
        ...(includeArchived ? {} : { archived: false }),
        ...(cursor ? { olderThan: cursor.olderThan, beforeId: cursor.beforeId } : {}),
    }
}

/**
 * Walk conversations from an optional starting cursor, yielding each row not seen
 * on an earlier page. Each request continues from the previous page's last row via
 * the compound (lastActive, id) cursor, so quiet conversations far down the list
 * are still reached.
 *
 * Exhaustion is judged by a page adding nothing new, never by a page coming back
 * shorter than requested: the server is free to cap the page below SCAN_PAGE_SIZE,
 * and treating its cap as the end of the list would truncate every scan at the
 * first page — the bug this iterator exists to fix. The cost is one extra request
 * per scan.
 */
async function* iterateConversations(
    client: CommsApi,
    workspaceId: number,
    includeArchived: boolean,
    startCursor: PageCursor | undefined,
): AsyncGenerator<Conversation> {
    const seenIds = new Set<string>()
    let cursor = startCursor

    for (let pageCount = 0; ; pageCount++) {
        if (pageCount >= MAX_SCAN_PAGES) {
            throw new Error(
                `Scanned ${MAX_SCAN_PAGES} pages of conversations in workspace ${workspaceId} without exhausting the list; refusing to report a partial result.`,
            )
        }

        const page = await client.conversations.getConversations(
            buildPageArgs(workspaceId, includeArchived, SCAN_PAGE_SIZE, cursor),
        )
        if (page.length === 0) return

        const unseen = page.filter((conversation) => !seenIds.has(conversation.id))
        if (unseen.length === 0) {
            // Nothing new. On a full page that means the cursor has stopped
            // advancing, and truncating silently is how conversations "disappear";
            // on a short one it just means the boundary row repeated at the end.
            if (page.length >= SCAN_PAGE_SIZE) {
                throw new Error(
                    `conversations/get returned a full page with no new conversations (workspace ${workspaceId}); results would be incomplete.`,
                )
            }
            return
        }

        for (const conversation of unseen) {
            seenIds.add(conversation.id)
            yield conversation
        }

        const last = page[page.length - 1] as Conversation
        cursor = { olderThan: last.lastActive, beforeId: last.id }
    }
}

/**
 * Build the participant predicate once per query rather than per conversation —
 * `exact` needs a set to compare against, and rebuilding it for every row scanned
 * is wasted work on a workspace-wide walk.
 */
function buildParticipantMatcher(
    targetIds: readonly number[],
    sessionUserId: number,
    matchMode: (typeof MATCH_MODES)[number],
): (conversation: Conversation) => boolean {
    if (matchMode === 'includes') {
        return (conversation) => {
            const participants = new Set(conversation.userIds)
            return targetIds.every((id) => participants.has(id))
        }
    }

    // Exact: the participant set is you plus the requested users, no one else.
    // An empty `targetIds` therefore matches the conversation containing only you.
    const expected = new Set([...targetIds, sessionUserId])
    return (conversation) => {
        const participants = new Set(conversation.userIds)
        return (
            participants.size === expected.size && [...expected].every((id) => participants.has(id))
        )
    }
}

type ConversationQueryResult = {
    conversations: Conversation[]
    hasMore: boolean
    nextCursor?: string
}

/** Unfiltered listing: one page per call, the caller drives pagination. */
async function fetchConversationPage(
    client: CommsApi,
    workspaceId: number,
    includeArchived: boolean,
    limit: number,
    cursor: PageCursor | undefined,
): Promise<ConversationQueryResult> {
    const conversations = await client.conversations.getConversations(
        buildPageArgs(workspaceId, includeArchived, limit, cursor),
    )

    // A short page means the list is exhausted; a full one means there may be more.
    // This assumes the server honours `limit` — if it caps the page lower, a caller
    // driving pagination stops early. The internal scan deliberately does not rely
    // on that assumption; see iterateConversations.
    const hasMore = conversations.length >= limit
    const last = conversations[conversations.length - 1]

    return {
        conversations,
        hasMore,
        ...(hasMore && last ? { nextCursor: encodeCursor(last) } : {}),
    }
}

/**
 * Participant lookup: walk the pages internally and return only the matches, so a
 * caller asking "the conversation with these people" gets an answer in one call
 * rather than paging and deciding when to stop.
 */
async function scanForParticipants(
    client: CommsApi,
    workspaceId: number,
    includeArchived: boolean,
    targetIds: readonly number[],
    matchMode: (typeof MATCH_MODES)[number],
    limit: number,
    cursor: PageCursor | undefined,
): Promise<ConversationQueryResult> {
    const sessionUser = await client.users.getSessionUser()
    const matches: Conversation[] = []
    const matchesQuery = buildParticipantMatcher(targetIds, sessionUser.id, matchMode)

    for await (const conversation of iterateConversations(
        client,
        workspaceId,
        includeArchived,
        cursor,
    )) {
        if (!matchesQuery(conversation)) continue

        matches.push(conversation)

        // An exact participant set identifies at most one conversation — the same
        // rule the backend dedupes on — so the first hit is the answer.
        if (matchMode === 'exact') {
            return { conversations: matches, hasMore: false }
        }

        // Resume from the conversation we stopped on, not the end of its page —
        // anything between the two would be skipped on the next call.
        if (matches.length >= limit) {
            return {
                conversations: matches,
                hasMore: true,
                nextCursor: encodeCursor(conversation),
            }
        }
    }

    return { conversations: matches, hasMore: false }
}

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
    query: ConversationQueryResult,
    emptyMessage: string,
): Promise<{ textContent: string; structuredContent: ListConversationsStructured }> {
    const { conversations, hasMore, nextCursor } = query

    if (conversations.length === 0) {
        return {
            textContent: `# Conversations\n\n${emptyMessage}`,
            structuredContent: {
                type: 'list_conversations',
                workspaceId,
                conversations: [],
                totalConversations: 0,
                hasMore: false,
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

    if (hasMore) {
        lines.push('## Next Steps')
        lines.push('')
        lines.push('More results available. Use the cursor to fetch the next page.')
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
        hasMore,
        ...(nextCursor && { cursor: nextCursor }),
    }

    return { textContent, structuredContent }
}

const listConversations = {
    name: ToolNames.LIST_CONVERSATIONS,
    description:
        'List conversations (direct messages) in a workspace, or find a specific one by its participants. Pass userIds to get the conversation with exactly those people (plus you) — an empty array finds the conversation with only you — or set matchMode to "includes" for every conversation containing them. Without userIds, returns a page of conversations; use the returned cursor for the next page. By default only active conversations are returned; set includeArchived to true to also include archived ones. Returns conversation IDs, titles, the full list of participant user IDs (with names resolved for the first few), archive status, last-active timestamps, snippets, and URLs.',
    parameters: ArgsSchema,
    outputSchema: ListConversationsOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(args, client) {
        const {
            workspaceId,
            includeArchived = false,
            userIds,
            matchMode = 'exact',
            limit = 50,
            cursor,
        } = args

        const pageCursor = cursor ? decodeCursor(cursor) : undefined

        const query = userIds
            ? await scanForParticipants(
                  client,
                  workspaceId,
                  includeArchived,
                  userIds,
                  matchMode,
                  limit,
                  pageCursor,
              )
            : await fetchConversationPage(client, workspaceId, includeArchived, limit, pageCursor)

        const result = await generateConversationsList(
            client,
            workspaceId,
            query,
            userIds ? 'No conversation matches those participants.' : 'No conversations found.',
        )

        return getToolOutput({
            textContent: result.textContent,
            structuredContent: result.structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof ListConversationsOutputSchema.shape>

export { listConversations, type ListConversationsStructured }
