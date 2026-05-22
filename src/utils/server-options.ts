// Kept separate from main.ts so the env wiring is unit-testable —
// importing main.ts triggers server startup at module load.

export type ServerOptions = {
    commsApiKey: string
    baseUrl: string | undefined
}

export function buildServerOptions(env: NodeJS.ProcessEnv = process.env): ServerOptions {
    const commsApiKey = env.COMMS_API_KEY
    if (!commsApiKey) {
        throw new Error('COMMS_API_KEY is not set')
    }
    // Empty string would override the SDK's prod default with garbage;
    // treat `COMMS_BASE_URL=` the same as unset.
    const baseUrl = env.COMMS_BASE_URL || undefined
    return { commsApiKey, baseUrl }
}
