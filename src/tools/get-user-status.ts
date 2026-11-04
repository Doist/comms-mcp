import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { UserStatusOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { buildUserStatusResult } from '../utils/user-status.js'

const ArgsSchema = {}

const getUserStatus = {
    name: ToolNames.GET_USER_STATUS,
    description:
        "Get the authenticated user's status, shown next to their name in Comms and Todoist: message, emoji, when it ends, and whether notifications or Karma are paused.",
    parameters: ArgsSchema,
    outputSchema: UserStatusOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(_args, client) {
        const user = await client.users.getSessionUser()
        return getToolOutput(buildUserStatusResult(user.status, 'Status'))
    },
} satisfies CommsTool<typeof ArgsSchema, typeof UserStatusOutputSchema.shape>

export { getUserStatus }
