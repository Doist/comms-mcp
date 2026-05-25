import {
    getCommsURL as sdkGetCommsURL,
    getFullCommsURL as sdkGetFullCommsURL,
} from '@doist/comms-sdk'
import { getCommsURL, getFullCommsURL, resolveCommsUrl } from '../url-helpers.js'

describe('url-helpers', () => {
    const threadParams = { workspaceId: 1, channelId: 'ch', threadId: 't' }

    describe('getCommsURL', () => {
        it('returns an SDK relative path', () => {
            expect(getCommsURL(threadParams)).toBe(sdkGetCommsURL(threadParams))
        })
    })

    describe('getFullCommsURL', () => {
        it('returns the SDK default URL when no baseUrl is provided', () => {
            expect(getFullCommsURL(threadParams)).toBe(sdkGetFullCommsURL(threadParams))
        })

        it('passes the execution baseUrl to the SDK helper', () => {
            const baseUrl = 'https://comms.staging.todoist.com'
            expect(getFullCommsURL(threadParams, { baseUrl })).toBe(
                sdkGetFullCommsURL(threadParams, baseUrl),
            )
        })

        it('normalizes repeated trailing slashes in the execution baseUrl', () => {
            expect(
                getFullCommsURL(threadParams, {
                    baseUrl: 'https://comms.staging.todoist.com//',
                }),
            ).toBe(sdkGetFullCommsURL(threadParams, 'https://comms.staging.todoist.com'))
        })
    })

    describe('resolveCommsUrl', () => {
        it('prefers the SDK entity URL when present', () => {
            expect(
                resolveCommsUrl('https://comms.staging.todoist.com/a/1/ch/ch/t/t/', threadParams, {
                    baseUrl: 'https://ignored.example.com',
                }),
            ).toBe('https://comms.staging.todoist.com/a/1/ch/ch/t/t/')
        })

        it('uses the execution baseUrl when falling back to a synthesized URL', () => {
            const baseUrl = 'https://comms.staging.todoist.com'
            expect(resolveCommsUrl(undefined, threadParams, { baseUrl })).toBe(
                sdkGetFullCommsURL(threadParams, baseUrl),
            )
        })
    })
})
