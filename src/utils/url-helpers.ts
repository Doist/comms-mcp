import {
    getCommsURL,
    getFullCommsURL as sdkGetFullCommsURL,
    type CommsURLParams,
} from '@doist/comms-sdk'
import type { CommsToolContext } from '../comms-tool.js'

type UrlContext = Pick<CommsToolContext, 'baseUrl'> | undefined

export { getCommsURL }

export function normalizeBaseUrl(baseUrl: string | undefined): string | undefined {
    return baseUrl?.trim().replace(/\/+$/, '') || undefined
}

export function getFullCommsURL(params: CommsURLParams, context?: UrlContext): string {
    return sdkGetFullCommsURL(params, normalizeBaseUrl(context?.baseUrl))
}

export function resolveCommsUrl(
    entityUrl: string | undefined,
    params: CommsURLParams,
    context?: UrlContext,
): string {
    return entityUrl ?? getFullCommsURL(params, context)
}

export function getWorkspaceUrl(workspaceId: number, context?: UrlContext): string {
    return getFullCommsURL({ workspaceId }, context)
}

export function getChannelUrl(
    workspaceId: number,
    channelId: string,
    context?: UrlContext,
): string {
    return getFullCommsURL({ workspaceId, channelId }, context)
}

export function getConversationUrl(
    workspaceId: number,
    conversationId: string,
    context?: UrlContext,
): string {
    return getFullCommsURL({ workspaceId, conversationId }, context)
}
