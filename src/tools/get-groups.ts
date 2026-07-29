import type { CommsApi } from '@doist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import {
    type GetGroupsOutput,
    GetGroupsOutputSchema,
    type GroupMember,
} from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'

const ArgsSchema = {
    workspaceId: z.number().describe('The workspace ID to get groups from.'),
    groupIds: z
        .array(z.string())
        .optional()
        .describe(
            'Optional array of specific group IDs to fetch. If not provided or empty array, fetches all workspace groups.',
        ),
    searchText: z
        .string()
        .optional()
        .describe('Optional search text to filter groups by name (case-insensitive).'),
    includeMembers: z
        .boolean()
        .optional()
        .describe(
            'When true, list each group\'s members (user ID, name, and email) instead of just a member count. Defaults to false. Use it to answer questions like "who is in the Automations squad?" or to expand a group into individual recipients.',
        ),
}

type GetGroupsStructured = GetGroupsOutput

/**
 * Resolves member user IDs to names/emails with a single workspace-users fetch,
 * so member lists cost one request regardless of how many groups are returned.
 */
async function fetchMemberLookup(
    client: CommsApi,
    workspaceId: number,
): Promise<Map<number, GroupMember>> {
    const users = await client.workspaceUsers.getWorkspaceUsers({ workspaceId })
    return new Map(
        users.map((user) => [
            user.id,
            { id: user.id, name: user.fullName, ...(user.email && { email: user.email }) },
        ]),
    )
}

function toMembers(userIds: number[], lookup: Map<number, GroupMember>): GroupMember[] {
    return userIds.map((id) => lookup.get(id) ?? { id })
}

const getGroups = {
    name: ToolNames.GET_GROUPS,
    description:
        'Get groups from a workspace. Retrieves all workspace groups by default, or specific groups if groupIds array is provided. Supports optional case-insensitive search filtering by group name. Set includeMembers to true to also list who belongs to each group. Use this before passing group IDs to tools that support group notifications.',
    parameters: ArgsSchema,
    outputSchema: GetGroupsOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(args, client) {
        const { workspaceId, groupIds, searchText, includeMembers } = args

        const requestedGroupIds =
            groupIds && groupIds.length > 0 ? [...new Set(groupIds)] : undefined
        const groups = requestedGroupIds
            ? (
                  await Promise.all(
                      requestedGroupIds.map((id) =>
                          client.groups.getGroup({ id, workspaceId }).catch(() => null),
                      ),
                  )
              )
                  .filter((g): g is NonNullable<typeof g> => g !== null)
                  .filter((group) => group.workspaceId === workspaceId)
            : await client.groups.getGroups(workspaceId)
        const totalGroups = groups.length

        let filteredGroups = groups
        if (searchText) {
            const searchLower = searchText.toLowerCase()
            filteredGroups = groups.filter((group) =>
                group.name.toLowerCase().includes(searchLower),
            )
        }

        const memberLookup =
            includeMembers && filteredGroups.length > 0
                ? await fetchMemberLookup(client, workspaceId)
                : undefined

        const lines: string[] = ['# Workspace Groups', '']

        lines.push(`**Workspace ID:** ${workspaceId}`)
        lines.push(
            `**Total Groups:** ${totalGroups}${searchText ? ` (${filteredGroups.length} matching search)` : ''}`,
        )
        lines.push('')

        if (filteredGroups.length === 0) {
            lines.push('No groups found.')
        } else {
            for (const group of filteredGroups) {
                lines.push(`## ${group.name}`)
                lines.push(`**ID:** ${group.id}`)
                lines.push(`**Members:** ${group.userIds.length}`)
                if (memberLookup) {
                    for (const member of toMembers(group.userIds, memberLookup)) {
                        const name = member.name ?? `user:${member.id}`
                        const email = member.email ? ` <${member.email}>` : ''
                        lines.push(`- ${name} (id:${member.id})${email}`)
                    }
                }
                lines.push('')
            }
        }

        const textContent = lines.join('\n')

        const structuredContent: GetGroupsStructured = {
            type: 'get_groups',
            workspaceId,
            groups: filteredGroups.map((group) => ({
                id: group.id,
                name: group.name,
                workspaceId: group.workspaceId,
                memberCount: group.userIds.length,
                ...(memberLookup && { members: toMembers(group.userIds, memberLookup) }),
            })),
            totalGroups,
            filteredGroups: filteredGroups.length,
        }

        return getToolOutput({
            textContent,
            structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof GetGroupsOutputSchema.shape>

export { getGroups, type GetGroupsStructured }
