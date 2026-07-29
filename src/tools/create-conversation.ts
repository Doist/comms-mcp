import { getFullCommsURL } from '@doist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import {
    type CreateConversationOutput,
    CreateConversationOutputSchema,
} from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { getConversationUrl } from '../utils/url-helpers.js'

const ArgsSchema = {
    workspaceId: z.number().describe('The ID of the workspace the conversation belongs to.'),
    recipients: z
        .array(z.number())
        .min(1)
        .describe(
            'User IDs to include in the direct or group conversation (excluding yourself, who is added automatically). Use get-users to resolve names to IDs.',
        ),
    content: z
        .string()
        .min(1)
        .describe(
            'The content of the first message to post. Markdown. Mention people with the link syntax [Name](comms-mention://USER_ID) — e.g. [Afzal](comms-mention://29367677) — never @Name or [[Name|id]], which post as literal text. Do not put "@" in the label; the client adds it. Groups use [Name](comms-group-mention://GROUP_ID), channels [#name](comms-channel://CHANNEL_ID), threads [Title](comms-thread://THREAD_ID). Resolve IDs with get-users/get-groups/list-channels first. Everyone in recipients is notified regardless of who is mentioned inline; a mentioned person who is not a participant is not notified.',
        ),
}

const createConversation = {
    name: ToolNames.CREATE_CONVERSATION,
    description:
        'Start a direct or group conversation with one or more users and post an initial message. Reuses the existing conversation if one already exists for the same set of users.',
    parameters: ArgsSchema,
    outputSchema: CreateConversationOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async execute(args, client) {
        const { workspaceId, recipients, content } = args

        // The backend dedupes on the participant set, so this returns the existing
        // conversation for these users rather than creating a duplicate.
        const conversation = await client.conversations.getOrCreateConversation({
            workspaceId,
            userIds: recipients,
        })

        const message = await client.conversationMessages.createMessage({
            conversationId: conversation.id,
            content,
        })

        const conversationUrl =
            conversation.url ?? getConversationUrl(conversation.workspaceId, conversation.id)
        const messageUrl =
            message.url ??
            getFullCommsURL({
                workspaceId: message.workspaceId,
                conversationId: message.conversationId,
                messageId: message.id,
            })

        const created = message.posted.toISOString()

        const lines: string[] = [
            `# Conversation Started`,
            '',
            `**Conversation ID:** ${conversation.id}`,
            `**Message ID:** ${message.id}`,
            `**Participants:** ${conversation.userIds.join(', ')}`,
            `**Created:** ${created}`,
            `**URL:** ${conversationUrl}`,
            '',
            '## Message',
            '',
            content,
        ]

        const structuredContent: CreateConversationOutput = {
            type: 'create_conversation_result',
            success: true,
            conversationId: conversation.id,
            messageId: message.id,
            workspaceId: conversation.workspaceId,
            content,
            recipients,
            participants: conversation.userIds,
            created,
            conversationUrl,
            messageUrl,
        }

        return getToolOutput({
            textContent: lines.join('\n'),
            structuredContent,
        })
    },
} satisfies CommsTool<typeof ArgsSchema, typeof CreateConversationOutputSchema.shape>

export { createConversation }
