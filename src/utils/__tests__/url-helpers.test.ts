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
        it('returns prod URL when no baseUrl is configured', () => {
            expect(getFullCommsURL({ workspaceId: 1 })).toBe('https://comms.todoist.com/a/1/')
        })

        it('swaps the host when a staging baseUrl is configured', () => {
            configureBaseUrl('https://comms.staging.todoist.com')
            expect(getFullCommsURL({ workspaceId: 1 })).toBe(
                'https://comms.staging.todoist.com/a/1/',
            )
        })
    })

    describe('relative-URL helpers', () => {
        // The SDK's `getMessageURL`/`getCommentURL` return relative paths.
        // applyBaseUrl's regex only matches a leading prod host, so the
        // wrapped versions must be no-ops on relative paths regardless of
        // whether staging is configured. This catches "wrapper accidentally
        // prepends/mangles a host on relative URLs."
        const messageArgs = { workspaceId: 1, conversationId: 'c', messageId: 'm' }
        const commentArgs = { workspaceId: 1, channelId: 'ch', threadId: 't', commentId: 'cm' }
        const messageRelative = '/a/1/msg/c/m/m'
        const commentRelative = '/a/1/ch/ch/t/t/c/cm'

        it('pass relative paths through unchanged with no baseUrl', () => {
            expect(getMessageURL(messageArgs)).toBe(messageRelative)
            expect(getCommentURL(commentArgs)).toBe(commentRelative)
        })

        it('pass relative paths through unchanged with staging configured', () => {
            configureBaseUrl('https://comms.staging.todoist.com')
            expect(getMessageURL(messageArgs)).toBe(messageRelative)
            expect(getCommentURL(commentArgs)).toBe(commentRelative)
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
    })
})
