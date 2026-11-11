import type { User } from '@todoist/comms-sdk'
import type { UserInfoOutput } from '../utils/output-schemas.js'
import { describeStatus, toStatusOutput } from '../utils/user-status.js'

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

export { buildUserInfoResult, type UserInfoStructured }
