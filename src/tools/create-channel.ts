import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { type CreateChannelOutput, CreateChannelOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { getChannelUrl } from '../utils/url-helpers.js'

const ArgsSchema = {
    workspaceId: z.number().describe('The workspace ID where the channel should be created.'),
    name: z.string().min(1).describe('The channel name.'),
    description: z.string().optional().describe('Optional channel description.'),
    public: z
        .boolean()
        .optional()
        .describe('Whether the channel is public. Omit to use the Comms API default.'),
    userIds: z
        .array(z.number())
        .optional()
        .describe('Optional user IDs to add to the channel when it is created.'),
}

const createChannel = {
    name: ToolNames.CREATE_CHANNEL,
    description:
        'Create a channel in a workspace. Requires a workspace ID and channel name. Optionally set description, visibility, and initial user IDs.',
    parameters: ArgsSchema,
    outputSchema: CreateChannelOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async execute(args, client) {
        const { workspaceId, name, description, public: isPublic, userIds } = args

        const channel = await client.channels.createChannel({
            workspaceId,
            name,
            ...(description !== undefined ? { description } : {}),
            ...(isPublic !== undefined ? { public: isPublic } : {}),
            ...(userIds !== undefined ? { userIds } : {}),
        })

        const channelUrl = channel.url ?? getChannelUrl(channel.workspaceId, channel.id)
        const created = channel.created.toISOString()

        const lines = [
            '# Channel Created',
            '',
            `**Name:** ${channel.name}`,
            `**Channel ID:** ${channel.id}`,
            `**Workspace ID:** ${channel.workspaceId}`,
            `**Public:** ${channel.public ? 'Yes' : 'No'}`,
            `**Created:** ${created}`,
            `**URL:** ${channelUrl}`,
        ]

        if (channel.description) {
            lines.push(`**Description:** ${channel.description}`)
        }

        const structuredContent: CreateChannelOutput = {
            type: 'create_channel_result',
            success: true,
            channelId: channel.id,
            name: channel.name,
            workspaceId: channel.workspaceId,
            public: channel.public,
            archived: channel.archived,
            creator: channel.creator,
            created,
            channelUrl,
            ...(channel.description != null ? { description: channel.description } : {}),
            ...(channel.userIds != null ? { userIds: channel.userIds } : {}),
        }

        return getToolOutput({
            textContent: lines.join('\n'),
            structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof CreateChannelOutputSchema.shape>

export { createChannel }
