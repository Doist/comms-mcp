import type { CommsApi } from '@doist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { limitedAll } from '../utils/concurrency.js'
import { logOperationFailures, SAMPLE_LIMIT } from '../utils/degrade.js'
import { MarkReadOutputSchema } from '../utils/output-schemas.js'
import { markConversationFullyRead, markThreadFullyRead } from '../utils/read-position.js'
import type { MarkReadItemType } from '../utils/target-types.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {
    workspaceId: z
        .number()
        .describe(
            'The workspace the threads and conversations belong to. Its unread lists decide which requested items actually need marking.',
        ),
    threadIds: z
        .array(z.string())
        .optional()
        .describe(
            'Thread IDs to mark as read. Threads that are not currently unread are reported as alreadyRead and left untouched.',
        ),
    conversationIds: z
        .array(z.string())
        .optional()
        .describe(
            'Conversation IDs to mark as read. Conversations that are not currently unread are reported as alreadyRead and left untouched.',
        ),
    all: z
        .boolean()
        .optional()
        .describe(
            'Mark every unread thread and conversation in the workspace as read. Cannot be combined with threadIds or conversationIds.',
        ),
}

type MarkReadItems = {
    marked: string[]
    alreadyRead: string[]
}

type MarkReadFailure = {
    item: string
    itemType: MarkReadItemType
    error: string
}

type MarkReadStructured = {
    type: 'mark_read_result'
    workspaceId: number
    mode: 'individual' | 'all'
    threads: MarkReadItems
    conversations: MarkReadItems
    failed: MarkReadFailure[]
    markedCount: number
    failureCount: number
}

function dedupe(ids: readonly string[] | undefined): string[] {
    return [...new Set(ids ?? [])]
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error'
}

type MarkResult = { marked: string[]; failed: MarkReadFailure[] }

/**
 * Marks each item read through its latest comment/message, one API pair per
 * item. Failures are returned per item rather than thrown so one deleted or
 * inaccessible item never stops the rest of the batch.
 */
async function markEach(
    client: CommsApi,
    itemType: MarkReadItemType,
    ids: readonly string[],
): Promise<MarkResult> {
    const markOne = itemType === 'thread' ? markThreadFullyRead : markConversationFullyRead
    const results = await limitedAll(ids, async (id) => {
        try {
            await markOne(client, id)
            return { id }
        } catch (error) {
            return { id, error: errorMessage(error) }
        }
    })

    const marked: string[] = []
    const failed: MarkReadFailure[] = []
    for (const result of results) {
        if (result.error === undefined) {
            marked.push(result.id)
        } else {
            failed.push({ item: result.id, itemType, error: result.error })
        }
    }
    return { marked, failed }
}

/**
 * Marks every unread thread in the workspace read with a single call. The
 * IDs come from the unread list fetched beforehand, so the result can still
 * name what was marked; if the call fails, every one of them is reported.
 */
async function markAllThreads(
    client: CommsApi,
    workspaceId: number,
    unreadThreadIds: readonly string[],
): Promise<MarkResult> {
    if (unreadThreadIds.length === 0) {
        return { marked: [], failed: [] }
    }
    try {
        await client.threads.markAllRead({ workspaceId })
        return { marked: [...unreadThreadIds], failed: [] }
    } catch (error) {
        const message = errorMessage(error)
        return {
            marked: [],
            failed: unreadThreadIds.map((item) => ({ item, itemType: 'thread', error: message })),
        }
    }
}

/**
 * Lists IDs for the text output. In `all` mode the caller never supplied the
 * IDs and cannot act on them individually, so a workspace with hundreds of
 * unread items would only flood the context; the list is capped there while
 * `structuredContent` keeps every ID.
 */
function formatIdList(ids: readonly string[], cap: number | null): string {
    if (ids.length === 0) {
        return 'none'
    }
    if (cap === null || ids.length <= cap) {
        return ids.join(', ')
    }
    return `${ids.slice(0, cap).join(', ')} … and ${ids.length - cap} more`
}

function formatItemSection(label: string, items: MarkReadItems, mode: 'individual' | 'all') {
    const cap = mode === 'all' ? SAMPLE_LIMIT : null
    const lines = [`## ${label}`, '']
    lines.push(`**Marked:** ${formatIdList(items.marked, cap)}`)
    if (mode === 'individual') {
        lines.push(`**Already read:** ${formatIdList(items.alreadyRead, cap)}`)
    }
    lines.push('')
    return lines
}

