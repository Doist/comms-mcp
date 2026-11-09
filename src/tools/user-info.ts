import type { CommsTool } from '../comms-tool.js'
import { UserInfoOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { buildUserInfoResult, type UserInfoStructured } from './user-output.js'

const ArgsSchema = {}

const userInfo = {
    name: ToolNames.USER_INFO,
    description:
        'Get information about the authenticated Comms user: user ID, full name, short name, email, timezone, language, and the status shown next to their name in Comms and Todoist.',
    parameters: ArgsSchema,
    outputSchema: UserInfoOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(_args, client) {
        const user = await client.users.getSessionUser()
        return buildUserInfoResult(user)
    },
} satisfies CommsTool<typeof ArgsSchema, typeof UserInfoOutputSchema.shape>

export { userInfo, type UserInfoStructured }
