import type { Channel, CommsApi } from '@doist/comms-sdk'
import { z } from 'zod'
import { getToolOutput } from '../mcp-helpers.js'
import type { CommsTool } from '../comms-tool.js'
import { limitedAll } from '../utils/concurrency.js'
import { ListChannelsOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { getChannelUrl } from '../utils/url-helpers.js'

const ArgsSchema = {
    workspaceId: z.number().describe('The workspace ID to list channels from.'),
    includeArchived: z
        .boolean()
        .optional()
        .describe(
            'Whether to include archived channels. If true, both active and archived channels are returned. Defaults to false (active channels only).',
        ),
}

type ChannelData = {
    id: string
    name: string
    description?: string
    public: boolean
    archived: boolean
    creatorId: number
    creatorName?: string
    created: string
    channelUrl: string
    color?: number
}

type ListChannelsStructured = Record<string, unknown> & {
    type: 'list_channels'
    workspaceId: number
    channels: ChannelData[]
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

    // Look up creator names in parallel, tolerating individual failures so a
    // single deleted/inaccessible creator doesn't fail the whole list — the
    // fallback path (creator ID without a name) is exercised by the text output.
    // Bounded concurrency keeps the socket pool / rate limiter happy on big
    // workspaces; today's traffic is small but the ceiling matters when it isn't.
    const creatorLookup: Record<number, string> = {}
    if (creatorIds.size > 0) {
        const creatorIdArray = Array.from(creatorIds)
        const users = await limitedAll(creatorIdArray, (userId) =>
            client.workspaceUsers.getUserById({ workspaceId, userId }).catch(() => null),
        )
        for (let i = 0; i < creatorIdArray.length; i++) {
            const creatorId = creatorIdArray[i]
            const user = users[i]
            if (creatorId !== undefined && user) {
                creatorLookup[creatorId] = user.fullName
            }
        }
    }

    const lines: string[] = ['# Channels', '']
    lines.push(
        `Found ${channels.length} channel${channels.length === 1 ? '' : 's'} in workspace ${workspaceId}:`,
        '',
    )

    for (const channel of channels) {
        const creatorName = creatorLookup[channel.creator]
        const channelUrl = getChannelUrl(workspaceId, channel.id)

        lines.push(`## [${channel.name}](${channelUrl})`)
        lines.push(`**ID:** ${channel.id}`)
        lines.push(`**Public:** ${channel.public ? 'Yes' : 'No'}`)
        lines.push(`**Archived:** ${channel.archived ? 'Yes' : 'No'}`)
        lines.push(
            `**Creator:** ${creatorName ? `${creatorName} (${channel.creator})` : channel.creator}`,
        )
        lines.push(`**Created:** ${channel.created.toISOString()}`)

        if (channel.description) {
            lines.push(`**Description:** ${channel.description}`)
        }

        lines.push('')
    }

    const textContent = lines.join('\n')

    const structuredContent: ListChannelsStructured = {
        type: 'list_channels',
        workspaceId,
        channels: channels.map((channel) => ({
            id: channel.id,
            name: channel.name,
            ...(channel.description && { description: channel.description }),
            public: channel.public,
            archived: channel.archived,
            creatorId: channel.creator,
            ...(creatorLookup[channel.creator] && {
                creatorName: creatorLookup[channel.creator],
            }),
            created: channel.created.toISOString(),
            channelUrl: getChannelUrl(workspaceId, channel.id),
            ...(channel.color != null && { color: channel.color }),
        })),
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

        return getToolOutput({
            textContent: result.textContent,
            structuredContent: result.structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof ListChannelsOutputSchema.shape>

export { listChannels, type ListChannelsStructured }
