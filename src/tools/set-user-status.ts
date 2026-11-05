import {
    CommsRequestError,
    getCommsErrorString,
    type SetStatusArgs,
    type UserStatus,
} from '@doist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { getToolOutput } from '../mcp-helpers.js'
import { UserStatusOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { buildUserStatusResult } from '../utils/user-status.js'

const MAX_MESSAGE_LENGTH = 80

const ArgsSchema = {
    message: z
        .string()
        .trim()
        .min(1)
        .max(MAX_MESSAGE_LENGTH)
        .optional()
        .describe('Required unless clear is true.'),
    emoji: z.string().trim().min(1).optional().describe('A Unicode emoji, such as 🏝️.'),
    activeUntil: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
            'When it ends: a future ISO 8601 timestamp with Z or an offset, e.g. 2026-11-10T00:00:00+00:00. Omit for no end.',
        ),
    pauseNotifications: z
        .boolean()
        .optional()
        .describe('Hold back Comms notifications while active. They are not sent later.'),
    pauseActivity: z.boolean().optional().describe('Pause Karma and streaks while active.'),
    clear: z.boolean().optional().describe('Remove the status. Use alone.'),
}

type SetUserStatusArgs = z.infer<z.ZodObject<typeof ArgsSchema>>

// An ISO 8601 timestamp that carries its own zone, so it never depends on the server's.
const ZONED_TIMESTAMP =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|([+-])(\d{2}):(\d{2}))$/i

// The offsets in use worldwide run from UTC-12:00 to UTC+14:00.
const MIN_OFFSET_MINUTES = -12 * 60
const MAX_OFFSET_MINUTES = 14 * 60

function invalidActiveUntil(value: string): Error {
    return new Error(
        `activeUntil must be an ISO 8601 timestamp with Z or an offset, such as "2026-11-10T00:00:00+00:00". Got "${value}".`,
    )
}

function parseActiveUntil(value: string, now: Date): string {
    const match = ZONED_TIMESTAMP.exec(value)
    if (!match) {
        throw invalidActiveUntil(value)
    }
    const [, year, month, day, hour, minute, second = '0', sign, offsetHours, offsetMinutes] = match
    const [y, mo, d, h, mi, s] = [year, month, day, hour, minute, second].map(Number) as [
        number,
        number,
        number,
        number,
        number,
        number,
    ]

    // `Date` rolls an impossible day or time over (31 November becomes 1 December), so build the
    // wall-clock instant and require every part to survive the round trip. `setUTCFullYear` keeps
    // the years 0 to 99, which `Date.UTC` would read as 1900 to 1999.
    const wallClock = new Date(0)
    wallClock.setUTCFullYear(y, mo - 1, d)
    wallClock.setUTCHours(h, mi, s)
    const partsSurvive =
        wallClock.getUTCFullYear() === y &&
        wallClock.getUTCMonth() === mo - 1 &&
        wallClock.getUTCDate() === d &&
        wallClock.getUTCHours() === h &&
        wallClock.getUTCMinutes() === mi &&
        wallClock.getUTCSeconds() === s
    const offset = sign
        ? (sign === '-' ? -1 : 1) * (Number(offsetHours) * 60 + Number(offsetMinutes))
        : 0
    if (!partsSurvive || offset < MIN_OFFSET_MINUTES || offset > MAX_OFFSET_MINUTES) {
        throw invalidActiveUntil(value)
    }

    // Sub-second precision and offset minutes are checked by `Date` itself, now that the date and
    // time are known to be real.
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
        throw invalidActiveUntil(value)
    }
    if (parsed.getTime() <= now.getTime()) {
        throw new Error(`activeUntil must be in the future. Got "${value}".`)
    }
    return parsed.toISOString()
}

// An explicit scope, because `{}` keeps whatever scope another client stored for the effect.
const ALL_SCOPE = { scope: { mode: 'all' } } as const

/** The whole status to store, or `null` to remove it. Omitted fields are cleared, not kept. */
function buildStatus(args: SetUserStatusArgs, now: Date): SetStatusArgs | null {
    const { clear, message, emoji, activeUntil, pauseNotifications, pauseActivity } = args

    if (clear) {
        // A pause flag set to false asks for nothing, so it does not conflict with clear.
        const setsSomething =
            message !== undefined ||
            emoji !== undefined ||
            activeUntil !== undefined ||
            pauseNotifications === true ||
            pauseActivity === true
        if (setsSomething) {
            throw new Error('clear removes the status, so it cannot be combined with other fields.')
        }
        return null
    }

    if (!message) {
        throw new Error('message is required to set a status. Pass clear: true to remove it.')
    }

    return {
        message,
        emoji: emoji ?? null,
        activeUntil: activeUntil !== undefined ? parseActiveUntil(activeUntil, now) : null,
        effects: {
            pauseNotifications: pauseNotifications ? ALL_SCOPE : null,
            pauseActivity: pauseActivity ? ALL_SCOPE : null,
        },
    }
}

