import { z } from 'zod'
import { getToolOutput } from '../mcp-helpers.js'
import type { CommsTool } from '../comms-tool.js'
import { AWAY_ACTIONS, type AwayOutput, AwayOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'

// The Comms SDK does not expose an away-mode endpoint, and the Comms user
// payload does not carry away state. `get` therefore honestly reports
// `isAway: false`, while `set` and `clear` reject so the LLM doesn't
// silently succeed and mislead the user. Wire up the real implementation
// when an away endpoint lands.

const AWAY_MODE_TYPES = ['vacation', 'parental', 'sickleave', 'other'] as const
type AwayModeType = (typeof AWAY_MODE_TYPES)[number]

const ArgsSchema = {
    action: z.enum(AWAY_ACTIONS).describe('The action to perform.'),
    type: z
        .enum(AWAY_MODE_TYPES)
        .optional()
        .describe('The away mode type. Required when action is "set".'),
    from: z
        .string()
        .optional()
        .describe('Start date (YYYY-MM-DD). Only used when action is "set". Defaults to today.'),
    until: z.string().optional().describe('End date (YYYY-MM-DD). Required when action is "set".'),
}

const NOT_AWAY_MESSAGE =
    '# Away Status\n\n**Status:** Not away\n\n_Away mode is not currently exposed by the Comms SDK; this tool only reports the absence of away state._'

const UNSUPPORTED_MUTATION =
    'Away mode is not currently supported by the Comms SDK — `set` and `clear` are unavailable. Reading via `get` will report the user as not away.'

function getNotAwayOutput(): {
    textContent: string
    structuredContent: AwayOutput
} {
    return {
        textContent: NOT_AWAY_MESSAGE,
        structuredContent: {
            type: 'away_status',
            action: 'get',
            isAway: false,
            awayMode: undefined,
        },
    }
}

const away = {
    name: ToolNames.AWAY,
    description:
        "Manage the current user's away status. NOTE: the Comms SDK does not currently expose an away-mode endpoint, so only `action: \"get\"` is supported (and it always reports the user as not away). `set` and `clear` will fail with a clear error.",
    parameters: ArgsSchema,
    outputSchema: AwayOutputSchema.shape,
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
    },
    async execute(args, _client) {
        if (args.action === 'set' || args.action === 'clear') {
            throw new Error(UNSUPPORTED_MUTATION)
        }

        return getToolOutput(getNotAwayOutput())
    },
} satisfies CommsTool<typeof ArgsSchema, typeof AwayOutputSchema.shape>

export { away, type AwayModeType }
