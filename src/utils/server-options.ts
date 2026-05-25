// Kept separate from main.ts so the env wiring is unit-testable —
// importing main.ts triggers server startup at module load.
import { normalizeBaseUrl } from './url-helpers.js'

export type ServerOptions = {
    commsApiKey: string
    // Optional so external callers (`getMcpServer({ commsApiKey })`)
    // don't have to spell out `baseUrl: undefined`.
    baseUrl?: string
}

export function buildServerOptions(env: NodeJS.ProcessEnv = process.env): ServerOptions {
    const commsApiKey = env.COMMS_API_KEY
    if (!commsApiKey) {
        throw new Error('COMMS_API_KEY is not set')
    }
    // Trim before the falsy check so `COMMS_BASE_URL= ` (trailing
    // space, common in env files) doesn't pass garbage to the SDK.
    const baseUrl = normalizeBaseUrl(env.COMMS_BASE_URL)
    return { commsApiKey, baseUrl }
}
