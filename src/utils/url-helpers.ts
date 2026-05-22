import {
    getCommentURL as sdkGetCommentURL,
    getFullCommsURL as sdkGetFullCommsURL,
    getMessageURL as sdkGetMessageURL,
} from '@doist/comms-sdk'

// Module-level state set by main.ts at startup. The SDK's URL helpers
// hardcode the prod host, so without a wrapper a staging-targeted MCP
// would still return prod links in its tool output.
let configuredBaseUrl: string | undefined

export function configureBaseUrl(baseUrl: string | undefined): void {
    configuredBaseUrl = baseUrl
}

function applyBaseUrl(url: string): string {
    if (!configuredBaseUrl) return url
    return url.replace(/^https:\/\/comms\.todoist\.com/, configuredBaseUrl)
}

// Strip whatever host the SDK produced — robust to staging/custom hosts.
export function toRelativeCommsURL(url: string): string {
    return url.replace(/^https?:\/\/[^/]+/, '')
}

// Rewrite SDK-populated url fields (entity.url, etc.) to the configured
// host. The SDK entity schemas hardcode prod, so a staging-targeted
// server would otherwise return prod links in its structured output.
// Idempotent: re-applying on an already-staging URL is a no-op.
export const rewriteToConfiguredHost = applyBaseUrl

export const getFullCommsURL: typeof sdkGetFullCommsURL = (...args) =>
    applyBaseUrl(sdkGetFullCommsURL(...args))

export const getCommentURL: typeof sdkGetCommentURL = (...args) =>
    applyBaseUrl(sdkGetCommentURL(...args))

export const getMessageURL: typeof sdkGetMessageURL = (...args) =>
    applyBaseUrl(sdkGetMessageURL(...args))

export function getWorkspaceUrl(workspaceId: number): string {
    return getFullCommsURL({ workspaceId })
}

export function getChannelUrl(workspaceId: number, channelId: string): string {
    return getFullCommsURL({ workspaceId, channelId })
}

export function getConversationUrl(workspaceId: number, conversationId: string): string {
    return getFullCommsURL({ workspaceId, conversationId })
}
