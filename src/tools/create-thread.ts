import { getFullCommsURL, NOTIFY_AUDIENCES } from '@doist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { type CreateThreadOutput, CreateThreadOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {
    channelId: z.string().describe('The ID of the channel to create the thread in.'),
    title: z.string().min(1).describe('The title of the thread.'),
    content: z.string().min(1).describe('The content/body of the thread.'),
    recipients: z
        .array(z.number())
        .optional()
        .describe(
            "Optional array of individual user IDs to notify. To notify everyone in the channel, prefer notifyAudience: 'channel' instead of enumerating every member here. If omitted (with no groups and no notifyAudience), Comms applies the channel's defaults, which is everyone in the channel. Note: workspace users who have not joined this channel will not be notified — add their IDs explicitly if you want to reach them.",
        ),
    displayInInbox: z
        .boolean()
        .optional()
        .describe(
            "If true, unarchives the thread after creation so it appears in the author's Inbox. Defaults to false. Can also be enabled for all calls by setting the COMMS_CREATE_THREAD_DISPLAY_IN_INBOX=true environment variable (local MCP only).",
        ),
    groups: z
        .array(z.string())
        .optional()
        .describe(
            'Optional array of group IDs to notify. Use get-groups to discover group IDs before passing them here.',
        ),
    notifyAudience: z
        .enum(NOTIFY_AUDIENCES)
        .optional()
        .describe(
            "Optional broader audience to notify in addition to recipients and groups. 'channel' tags the thread with \"Everyone in channel\" — use this to reach everyone instead of listing individual recipients. 'thread' (everyone who has interacted) has no effect when creating a thread, since a new thread has no interactions yet — use it on reply instead.",
        ),
}

const createThread = {
    name: ToolNames.CREATE_THREAD,
    description:
        'Create a new thread in a workspace channel. Requires a channel ID, title, and content. Optionally notify specific users or groups.',
    parameters: ArgsSchema,
    outputSchema: CreateThreadOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async execute(args, client) {
        const { channelId, title, content, recipients, groups, notifyAudience, displayInInbox } =
            args

        const thread = await client.threads.createThread({
            channelId,
            title,
            content,
            recipients,
            groups,
            notifyAudience,
        })

        const wantsInboxDisplay =
            displayInInbox === true ||
            (displayInInbox === undefined &&
                process.env.COMMS_CREATE_THREAD_DISPLAY_IN_INBOX === 'true')

        let displayedInInbox = false
        if (wantsInboxDisplay) {
            // Unarchive so the thread appears in the author's Inbox.
            // Failure here is non-fatal — the thread itself was created successfully.
            try {
                await client.inbox.unarchiveThread(thread.id)
                displayedInInbox = true
            } catch (error) {
                console.error(`Error unarchiving thread ${thread.id} for Inbox display:`, {
                    threadId: thread.id,
                    error,
                })
            }
        }

        const postedValue = thread.posted
        const created = postedValue
            ? typeof postedValue === 'string'
                ? new Date(postedValue)
                : postedValue
            : new Date()

        const threadUrl =
            thread.url ??
            getFullCommsURL({
                workspaceId: thread.workspaceId,
                channelId: thread.channelId,
                threadId: thread.id,
            })

        const inboxNote = displayedInInbox
            ? '> Thread is in your Inbox (auto-unarchived after creation).'
            : '> Note: Threads you create do not appear in your own Inbox by default — only recipients see them there. Find the thread in the channel view or via its URL.'

        // Only 'channel' takes effect at thread creation. 'thread' (everyone who
        // has interacted) is discarded by the backend — a new thread has no
        // interactions yet — so it never becomes an applied audience here. Report
        // the applied audience, not the request, so machine consumers aren't told
        // an audience was notified when it wasn't.
        const appliedAudience = notifyAudience === 'channel' ? notifyAudience : undefined

        const audienceNote =
            notifyAudience === 'channel'
                ? 'Everyone in channel'
                : notifyAudience === 'thread'
                  ? 'Everyone who has interacted (no effect at thread creation)'
                  : undefined

        const lines: string[] = [
            `# Thread Created`,
            '',
            `**Title:** ${thread.title}`,
            `**Thread ID:** ${thread.id}`,
            `**Channel ID:** ${thread.channelId}`,
            `**Created:** ${created.toISOString()}`,
            `**URL:** ${threadUrl}`,
            ...(audienceNote ? [`**Notified:** ${audienceNote}`] : []),
            '',
            '## Content',
            '',
            thread.content,
            '',
            inboxNote,
        ]

        const structuredContent: CreateThreadOutput = {
            type: 'create_thread_result',
            success: true,
            threadId: thread.id,
            title: thread.title,
            channelId: thread.channelId,
            workspaceId: thread.workspaceId,
            content: thread.content,
            creator: thread.creator,
            created: created.toISOString(),
            threadUrl,
            ...(recipients ? { recipients } : {}),
            ...(groups ? { groups } : {}),
            ...(appliedAudience ? { notifyAudience: appliedAudience } : {}),
        }

        return getToolOutput({
            textContent: lines.join('\n'),
            structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof CreateThreadOutputSchema.shape>

export { createThread }
