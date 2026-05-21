import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { AWAY_ACTIONS, AwayOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'

// The Comms SDK does not expose an away-mode endpoint, and the Comms user
// payload does not carry away state. Every action throws with a clear
// unsupported-by-SDK error — returning `{ isAway: false }` would be a
// silent lie (the user may genuinely be away; we simply can't tell), and
// the LLM would happily reason on it. The tool is also unregistered from
// the MCP server; this symbol stays exported for importable-tools
// consumers so they get the same loud failure. Wire up real behavior
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

const UNSUPPORTED =
    'Away mode is not currently supported by the Comms SDK — no endpoint is exposed and the user payload does not carry away state. `get`, `set`, and `clear` all fail loudly so callers do not act on stale or invented data.'

const away = {
    name: ToolNames.AWAY,
    description:
        "Manage the current user's away status. NOTE: the Comms SDK does not currently expose an away-mode endpoint, so all actions throw an explicit unsupported error. The tool is intentionally not registered on the MCP server; this stub exists only for the importable-tools surface.",
    parameters: ArgsSchema,
    outputSchema: AwayOutputSchema.shape,
    annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
    },
    async execute(_args, _client) {
        throw new Error(UNSUPPORTED)
    },
} satisfies CommsTool<typeof ArgsSchema, typeof AwayOutputSchema.shape>

export { away, type AwayModeType }