const SCOPE_HINTS: Record<number, string> = {
    401: ' Comms rejected the token, so the connection may need reconnecting.',
    403: ' Changing it needs the user:write scope, so the connection may need reconnecting to grant it.',
}

/**
 * The SDK's message for a refusal is only the status code, and connections made before this tool
 * existed hold no `user:write`, so a refusal says what it needs. No failure claims the status is
 * unchanged: the SDK retries a POST after a network error, so an earlier attempt may have applied.
 */
function explainWriteFailure(error: unknown): never {
    const checkIt = `Use ${ToolNames.GET_USER_STATUS} to check it.`
    const status = error instanceof CommsRequestError ? error.httpStatusCode : undefined
    if (status === undefined || status >= 500) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`The status change is unconfirmed: ${detail}. ${checkIt}`)
    }
    const reason = getCommsErrorString(error)
    throw new Error(
        `Comms refused to change the status (HTTP ${status})${reason ? `: ${reason}` : ''}.${SCOPE_HINTS[status] ?? ''} ${checkIt}`,
    )
}

// Whether an emoji carries U+FE0F (🏝️ or 🏝) changes nothing on screen, so a server that adds or
// drops it has not stored a different status. Nor has one that normalises a message's Unicode form
// or runs of whitespace, or trims what a caller skipping the schema left padded.
function normaliseEmoji(emoji: string | null | undefined): string | null {
    return emoji?.replace(/\uFE0F/g, '').trim() || null
}

function normaliseMessage(message: string | undefined): string | undefined {
    return message?.normalize('NFC').replace(/\s+/g, ' ').trim()
}

type StatusEffect = { scope?: { mode?: string } } | null | undefined

// A pause Comms holds with another scope is not the one asked for, so presence alone is not enough.
function samePause(held: StatusEffect, sent: StatusEffect): boolean {
    return Boolean(held) === Boolean(sent) && held?.scope?.mode === sent?.scope?.mode
}

function sameStatus(held: UserStatus, sent: SetStatusArgs): boolean {
    const heldUntil = held.activeUntil ? new Date(held.activeUntil).getTime() : null
    const sentUntil = sent.activeUntil ? new Date(sent.activeUntil).getTime() : null
    return (
        normaliseMessage(held.message) === normaliseMessage(sent.message) &&
        normaliseEmoji(held.emoji) === normaliseEmoji(sent.emoji) &&
        heldUntil === sentUntil &&
        samePause(held.effects?.pauseNotifications, sent.effects?.pauseNotifications) &&
        samePause(held.effects?.pauseActivity, sent.effects?.pauseActivity)
    )
}

const setUserStatus = {
    name: ToolNames.SET_USER_STATUS,
    description:
        "Set or clear the user's status, shown next to their name in Comms and Todoist. Replaces the whole status: an omitted emoji, end or effect is removed, not kept. Use clear to remove the status.",
    parameters: ArgsSchema,
    outputSchema: UserStatusOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async execute(args, client) {
        const status = buildStatus(args, new Date())

        if (status === null) {
            const user = await client.users.clearStatus().catch(explainWriteFailure)
            if (user.status) {
                throw new Error(
                    `Comms accepted the clear but still reports a status; use ${ToolNames.GET_USER_STATUS} to see it.`,
                )
            }
            return getToolOutput(buildUserStatusResult(null, 'Status cleared'))
        }

        // The response carries the status Comms now holds, which is what gets reported.
        const user = await client.users.setStatus(status).catch(explainWriteFailure)
        if (!user.status) {
            throw new Error(
                `Comms accepted the status but reports no active status; use ${ToolNames.GET_USER_STATUS} to check it.`,
            )
        }
        if (!sameStatus(user.status, status)) {
            throw new Error(
                `Comms accepted the status but reports a different one; use ${ToolNames.GET_USER_STATUS} to see it.`,
            )
        }
        return getToolOutput(buildUserStatusResult(user.status, 'Status set'))
    },
} satisfies CommsTool<typeof ArgsSchema, typeof UserStatusOutputSchema.shape>

export { setUserStatus }
