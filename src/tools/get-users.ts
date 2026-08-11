import {
    isRestrictedWorkspaceUser,
    type UserType,
    type VisibleWorkspaceUser,
} from '@doist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { GetUsersOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {
    workspaceId: z.number().describe('The workspace ID to get users from.'),
    userIds: z
        .array(z.number())
        .optional()
        .describe(
            'Optional array of specific user IDs to fetch. If not provided or empty array, fetches all workspace users.',
        ),
    searchText: z
        .string()
        .optional()
        .describe('Optional search text to filter users by name or email (case-insensitive).'),
}

type UserData = {
    id: number
    name: string
    shortName: string
    email?: string
    userType?: UserType
    removed: boolean
    timezone?: string
    restricted?: boolean
}

type GetUsersStructured = Record<string, unknown> & {
    type: 'get_users'
    workspaceId: number
    users: UserData[]
    totalUsers: number
    filteredUsers: number
}

// A restricted profile carries no email, user type or timezone, so those stay
// absent rather than being filled with a placeholder.
function toUserData(user: VisibleWorkspaceUser): UserData {
    const base = {
        id: user.id,
        name: user.fullName,
        shortName: user.shortName,
        removed: user.removed,
    }
    if (isRestrictedWorkspaceUser(user)) {
        return { ...base, restricted: true }
    }
    return {
        ...base,
        ...(user.email && { email: user.email }),
        userType: user.userType,
        timezone: user.timezone,
    }
}

const getUsers = {
    name: ToolNames.GET_USERS,
    description:
        'Get users from a workspace. Retrieves all workspace users by default, or specific users if userIds array is provided. Supports optional case-insensitive search filtering by name or email.',
    parameters: ArgsSchema,
    outputSchema: GetUsersOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(args, client) {
        const { workspaceId, userIds, searchText } = args

        // Fetch users based on userIds parameter
        const users: VisibleWorkspaceUser[] =
            !userIds || userIds.length === 0
                ? await client.workspaceUsers.getWorkspaceUsers({ workspaceId })
                : (
                      await Promise.all(
                          userIds.map((userId) =>
                              client.workspaceUsers
                                  .getUserById({ workspaceId, userId })
                                  .catch(() => null),
                          ),
                      )
                  ).filter((user) => user !== null)

        const totalUsers = users.length

        // Apply search filter if provided
        let filteredUsers = users.map(toUserData)
        if (searchText) {
            const searchLower = searchText.toLowerCase()
            filteredUsers = filteredUsers.filter((user) => {
                const nameMatch = user.name.toLowerCase().includes(searchLower)
                const emailMatch = user.email?.toLowerCase().includes(searchLower) || false
                return nameMatch || emailMatch
            })
        }

        // Build text content
        const lines: string[] = ['# Workspace Users', '']

        lines.push(`**Workspace ID:** ${workspaceId}`)
        lines.push(
            `**Total Users:** ${totalUsers}${searchText ? ` (${filteredUsers.length} matching search)` : ''}`,
        )
        lines.push('')

        if (filteredUsers.length === 0) {
            lines.push('No users found.')
        } else {
            for (const user of filteredUsers) {
                lines.push(`## ${user.name}`)
                lines.push(`**ID:** ${user.id}`)
                if (user.email) {
                    lines.push(`**Email:** ${user.email}`)
                }
                if (user.userType) {
                    lines.push(`**User Type:** ${user.userType}`)
                }
                if (user.timezone) {
                    lines.push(`**Timezone:** ${user.timezone}`)
                }
                if (user.restricted) {
                    lines.push('**Profile:** Restricted, limited visibility of this user')
                }
                lines.push(`**Status:** ${user.removed ? 'Removed' : 'Active'}`)
                lines.push('')
            }
        }

        const textContent = lines.join('\n')

        const structuredContent: GetUsersStructured = {
            type: 'get_users',
            workspaceId,
            users: filteredUsers,
            totalUsers,
            filteredUsers: filteredUsers.length,
        }

        return getToolOutput({
            textContent,
            structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof GetUsersOutputSchema.shape>

export { getUsers, type GetUsersStructured }
