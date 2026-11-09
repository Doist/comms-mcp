import type { User } from '@doist/comms-sdk'
import type { CommsTool } from '../comms-tool.js'
import { UserInfoOutputSchema, type UserInfoOutput } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { describeStatus, toStatusOutput } from '../utils/user-status.js'

const ArgsSchema = {}

type UserInfoStructured = Record<string, unknown> & UserInfoOutput

/** The user-info result for a user, shared with update-user-info so both report the same way. */
function buildUserInfoResult(user: User): {
    textContent: string
    structuredContent: UserInfoStructured
} {
    const status = user.status ? toStatusOutput(user.status) : undefined

    const lines: string[] = [
        '# User Information',
        '',
        `**User ID:** ${user.id}`,
        `**Name:** ${user.fullName}`,
        `**Short Name:** ${user.shortName}`,
        `**Email:** ${user.email}`,
        `**Timezone:** ${user.timezone}`,
        `**Language:** ${user.lang}`,
        ...describeStatus(status),
    ]

    const structuredContent: UserInfoStructured = {
        type: 'user_info',
        userId: user.id,
        name: user.fullName,
        shortName: user.shortName,
        email: user.email,
        timezone: user.timezone,
        lang: user.lang,
        ...(status ? { status } : {}),
    }

    return { textContent: lines.join('\n'), structuredContent }
}

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

export { buildUserInfoResult, userInfo, type UserInfoStructured }
