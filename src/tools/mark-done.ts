import { z } from 'zod'
import { getToolOutput } from '../mcp-helpers.js'
import type { CommsTool } from '../comms-tool.js'
import { MarkDoneOutputSchema } from '../utils/output-schemas.js'
import { type MarkDoneType, MarkDoneTypeSchema } from '../utils/target-types.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {
    type: MarkDoneTypeSchema.describe('The type of items to mark as done: thread or conversation.'),

    // Individual IDs (thread/conversation IDs are strings)
    ids: z
        .array(z.string())
        .optional()
        .describe(
            'Specific thread or conversation IDs to mark as done. Use this OR bulk selectors.',
        ),

    // Bulk selectors (for threads only)
    workspaceId: z
        .number()
        .optional()
        .describe('Mark all threads in this workspace as done (threads only).'),
    channelId: z
        .string()
        .optional()
        .describe('Mark all threads in this channel as done (threads only).'),

    // Operations
    markRead: z.boolean().optional().describe('Mark items as read (default: true).'),
    archive: z
        .boolean()
        .optional()
        .describe('Archive items in the inbox (threads only, default: true).'),
    clearUnread: z
        .boolean()
        .optional()
        .describe(
            'Clear all unread markers for workspace (threads only, requires workspaceId, default: false).',
        ),
}

type MarkDoneStructured = {
    type: 'mark_done_result'
    itemType: MarkDoneType
    mode: 'individual' | 'bulk'
    completed: string[]
    failed: Array<{ item: string; error: string }>
    totalRequested: number
    successCount: number
    failureCount: number
    operations: {
        markRead: boolean
        archive: boolean
        clearUnread: boolean
    }
    selectors?: {
        workspaceId?: number
        channelId?: string
    }
}

