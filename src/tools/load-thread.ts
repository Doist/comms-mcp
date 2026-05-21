import { getFullCommsURL } from '@doist/comms-sdk'
import { z } from 'zod'
import { getToolOutput } from '../mcp-helpers.js'
import type { CommsTool } from '../comms-tool.js'
import { LoadThreadOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {
    threadId: z.string().describe('The thread ID to load.'),
    newerThanDate: z
        .string()
        .optional()
        .describe('Get comments newer than this date (YYYY-MM-DD format).'),
    olderThanDate: z
        .string()
        .optional()
        .describe('Get comments older than this date (YYYY-MM-DD format).'),
    limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(50)
        .describe('Maximum number of comments to return.'),
    includeParticipants: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include participant user IDs in the response.'),
}

type LoadThreadStructured = {
    type: 'thread_data'
    thread: {
        id: string
        title: string
        content: string
        channelId: string
        channelName?: string
        workspaceId: number
        creator: number
        creatorName?: string
        posted: string
        commentCount: number
        isArchived: boolean
        inInbox: boolean
        participants?: number[]
        participantNames?: string[]
        threadUrl: string
    }
    comments: Array<{
        id: string
        content: string
        creator: number
        creatorName?: string
        threadId: string
        posted: string
        commentUrl: string
    }>
    totalComments: number
}

const loadThread = {
    name: ToolNames.LOAD_THREAD,
    description:
        'Load a thread with its metadata and comments. Supports filtering by timestamp and pagination.',
    parameters: ArgsSchema,
    outputSchema: LoadThreadOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(args, client) {
        const { threadId, newerThanDate, olderThanDate, limit, includeParticipants } = args

        // Fetch thread metadata and comments in parallel
        const [thread, comments] = await Promise.all([
            client.threads.getThread(threadId),
            client.comments.getComments({
                threadId,
                newerThan: newerThanDate ? new Date(newerThanDate) : undefined,
                olderThan: olderThanDate ? new Date(olderThanDate) : undefined,
                limit,
            }),
        ])

        // Collect all unique user IDs
        const userIds = new Set<number>([thread.creator])
        for (const comment of comments) {
            userIds.add(comment.creator)
        }
        if (includeParticipants && thread.participants) {
            for (const participantId of thread.participants) {
                userIds.add(participantId)
            }
        }

        // Fetch channel and all user info in parallel
        const uniqueUserIds = Array.from(userIds)
        const [channel, ...users] = await Promise.all([
            client.channels.getChannel(thread.channelId),
            ...uniqueUserIds.map((id) =>
                client.workspaceUsers.getUserById({ workspaceId: thread.workspaceId, userId: id }),
            ),
        ])

        const userLookup = users.reduce<Record<number, string>>((acc, user) => {
            acc[user.id] = user.fullName
            return acc
        }, {})

        // Build text content
        const creatorName = userLookup[thread.creator]
        const lines: string[] = [
            `# Thread: ${thread.title}`,
            '',
            `**Thread ID:** ${thread.id}`,
            `**Channel:** ${channel.name}`,
            `**Workspace ID:** ${thread.workspaceId}`,
            `**Creator:** ${creatorName} (${thread.creator})`,
            `**Posted:** ${thread.posted.toISOString()}`,
            `**Comments:** ${thread.commentCount}`,
            `**Archived:** ${thread.isArchived ? 'Yes' : 'No'}`,
            `**In Inbox:** ${thread.inInbox ? 'Yes' : 'No'}`,
            '',
            '## Content',
            '',
            thread.content,
            '',
            `## Comments (${comments.length})`,
            '',
        ]

        for (const comment of comments) {
            const commentDate = comment.posted.toISOString()
            const commentCreatorName = userLookup[comment.creator]
            lines.push(`### Comment ${comment.id}`)
            lines.push(
                `**Creator:** ${commentCreatorName} (${comment.creator}) | **Posted:** ${commentDate}`,
            )
            lines.push('')
            lines.push(comment.content)
            lines.push('')
        }

        if (includeParticipants && thread.participants) {
            lines.push('## Participants')
            lines.push('')
            const participantList = thread.participants
                .map((id) => `${userLookup[id]} (${id})`)
                .join(', ')
            lines.push(participantList)
        }

        const structuredContent: LoadThreadStructured = {
            type: 'thread_data',
            thread: {
                id: thread.id,
                title: thread.title,
                content: thread.content,
                channelId: thread.channelId,
                channelName: channel.name,
                workspaceId: thread.workspaceId,
                creator: thread.creator,
                creatorName,
                posted: thread.posted.toISOString(),
                commentCount: thread.commentCount,
                isArchived: thread.isArchived,
                inInbox: thread.inInbox ?? false,
                participants: includeParticipants ? (thread.participants ?? undefined) : undefined,
                participantNames:
                    includeParticipants && thread.participants
                        ? thread.participants
                              .map((id) => userLookup[id])
                              .filter((name): name is string => name !== undefined)
                        : undefined,
                threadUrl:
                    thread.url ??
                    getFullCommsURL({
                        workspaceId: thread.workspaceId,
                        channelId: thread.channelId,
                        threadId: thread.id,
                    }),
            },
            comments: comments.map((c) => ({
                id: c.id,
                content: c.content,
                creator: c.creator,
                creatorName: userLookup[c.creator],
                threadId: c.threadId,
                posted: c.posted.toISOString(),
                commentUrl:
                    c.url ??
                    getFullCommsURL({
                        workspaceId: c.workspaceId,
                        channelId: c.channelId,
                        threadId: c.threadId,
                        commentId: c.id,
                    }),
            })),
            totalComments: thread.commentCount,
        }

        return getToolOutput({
            textContent: lines.join('\n'),
            structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof LoadThreadOutputSchema.shape>

export { loadThread, type LoadThreadStructured }
