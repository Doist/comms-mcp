import type { Channel } from '@doist/comms-sdk'
import type { ChannelOutputFields } from '../utils/output-schemas.js'
import { getChannelUrl } from '../utils/url-helpers.js'

type ChannelListData = ChannelOutputFields & {
    id: string
    creatorId: number
    creatorName?: string
    color?: number
}

type ChannelMutationData = ChannelOutputFields & {
    channelId: string
    workspaceId: number
    creator: number
    userIds?: number[]
}

function getChannelOutputFields(channel: Channel): ChannelOutputFields {
    return {
        name: channel.name,
        ...(channel.description != null ? { description: channel.description } : {}),
        public: channel.public,
        archived: channel.archived,
        created: channel.created.toISOString(),
        channelUrl: channel.url ?? getChannelUrl(channel.workspaceId, channel.id),
    }
}

function getChannelMutationData(channel: Channel): ChannelMutationData {
    return {
        channelId: channel.id,
        workspaceId: channel.workspaceId,
        creator: channel.creator,
        ...getChannelOutputFields(channel),
        ...(channel.userIds != null ? { userIds: channel.userIds } : {}),
    }
}

function getChannelMutationText(title: string, channel: Channel): string {
    const channelData = getChannelMutationData(channel)
    const lines = [
        `# ${title}`,
        '',
        `**Name:** ${channelData.name}`,
        `**Channel ID:** ${channelData.channelId}`,
        `**Workspace ID:** ${channelData.workspaceId}`,
        `**Public:** ${channelData.public ? 'Yes' : 'No'}`,
        `**Created:** ${channelData.created}`,
        `**URL:** ${channelData.channelUrl}`,
    ]

    if (channelData.description != null) {
        lines.push(`**Description:** ${channelData.description}`)
    }

    return lines.join('\n')
}

function getChannelListData(channel: Channel, creatorName?: string): ChannelListData {
    return {
        id: channel.id,
        ...getChannelOutputFields(channel),
        creatorId: channel.creator,
        ...(creatorName ? { creatorName } : {}),
        ...(channel.color != null ? { color: channel.color } : {}),
    }
}

export {
    getChannelListData,
    getChannelMutationData,
    getChannelMutationText,
    getChannelOutputFields,
    type ChannelListData,
}
