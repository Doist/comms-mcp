import type { Channel, CommsApi } from '@todoist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { resolveUsersWithLog } from '../utils/degrade.js'
import { ListChannelsOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { getChannelListData, type ChannelListData } from './channel-output.js'

const ArgsSchema = {
    workspaceId: z.number().describe('The workspace ID to list channels from.'),
    includeArchived: z
        .boolean()
        .optional()
        .describe(
            'Whether to include archived channels. If true, both active and archived channels are returned. Defaults to false (active channels only).',
        ),
}

type ListChannelsStructured = Record<string, unknown> & {
    type: 'list_channels'
    workspaceId: number
    channels: ChannelListData[]
    totalChannels: number
}

async function generateChannelsList(
    client: CommsApi,
    workspaceId: number,
    includeArchived: boolean,
): Promise<{ textContent: string; structuredContent: ListChannelsStructured }> {
    // By default only fetch active channels; optionally include archived ones too
    let channels: Channel[]
    if (includeArchived) {
        const [active, archived] = await Promise.all([
            client.channels.getChannels({ workspaceId }),
            client.channels.getChannels({ workspaceId, archived: true }),
        ])
        channels = [...active, ...archived]
    } else {
        channels = await client.channels.getChannels({ workspaceId })
    }

    if (channels.length === 0) {
        return {
            textContent: '# Channels\n\nNo channels found.',
            structuredContent: {
                type: 'list_channels',
                workspaceId,
                channels: [],
                totalChannels: 0,
            },
        }
    }

    // Collect unique creator IDs and fetch their names
    const creatorIds = new Set<number>()
    for (const channel of channels) {
        creatorIds.add(channel.creator)
    }

    // A deleted/inaccessible creator doesn't fail the whole list — the fallback
    // path (creator ID without a name) is exercised by the text output.
    const users = await resolveUsersWithLog(
        client,
        ToolNames.LIST_CHANNELS,
        'failed to resolve channel creator',
        workspaceId,
        Array.from(creatorIds),
    )
    const creatorLookup: Record<number, string> = {}
    for (const [id, user] of users) {
        creatorLookup[id] = user.fullName
    }

    const lines: string[] = ['# Channels', '']
    lines.push(
        `Found ${channels.length} channel${channels.length === 1 ? '' : 's'} in workspace ${workspaceId}:`,
        '',
    )

    for (const channel of channels) {
        const creatorName = creatorLookup[channel.creator]
        const channelData = getChannelListData(channel, creatorName)

        lines.push(`## [${channelData.name}](${channelData.channelUrl})`)
        lines.push(`**ID:** ${channel.id}`)
        lines.push(`**Public:** ${channelData.public ? 'Yes' : 'No'}`)
        lines.push(`**Archived:** ${channelData.archived ? 'Yes' : 'No'}`)
        lines.push(
            `**Creator:** ${creatorName ? `${creatorName} (${channel.creator})` : channel.creator}`,
        )
        lines.push(`**Created:** ${channelData.created}`)

        if (channelData.description != null) {
            lines.push(`**Description:** ${channelData.description}`)
        }

        lines.push('')
    }

    const textContent = lines.join('\n')

    const structuredContent: ListChannelsStructured = {
        type: 'list_channels',
        workspaceId,
        channels: channels.map((channel) =>
            getChannelListData(channel, creatorLookup[channel.creator]),
        ),
        totalChannels: channels.length,
    }

    return { textContent, structuredContent }
}

const listChannels = {
    name: ToolNames.LIST_CHANNELS,
    description:
        'List channels in a workspace. By default returns only active channels; set includeArchived to true to also include archived channels. Returns channel IDs, names, descriptions, visibility (public/private), archive status, creators, creation dates, URLs, and colors.',
    parameters: ArgsSchema,
    outputSchema: ListChannelsOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(args, client) {
        const { workspaceId, includeArchived = false } = args
        const result = await generateChannelsList(client, workspaceId, includeArchived)

        return {
            textContent: result.textContent,
            structuredContent: result.structuredContent,
        }
    },
} satisfies CommsTool<typeof ArgsSchema, typeof ListChannelsOutputSchema.shape>

export { listChannels, type ListChannelsStructured }