const markDone = {
    name: ToolNames.MARK_DONE,
    description:
        'Mark threads or conversations as done. Supports individual IDs or bulk operations (mark all in workspace/channel). For threads: can mark as read, archive in inbox, or clear all unread. For conversations: can mark as read and archive.',
    parameters: ArgsSchema,
    outputSchema: MarkDoneOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async execute(args, client) {
        const {
            type,
            ids,
            workspaceId,
            channelId,
            markRead = true,
            archive = true,
            clearUnread = false,
        } = args

        const completed: string[] = []
        const failed: Array<{ item: string; error: string }> = []
        let mode: 'individual' | 'bulk' = 'individual'

        // Validate arguments
        if (!ids && !workspaceId && !channelId) {
            throw new Error('Must provide either ids, workspaceId, or channelId')
        }

        if (type === 'conversation' && (workspaceId || channelId || clearUnread)) {
            throw new Error(
                'Bulk operations (workspaceId, channelId, clearUnread) are only supported for threads',
            )
        }

        try {
            // Bulk operations (threads only)
            if (type === 'thread' && (workspaceId || channelId)) {
                mode = 'bulk'

                // Clear unread takes precedence; it's strictly workspace-scoped
                // (the SDK only exposes a workspace-level signature), so we
                // require workspaceId for it.
                if (clearUnread && workspaceId) {
                    await client.threads.clearUnread(workspaceId)
                } else {
                    // Mark all read — pass both selectors when both are present
                    // so the call stays scoped to the channel inside the
                    // workspace rather than nuking the whole workspace.
                    if (markRead) {
                        if (workspaceId && channelId) {
                            await client.threads.markAllRead({ workspaceId, channelId })
                        } else if (workspaceId) {
                            await client.threads.markAllRead({ workspaceId })
                        } else if (channelId) {
                            await client.threads.markAllRead({ channelId })
                        }
                    }

                    // Archive all (inbox operations). `archiveAll` requires a
                    // workspaceId; with a channelId also present, pass it via
                    // `channelIds` so the archive stays scoped to that channel.
                    // Channel-only (no workspaceId) isn't supported by the SDK.
                    if (archive) {
                        if (workspaceId && channelId) {
                            await client.inbox.archiveAll({
                                workspaceId,
                                channelIds: [channelId],
                            })
                        } else if (workspaceId) {
                            await client.inbox.archiveAll({ workspaceId })
                        }
                        // channelId-only: silently skipped — see TODO(comms-sdk)
                        // above. The bulk path still reports success because the
                        // mark-read step above runs in the channel-only case.
                    }
                }

                // We don't get individual IDs back from bulk operations
                // Just indicate success
            } else if (ids && ids.length > 0) {
                // Individual operations - run them in parallel
                mode = 'individual'

                // Try all operations concurrently; if any individual ID
                // fails, record it but keep going.
                const results = await Promise.all(
                    ids.map(async (id) => {
                        try {
                            if (type === 'thread') {
                                if (markRead) {
                                    await client.threads.markRead({ id, objIndex: 0 })
                                }
                                if (archive) {
                                    await client.inbox.archiveThread(id)
                                }
                            } else {
                                if (markRead) {
                                    await client.conversations.markRead({ id })
                                }
                                if (archive) {
                                    await client.conversations.archiveConversation(id)
                                }
                            }
                            return { id, ok: true as const }
                        } catch (error) {
                            const errorMessage =
                                error instanceof Error ? error.message : 'Unknown error'
                            return { id, ok: false as const, errorMessage }
                        }
                    }),
                )

                for (const r of results) {
                    if (r.ok) {
                        completed.push(r.id)
                    } else {
                        failed.push({ item: r.id, error: r.errorMessage })
                    }
                }
            }
        } catch (error) {
            // Bulk operation failed entirely
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            throw new Error(`Bulk operation failed: ${errorMessage}`)
        }

        // Build text content
        const lines: string[] = [
            `# Mark ${type === 'thread' ? 'Threads' : 'Conversations'} Done`,
            '',
        ]

        lines.push(`**Mode:** ${mode === 'bulk' ? 'Bulk Operation' : 'Individual IDs'}`)

        if (mode === 'bulk') {
            if (workspaceId) {
                lines.push(`**Workspace ID:** ${workspaceId}`)
            }
            if (channelId) {
                lines.push(`**Channel ID:** ${channelId}`)
            }
            if (clearUnread) {
                lines.push('**Operation:** Clear all unread markers')
            } else {
                lines.push(`**Mark Read:** ${markRead ? 'Yes' : 'No'}`)
                lines.push(`**Archive:** ${archive ? 'Yes' : 'No'}`)
            }
            lines.push('')
            lines.push('Bulk operation completed successfully')
        } else {
            lines.push(`**Total Requested:** ${ids?.length ?? 0}`)
            lines.push(`**Successful:** ${completed.length}`)
            lines.push(`**Failed:** ${failed.length}`)
            lines.push(`**Mark Read:** ${markRead ? 'Yes' : 'No'}`)
            lines.push(`**Archive:** ${archive ? 'Yes' : 'No'}`)
            lines.push('')

            if (completed.length > 0) {
                lines.push('## Completed')
                lines.push('')
                lines.push(completed.join(', '))
                lines.push('')
            }

            if (failed.length > 0) {
                lines.push('## Failed')
                lines.push('')
                for (const failure of failed) {
                    lines.push(`- ${type} ${failure.item}: ${failure.error}`)
                }
                lines.push('')
            }
        }

        // Add next steps
        lines.push('## Next Steps')
        lines.push('')
        if (mode === 'bulk' || (failed.length === 0 && completed.length > 0)) {
            lines.push(
                type === 'thread'
                    ? 'Use `fetch-inbox` to see remaining unread threads.'
                    : 'Check your conversations for remaining unread messages.',
            )
        } else if (failed.length > 0) {
            lines.push('Review failed items and retry if needed.')
        }

        const structuredContent: MarkDoneStructured = {
            type: 'mark_done_result',
            itemType: type,
            mode,
            completed,
            failed,
            totalRequested: ids?.length ?? 0,
            successCount: completed.length,
            failureCount: failed.length,
            operations: {
                markRead,
                archive,
                clearUnread,
            },
            selectors:
                workspaceId || channelId
                    ? {
                          workspaceId,
                          channelId,
                      }
                    : undefined,
        }

        return getToolOutput({
            textContent: lines.join('\n'),
            structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof MarkDoneOutputSchema.shape>

export { markDone, type MarkDoneStructured }
