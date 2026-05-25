import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { type UpdateChannelOutput, UpdateChannelOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { getChannelMutationData, getChannelMutationText } from './channel-output.js'

type PartialUpdateChannelArgs = {
    id: string
    name?: string
    description?: string | null
    public?: boolean
}

const ArgsSchema = {
    channelId: z.string().describe('The channel ID to update.'),
    name: z.string().min(1).optional().describe('Optional new channel name.'),
    description: z
        .string()
        .nullable()
        .optional()
        .describe('Optional new channel description. Pass null to clear the description.'),
    public: z.boolean().optional().describe('Optional visibility update for the channel.'),
}

const updateChannel = {
    name: ToolNames.UPDATE_CHANNEL,
    description:
        'Update a workspace channel. Pass channelId and at least one of name, description, or public. Pass description: null to clear the description.',
    parameters: ArgsSchema,
    outputSchema: UpdateChannelOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async execute(args, client) {
        const { channelId, name, description, public: isPublic } = args

        if (name === undefined && description === undefined && isPublic === undefined) {
            throw new Error('At least one of `name`, `description`, or `public` must be provided.')
        }

        const updateArgs: PartialUpdateChannelArgs = {
            id: channelId,
            ...(name !== undefined ? { name } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(isPublic !== undefined ? { public: isPublic } : {}),
        }

        // The endpoint supports partial updates, but the SDK type currently requires `name`.
        const channel = await client.channels.updateChannel(
            updateArgs as Parameters<typeof client.channels.updateChannel>[0],
        )

        const structuredContent: UpdateChannelOutput = {
            type: 'update_channel_result',
            success: true,
            ...getChannelMutationData(channel),
        }

        return getToolOutput({
            textContent: getChannelMutationText('Channel Updated', channel),
            structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof UpdateChannelOutputSchema.shape>

export { updateChannel }
