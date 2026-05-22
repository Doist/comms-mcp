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

        it('reverts to prod when baseUrl is cleared', () => {
            configureBaseUrl('https://comms.staging.todoist.com')
            configureBaseUrl(undefined)
            expect(getFullCommsURL({ workspaceId: 1 })).toBe('https://comms.todoist.com/a/1/')
        })
    })

    describe('toRelativeCommsURL', () => {
        it('strips the prod host', () => {
            expect(toRelativeCommsURL('https://comms.todoist.com/a/1/')).toBe('/a/1/')
        })

        it('strips a staging or custom host', () => {
            expect(toRelativeCommsURL('https://comms.staging.todoist.com/a/1/')).toBe('/a/1/')
        })
    })

    describe('getMessageURL', () => {
        it('returns a relative path by default', () => {
            const url = getMessageURL({
                workspaceId: 1,
                conversationId: 'c',
                messageId: 'm',
            })
            expect(url).toBe('/a/1/msg/c/m/m')
        })

        it('rewrites the host when staging is configured', () => {
            configureBaseUrl('https://comms.staging.todoist.com')
            const url = getMessageURL({
                workspaceId: 1,
                conversationId: 'c',
                messageId: 'm',
            })
            // getMessageURL returns a relative path, so applyBaseUrl is a no-op;
            // this asserts the wrapper doesn't accidentally mangle it.
            expect(url).toBe('/a/1/msg/c/m/m')
        })
    })

    describe('getCommentURL', () => {
        it('returns a relative path by default', () => {
            const url = getCommentURL({
                workspaceId: 1,
                channelId: 'ch',
                threadId: 't',
                commentId: 'cm',
            })
            expect(url).toBe('/a/1/ch/ch/t/t/c/cm')
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
