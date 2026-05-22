import {
    getCommentURL as sdkGetCommentURL,
    getFullCommsURL as sdkGetFullCommsURL,
    getMessageURL as sdkGetMessageURL,
} from '@doist/comms-sdk'

// Module-level state set by `getMcpServer` (and scripts/run-tool.ts)
// at startup. The SDK's URL helpers hardcode the prod host, so without
// a wrapper a staging-targeted MCP would still return prod links in
// its tool output.
//
// **Process-scoped, last-call wins** — not multi-tenant safe. Library
// consumers using importable tools standalone must call this
// themselves; otherwise the helpers default to prod.
let configuredBaseUrl: string | undefined

export function configureBaseUrl(baseUrl: string | undefined): void {
    // Normalize trailing slash so `https://staging/` doesn't produce
    // double-slashed URLs like `https://staging//a/1/`.
    configuredBaseUrl = baseUrl ? baseUrl.replace(/\/+$/, '') : undefined
}

// Match the SDK's prod host (case-insensitive, with a trailing
// boundary so `comms.todoist.com.evil.com` does NOT match — prevents
// host-injection if a url field is ever attacker-influenced).
const PROD_HOST_RE = /^https:\/\/comms\.todoist\.com(?=[/:?#]|$)/i

function applyBaseUrl(url: string): string {
    if (!configuredBaseUrl) return url
    // Use a function replacement so `$` in `configuredBaseUrl` isn't
    // interpreted as a backreference token.
    return url.replace(PROD_HOST_RE, () => configuredBaseUrl as string)
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
