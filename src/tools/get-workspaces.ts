import type { CommsApi, WorkspacePlan } from '@doist/comms-sdk'
import type { CommsTool, CommsToolContext } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { GetWorkspacesOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { resolveCommsUrl } from '../utils/url-helpers.js'

const ArgsSchema = {}

type WorkspaceData = {
    id: number
    name: string
    creator: number
    creatorName?: string
    created: string
    url: string
    defaultConversation?: string
    defaultConversationTitle?: string
    defaultConversationUrl?: string
    plan?: WorkspacePlan
    avatarId?: string
    avatarUrls?: {
        s35: string
        s60: string
        s195: string
        s640: string
    }
}

type GetWorkspacesStructured = Record<string, unknown> & {
    type: 'get_workspaces'
    workspaces: WorkspaceData[]
}

async function generateWorkspacesList(
    client: CommsApi,
    context?: CommsToolContext,
): Promise<{ textContent: string; structuredContent: GetWorkspacesStructured }> {
    const workspaces = await client.workspaces.getWorkspaces()

    if (workspaces.length === 0) {
        return {
            textContent: '# Workspaces\n\nNo workspaces found.',
            structuredContent: {
                type: 'get_workspaces',
                workspaces: [],
            },
        }
    }

    // Collect default conversation IDs (paired with the workspace they belong to)
    // and unique creator IDs (paired with workspace IDs so we can do per-workspace
    // user lookups).
    const defaultConversationPairs: Array<{ workspaceId: number; conversationId: string }> = []
    const creatorPairs: Array<{ workspaceId: number; creatorId: number }> = []

    for (const workspace of workspaces) {
        if (workspace.defaultConversation) {
            defaultConversationPairs.push({
                workspaceId: workspace.id,
                conversationId: workspace.defaultConversation,
            })
        }
        creatorPairs.push({ workspaceId: workspace.id, creatorId: workspace.creator })
    }

    // Fetch default conversations
    const conversationLookup: Record<string, { title: string; url?: string }> = {}
    if (defaultConversationPairs.length > 0) {
        const conversations = await Promise.all(
            defaultConversationPairs.map(({ conversationId }) =>
                client.conversations.getConversation(conversationId).catch(() => null),
            ),
        )
        for (let i = 0; i < defaultConversationPairs.length; i++) {
            const pair = defaultConversationPairs[i]
            const conversation = conversations[i]
            if (pair && conversation) {
                const title =
                    conversation.title ||
                    `Conversation with users: ${conversation.userIds.join(', ')}`
                conversationLookup[pair.conversationId] = {
                    title,
                    url: conversation.url,
                }
            }
        }
    }

    // Fetch all workspace creators
    const creatorLookup: Record<number, string> = {}
    if (creatorPairs.length > 0) {
        const users = await Promise.all(
            creatorPairs.map(({ workspaceId, creatorId }) =>
                client.workspaceUsers
                    .getUserById({ workspaceId, userId: creatorId })
                    .catch(() => null),
            ),
        )
        for (let i = 0; i < creatorPairs.length; i++) {
            const pair = creatorPairs[i]
            const user = users[i]
            if (pair && user) {
                creatorLookup[pair.creatorId] = user.fullName
            }
        }
    }

    const lines: string[] = ['# Workspaces', '']
    lines.push(`Found ${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'}:`, '')

    for (const workspace of workspaces) {
        const creatorName = creatorLookup[workspace.creator]
        const defaultConversationTitle = workspace.defaultConversation
            ? conversationLookup[workspace.defaultConversation]?.title
            : undefined
        const workspaceUrl = resolveCommsUrl(undefined, { workspaceId: workspace.id }, context)

        lines.push(`## [${workspace.name}](${workspaceUrl})`)
        lines.push(`**ID:** ${workspace.id}`)
        lines.push(
            `**Creator:** ${creatorName ? `${creatorName} (${workspace.creator})` : workspace.creator}`,
        )
        lines.push(`**Created:** ${workspace.created.toISOString()}`)

        if (workspace.defaultConversation) {
            const conversationUrl = resolveCommsUrl(
                conversationLookup[workspace.defaultConversation]?.url,
                {
                    workspaceId: workspace.id,
                    conversationId: workspace.defaultConversation,
                },
                context,
            )
            lines.push(
                `**Default Conversation:** ${defaultConversationTitle ? `[${defaultConversationTitle}](${conversationUrl}) (${workspace.defaultConversation})` : `[${workspace.defaultConversation}](${conversationUrl})`}`,
            )
        }

        if (workspace.plan) {
            lines.push(`**Plan:** ${workspace.plan}`)
        }

        lines.push('')
    }

    const textContent = lines.join('\n')

    const structuredContent: GetWorkspacesStructured = {
        type: 'get_workspaces',
        workspaces: workspaces.map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            creator: workspace.creator,
            ...(creatorLookup[workspace.creator] && {
                creatorName: creatorLookup[workspace.creator],
            }),
            created: workspace.created.toISOString(),
            url: resolveCommsUrl(undefined, { workspaceId: workspace.id }, context),
            ...(workspace.defaultConversation && {
                defaultConversation: workspace.defaultConversation,
            }),
            ...(workspace.defaultConversation &&
                conversationLookup[workspace.defaultConversation] && {
                    defaultConversationTitle:
                        conversationLookup[workspace.defaultConversation]?.title,
                }),
            ...(workspace.defaultConversation && {
                defaultConversationUrl: resolveCommsUrl(
                    conversationLookup[workspace.defaultConversation]?.url,
                    {
                        workspaceId: workspace.id,
                        conversationId: workspace.defaultConversation,
                    },
                    context,
                ),
            }),
            ...(workspace.plan && { plan: workspace.plan }),
            ...(workspace.avatarId && { avatarId: workspace.avatarId }),
            ...(workspace.avatarUrls && { avatarUrls: workspace.avatarUrls }),
        })),
    }

    return { textContent, structuredContent }
}

const getWorkspaces = {
    name: ToolNames.GET_WORKSPACES,
    description:
        'Get all workspaces that the user belongs to. Returns a list of workspaces with their IDs, names, creators, creation dates, default conversation, and plan information.',
    parameters: ArgsSchema,
    outputSchema: GetWorkspacesOutputSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    async execute(_args, client, context) {
        const result = await generateWorkspacesList(client, context)

        return getToolOutput({
            textContent: result.textContent,
            structuredContent: result.structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof GetWorkspacesOutputSchema.shape>

export { getWorkspaces, type GetWorkspacesStructured }
