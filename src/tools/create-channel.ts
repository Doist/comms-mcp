import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { type CreateChannelOutput, CreateChannelOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { getChannelMutationData, getChannelMutationText } from './channel-output.js'

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

        const structuredContent: CreateChannelOutput = {
            type: 'create_channel_result',
            success: true,
            ...getChannelMutationData(channel),
        }

        return getToolOutput({
            textContent: getChannelMutationText('Channel Created', channel),
            structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof CreateChannelOutputSchema.shape>

export { createChannel }
