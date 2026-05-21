import { getFullCommsURL } from '@doist/comms-sdk'

export function getWorkspaceUrl(workspaceId: number): string {
    return getFullCommsURL({ workspaceId })
}

export function getChannelUrl(workspaceId: number, channelId: number): string {
    return getFullCommsURL({ workspaceId, channelId })
}

export function getConversationUrl(workspaceId: number, conversationId: number): string {
    return getFullCommsURL({ workspaceId, conversationId })
}
