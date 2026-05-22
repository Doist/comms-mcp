import { buildServerOptions } from '../server-options.js'

describe('buildServerOptions', () => {
    it('returns commsApiKey with undefined baseUrl when COMMS_BASE_URL is unset', () => {
        expect(buildServerOptions({ COMMS_API_KEY: 'k' })).toEqual({
            commsApiKey: 'k',
            baseUrl: undefined,
        })
    })

    it('passes through COMMS_BASE_URL when set', () => {
        expect(
            buildServerOptions({
                COMMS_API_KEY: 'k',
                COMMS_BASE_URL: 'https://comms.staging.todoist.com',
            }),
        ).toEqual({
            commsApiKey: 'k',
            baseUrl: 'https://comms.staging.todoist.com',
        })
    })

    it('treats empty COMMS_BASE_URL as undefined so the SDK default wins', () => {
        expect(buildServerOptions({ COMMS_API_KEY: 'k', COMMS_BASE_URL: '' })).toEqual({
            commsApiKey: 'k',
            baseUrl: undefined,
        })
    })

    it('throws when COMMS_API_KEY is missing', () => {
        expect(() => buildServerOptions({})).toThrow('COMMS_API_KEY is not set')
    })
})
