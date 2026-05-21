import { getFullCommsURL } from '@doist/comms-sdk'

export function getWorkspaceUrl(workspaceId: number): string {
    return getFullCommsURL({ workspaceId })
}

export function getChannelUrl(workspaceId: number, channelId: string): string {
    return getFullCommsURL({ workspaceId, channelId })
}

export function getConversationUrl(workspaceId: number, conversationId: string): string {
    return getFullCommsURL({ workspaceId, conversationId })
}