const markRead = {
    name: ToolNames.MARK_READ,
    description:
        'Mark threads and/or conversations as read without archiving them, so they stay in the inbox but no longer count as unread. Pass specific threadIds and/or conversationIds, or all: true to mark everything unread in the workspace. Items that are not currently unread are skipped and reported as alreadyRead. Use mark-done instead when the items should also be archived.',
    parameters: ArgsSchema,
    outputSchema: MarkReadOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async execute(args, client) {
        const { workspaceId, all = false } = args
        const threadIds = dedupe(args.threadIds)
        const conversationIds = dedupe(args.conversationIds)

        if (all && (threadIds.length > 0 || conversationIds.length > 0)) {
            throw new Error('`all` cannot be combined with threadIds or conversationIds')
        }
        if (!all && threadIds.length === 0 && conversationIds.length === 0) {
            throw new Error('Provide threadIds, conversationIds, or all: true')
        }

        const mode = all ? 'all' : 'individual'

        // The unread lists are the source of truth for what needs marking. With
        // explicit IDs they let already-read items be skipped (and reported as
        // such) instead of re-marked; with `all` they are the work list itself.
        // Each list is only fetched when that item type is in play.
        const [unreadThreads, unreadConversations] = await Promise.all([
            all || threadIds.length > 0
                ? client.threads.getUnread(workspaceId).then((r) => r.data.map((t) => t.threadId))
                : [],
            all || conversationIds.length > 0
                ? client.conversations
                      .getUnread(workspaceId)
                      .then((r) => r.data.map((c) => c.conversationId))
                : [],
        ])

        const threads: MarkReadItems = { marked: [], alreadyRead: [] }
        const conversations: MarkReadItems = { marked: [], alreadyRead: [] }
        const failed: MarkReadFailure[] = []

        if (all) {
            // One workspace-level call covers every unread thread. There is no
            // working equivalent for conversations, so those go one by one,
            // concurrently with the thread call.
            const [threadResult, conversationResult] = await Promise.all([
                markAllThreads(client, workspaceId, unreadThreads),
                markEach(client, 'conversation', unreadConversations),
            ])
            threads.marked = threadResult.marked
            conversations.marked = conversationResult.marked
            failed.push(...threadResult.failed, ...conversationResult.failed)
        } else {
            const unreadThreadSet = new Set(unreadThreads)
            const unreadConversationSet = new Set(unreadConversations)
            threads.alreadyRead = threadIds.filter((id) => !unreadThreadSet.has(id))
            conversations.alreadyRead = conversationIds.filter(
                (id) => !unreadConversationSet.has(id),
            )

            const [threadResult, conversationResult] = await Promise.all([
                markEach(
                    client,
                    'thread',
                    threadIds.filter((id) => unreadThreadSet.has(id)),
                ),
                markEach(
                    client,
                    'conversation',
                    conversationIds.filter((id) => unreadConversationSet.has(id)),
                ),
            ])
            threads.marked = threadResult.marked
            conversations.marked = conversationResult.marked
            failed.push(...threadResult.failed, ...conversationResult.failed)
        }

        logOperationFailures(ToolNames.MARK_READ, failed)

        const markedCount = threads.marked.length + conversations.marked.length
        const alreadyReadCount = threads.alreadyRead.length + conversations.alreadyRead.length

        const lines: string[] = ['# Mark Read', '']
        lines.push(`**Workspace ID:** ${workspaceId}`)
        lines.push(`**Mode:** ${mode === 'all' ? 'All unread in workspace' : 'Individual IDs'}`)
        lines.push(`**Marked:** ${markedCount}`)
        if (mode === 'individual') {
            lines.push(`**Already read:** ${alreadyReadCount}`)
        }
        lines.push(`**Failed:** ${failed.length}`)
        lines.push('')

        if (mode === 'all' || threadIds.length > 0) {
            lines.push(...formatItemSection('Threads', threads, mode))
        }
        if (mode === 'all' || conversationIds.length > 0) {
            lines.push(...formatItemSection('Conversations', conversations, mode))
        }

        if (failed.length > 0) {
            lines.push('## Failed', '')
            for (const failure of failed) {
                lines.push(`- ${failure.itemType} ${failure.item}: ${failure.error}`)
            }
            lines.push('')
        }

        lines.push('## Next Steps', '')
        if (failed.length > 0) {
            lines.push('Review failed items and retry if needed.')
        } else if (markedCount === 0) {
            lines.push('Nothing was unread, so no changes were made.')
        } else {
            lines.push(
                'Items remain in the inbox. Use `mark-done` to archive them, or `fetch-inbox` with `onlyUnread: true` to see what is still unread.',
            )
        }

        const structuredContent: MarkReadStructured = {
            type: 'mark_read_result',
            workspaceId,
            mode,
            threads,
            conversations,
            failed,
            markedCount,
            failureCount: failed.length,
        }

        return getToolOutput({
            textContent: lines.join('\n'),
            structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof MarkReadOutputSchema.shape>

export { markRead, type MarkReadStructured }
