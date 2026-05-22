import type { CommsApi } from '@doist/comms-sdk'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { UserInfoOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {}

type UserInfoStructured = Record<string, unknown> & {
    type: 'user_info'
    userId: number
    name: string
    shortName: string
    email: string
    timezone: string
    lang: string
}

async function generateUserInfo(
    client: CommsApi,
): Promise<{ textContent: string; structuredContent: UserInfoStructured }> {
    const user = await client.users.getSessionUser()

    const lines: string[] = [
        '# User Information',
        '',
        `**User ID:** ${user.id}`,
        `**Name:** ${user.fullName}`,
        `**Short Name:** ${user.shortName}`,
        `**Email:** ${user.email}`,
        `**Timezone:** ${user.timezone}`,
        `**Language:** ${user.lang}`,
    ]

    const textContent = lines.join('\n')

    const structuredContent: UserInfoStructured = {
        type: 'user_info',
        userId: user.id,
        name: user.fullName,
        shortName: user.shortName,
        email: user.email,
        timezone: user.timezone,
        lang: user.lang,
    }

    return { textContent, structuredContent }
}

const userInfo = {
    name: ToolNames.USER_INFO,
    description:
        'Get information about the authenticated Comms user: user ID, full name, short name, email, timezone, and language.',
    parameters: ArgsSchema,
    outputSchema: UserInfoOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(_args, client) {
        const result = await generateUserInfo(client)

        return getToolOutput({
            textContent: result.textContent,
            structuredContent: result.structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof UserInfoOutputSchema.shape>

export { userInfo, type UserInfoStructured }
