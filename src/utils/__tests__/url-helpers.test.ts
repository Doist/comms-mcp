import {
    getCommentURL as sdkGetCommentURL,
    getFullCommsURL as sdkGetFullCommsURL,
    getMessageURL as sdkGetMessageURL,
} from '@doist/comms-sdk'
import {
    configureBaseUrl,
    getCommentURL,
    getFullCommsURL,
    getMessageURL,
    rewriteToConfiguredHost,
    toRelativeCommsURL,
} from '../url-helpers.js'

describe('url-helpers', () => {
    afterEach(() => {
        configureBaseUrl(undefined)
    })

    describe('getFullCommsURL', () => {
        it('matches the SDK output when no baseUrl is configured', () => {
            // Wrapper must be a no-op so the prod default behavior is
            // exactly the SDK's. Compare against the SDK to avoid pinning
            // a specific URL format here.
            expect(getFullCommsURL({ workspaceId: 1 })).toBe(sdkGetFullCommsURL({ workspaceId: 1 }))
        })

        it('swaps the prod host for the configured host on a full URL', () => {
            configureBaseUrl('https://comms.staging.todoist.com')
            const sdkUrl = sdkGetFullCommsURL({ workspaceId: 1 })
            // Sanity: the SDK still hardcodes the prod host — that's the
            // load-bearing assumption of the rewrite layer. If this ever
            // fails the wrapper needs revisiting.
            expect(sdkUrl).toMatch(/^https:\/\/comms\.todoist\.com\//)
            expect(getFullCommsURL({ workspaceId: 1 })).toBe(
                sdkUrl.replace('https://comms.todoist.com', 'https://comms.staging.todoist.com'),
            )
        })
    })

    describe('relative-URL helpers', () => {
        // The SDK's `getMessageURL`/`getCommentURL` return relative paths.
        // applyBaseUrl's regex only matches a leading prod host, so the
        // wrapped versions must be no-ops on relative paths regardless of
        // whether staging is configured. Compare against the SDK output
        // directly so this stays correct if the SDK changes its URL
        // format — the wrapper is what's under test, not the format.
        const messageArgs = { workspaceId: 1, conversationId: 'c', messageId: 'm' }
        const commentArgs = { workspaceId: 1, channelId: 'ch', threadId: 't', commentId: 'cm' }

        it('pass relative paths through unchanged with no baseUrl', () => {
            expect(getMessageURL(messageArgs)).toBe(sdkGetMessageURL(messageArgs))
            expect(getCommentURL(commentArgs)).toBe(sdkGetCommentURL(commentArgs))
        })

        it('pass relative paths through unchanged with staging configured', () => {
            configureBaseUrl('https://comms.staging.todoist.com')
            expect(getMessageURL(messageArgs)).toBe(sdkGetMessageURL(messageArgs))
            expect(getCommentURL(commentArgs)).toBe(sdkGetCommentURL(commentArgs))
        })
    })

    describe('toRelativeCommsURL', () => {
        it('strips the prod host', () => {
            expect(toRelativeCommsURL('https://comms.todoist.com/a/1/')).toBe('/a/1/')
        })

        // The previous build-link implementation hardcoded the prod host in
        // a `.replace(...)` call, which silently failed on staging. The
        // regex must strip any host so a future contributor can't reintroduce
        // the hardcoded-host pattern without breaking this test.
        it('strips a staging or custom host', () => {
            expect(toRelativeCommsURL('https://comms.staging.todoist.com/a/1/')).toBe('/a/1/')
        })
    })

    describe('rewriteToConfiguredHost', () => {
        it('rewrites the prod host of an SDK-supplied URL when staging is configured', () => {
            configureBaseUrl('https://comms.staging.todoist.com')
            expect(rewriteToConfiguredHost('https://comms.todoist.com/a/1/ch/x/t/y/')).toBe(
                'https://comms.staging.todoist.com/a/1/ch/x/t/y/',
            )
        })

        it('is idempotent on an already-staging URL', () => {
            configureBaseUrl('https://comms.staging.todoist.com')
            const staging = 'https://comms.staging.todoist.com/a/1/'
            expect(rewriteToConfiguredHost(staging)).toBe(staging)
        })

        it('passes through unchanged when no baseUrl is configured', () => {
            expect(rewriteToConfiguredHost('https://comms.todoist.com/a/1/')).toBe(
                'https://comms.todoist.com/a/1/',
            )
        })

        // The regex anchors with `(?=[/:?#]|$)` so an attacker-controlled
        // suffix on the host can't sneak through the rewrite.
        it('does not match a host with a malicious suffix', () => {
            configureBaseUrl('https://comms.staging.todoist.com')
            expect(rewriteToConfiguredHost('https://comms.todoist.com.evil.com/path')).toBe(
                'https://comms.todoist.com.evil.com/path',
            )
            expect(rewriteToConfiguredHost('https://comms.todoist.comEXTRA/x')).toBe(
                'https://comms.todoist.comEXTRA/x',
            )
        })

        // Case-insensitive so an SDK upgrade emitting `Https://...` or
        // `Comms.Todoist.Com` doesn't silently bypass the rewrite.
        it('matches case-insensitively', () => {
            configureBaseUrl('https://comms.staging.todoist.com')
            expect(rewriteToConfiguredHost('HTTPS://Comms.Todoist.Com/a/1/')).toBe(
                'https://comms.staging.todoist.com/a/1/',
            )
        })

        // `$&` in `configuredBaseUrl` must not be interpreted as a
        // backreference — use a function replacement.
        it('treats $-tokens in the configured base URL as literal', () => {
            configureBaseUrl('https://staging.example.com/$&')
            expect(rewriteToConfiguredHost('https://comms.todoist.com/a/1/')).toBe(
                'https://staging.example.com/$&/a/1/',
            )
        })

        // Trailing slash in COMMS_BASE_URL must not double up.
        it('strips a trailing slash from the configured base URL', () => {
            configureBaseUrl('https://comms.staging.todoist.com/')
            expect(rewriteToConfiguredHost('https://comms.todoist.com/a/1/')).toBe(
                'https://comms.staging.todoist.com/a/1/',
            )
        })
    })
})
