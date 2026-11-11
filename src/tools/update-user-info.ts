import {
    CommsRequestError,
    getCommsErrorString,
    type CommsApi,
    type SetStatusArgs,
    type UpdateUserArgs,
    type User,
    type UserStatus,
} from '@todoist/comms-sdk'
import { z } from 'zod'
import type { CommsTool } from '../comms-tool.js'
import { UserInfoOutputSchema } from '../utils/output-schemas.js'
import { ToolNames } from '../utils/tool-names.js'
import { normaliseActiveUntil } from '../utils/user-status.js'
import { buildUserInfoResult } from './user-output.js'

const MAX_MESSAGE_LENGTH = 80

const StatusArgsSchema = z.object({
    message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
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
})

// The password is left out on purpose: it is never changed through this server.
const ArgsSchema = {
    name: z.string().trim().min(1).optional().describe('Full name.'),
    timezone: z.string().trim().min(1).optional().describe('IANA timezone, e.g. Europe/London.'),
    lang: z.string().trim().min(1).optional().describe('Language code, e.g. en.'),
    status: StatusArgsSchema.nullable()
        .optional()
        .describe(
            'Replaces the whole status: an omitted emoji, end or pause is removed. null removes the status.',
        ),
}

type UpdateUserInfoArgs = z.infer<z.ZodObject<typeof ArgsSchema>>
type StatusArgs = z.infer<typeof StatusArgsSchema>

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

/** The whole status to store. Omitted fields are cleared, not kept. */
function buildStatus(status: StatusArgs, now: Date): SetStatusArgs {
    const { message, emoji, activeUntil, pauseNotifications, pauseActivity } = status

    // The schema checks these, but a caller that skips it can send anything. A message or emoji
    // Comms accepts but the comparison below cannot read would fail only after the write applied,
    // and a pause flag of "false" would read as true.
    if (typeof message !== 'string' || !message.trim()) {
        throw new Error(
            'status.message is required to set a status. Pass status: null to remove it.',
        )
    }
    if (emoji != null && typeof emoji !== 'string') {
        throw new Error('status.emoji must be text, such as "🏝️".')
    }
    if (activeUntil != null && typeof activeUntil !== 'string') {
        throw invalidActiveUntil(String(activeUntil))
    }
    for (const [flag, value] of Object.entries({ pauseNotifications, pauseActivity })) {
        if (value != null && typeof value !== 'boolean') {
            throw new Error(`status.${flag} must be true or false.`)
        }
    }

    return {
        // Trimmed as the schema would, so a caller that skips it sends the same values.
        message: message.trim(),
        emoji: emoji?.trim() || null,
        activeUntil: activeUntil != null ? parseActiveUntil(activeUntil, now) : null,
        effects: {
            pauseNotifications: pauseNotifications ? ALL_SCOPE : null,
            pauseActivity: pauseActivity ? ALL_SCOPE : null,
        },
    }
}

// Each profile field and where Comms reports it back.
const PROFILE_FIELDS = { name: 'fullName', timezone: 'timezone', lang: 'lang' } as const
type ProfileField = keyof typeof PROFILE_FIELDS

function buildProfile(args: UpdateUserInfoArgs): UpdateUserArgs | null {
    const profile: UpdateUserArgs = {}
    for (const field of Object.keys(PROFILE_FIELDS) as ProfileField[]) {
        const value: unknown = args[field]
        if (value === undefined) {
            continue
        }
        // The schema checks this too, for a caller that skips it.
        if (typeof value !== 'string' || !value.trim()) {
            throw new Error(`${field} must be text that is not blank.`)
        }
        profile[field] = value.trim()
    }
    return Object.keys(profile).length > 0 ? profile : null
}

// Comms may store a value in another form than it was sent, or report one it has not caught up
// with yet, so a difference is reported beside the result rather than failing a write that applied.
function profileDifferences(held: User, sent: UpdateUserArgs): string[] {
    return (Object.keys(PROFILE_FIELDS) as ProfileField[])
        .filter((field) => sent[field] !== undefined && held[PROFILE_FIELDS[field]] !== sent[field])
        .map(
            (field) =>
                `Comms reports ${field} as "${held[PROFILE_FIELDS[field]]}", not "${sent[field]}"; use ${ToolNames.USER_INFO} to check it.`,
        )
}

function errorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}

const SCOPE_HINTS: Record<number, string> = {
    401: ' Comms rejected the token, so the connection may need reconnecting.',
    403: ' Changing it needs the user:write scope, so the connection may need reconnecting to grant it.',
}

/**
 * The SDK's message for a refusal is only the status code, and a connection may not hold
 * `user:write`, which covers updating the user's settings, so a refusal says what it needs. No
 * failure claims the change did not apply: the SDK retries a POST after a network error, so an
 * earlier attempt may have.
 */
function explainWriteFailure(error: unknown, subject: 'profile' | 'status'): Error {
    const checkIt = `Use ${ToolNames.USER_INFO} to check it.`
    const status = error instanceof CommsRequestError ? error.httpStatusCode : undefined
    if (status === undefined || status >= 500) {
        return new Error(`The ${subject} change is unconfirmed: ${errorDetail(error)}. ${checkIt}`)
    }
    const reason = getCommsErrorString(error)
    return new Error(
        `Comms refused to change the ${subject} (HTTP ${status})${reason ? `: ${reason}` : ''}.${SCOPE_HINTS[status] ?? ''} ${checkIt}`,
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
    // An end Comms sends that cannot be read stays as sent, so it never matches the one asked for.
    const heldUntil = held.activeUntil ? normaliseActiveUntil(held.activeUntil) : null
    // What was sent was built from a parsed end, so it always reads.
    const sentUntil = sent.activeUntil ? new Date(sent.activeUntil).toISOString() : null
    return (
        normaliseMessage(held.message) === normaliseMessage(sent.message) &&
        normaliseEmoji(held.emoji) === normaliseEmoji(sent.emoji) &&
        heldUntil === sentUntil &&
        samePause(held.effects?.pauseNotifications, sent.effects?.pauseNotifications) &&
        samePause(held.effects?.pauseActivity, sent.effects?.pauseActivity)
    )
}

/** Updates the profile, and lists any field Comms reports differently from the one sent. */
async function writeProfile(
    client: CommsApi,
    profile: UpdateUserArgs,
    statusPending: boolean,
): Promise<{ user: User; differences: string[] }> {
    // The status is only sent once Comms has accepted the profile change.
    const notSent = statusPending ? ' The status change was not sent.' : ''
    const user = await client.users.update(profile).catch((error: unknown) => {
        throw new Error(`${explainWriteFailure(error, 'profile').message}${notSent}`)
    })
    return { user, differences: profileDifferences(user, profile) }
}

/** Sets or clears the status, then checks the user Comms returns holds what was asked for. */
async function writeStatus(client: CommsApi, status: SetStatusArgs | null): Promise<User> {
    const checkIt = `use ${ToolNames.USER_INFO} to see it.`

    if (status === null) {
        const user = await client.users.clearStatus().catch((error: unknown) => {
            throw explainWriteFailure(error, 'status')
        })
        if (user.status) {
            throw new Error(`Comms accepted the clear but still reports a status; ${checkIt}`)
        }
        return user
    }

    const user = await client.users.setStatus(status).catch((error: unknown) => {
        throw explainWriteFailure(error, 'status')
    })
    if (!user.status) {
        throw new Error(`Comms accepted the status but reports no active status; ${checkIt}`)
    }
    if (!sameStatus(user.status, status)) {
        throw new Error(`Comms accepted the status but reports a different one; ${checkIt}`)
    }
    return user
}

/**
 * The user to report: the profile from its own write and the status from the status write, which
 * is the one that checked it. After a profile-only update the status is read back when the
 * response leaves it out, because a missing status is not the same as none.
 */
async function reportedUser(
    client: CommsApi,
    profileUser: User | undefined,
    statusUser: User | undefined,
): Promise<User> {
    if (profileUser && statusUser) {
        return { ...profileUser, status: statusUser.status }
    }
    if (statusUser) {
        return statusUser
    }
    if (!profileUser) {
        throw new Error(
            'Neither the profile nor the status was written, so there is no user to report.',
        )
    }
    if (profileUser.status !== undefined) {
        return profileUser
    }
    const current = await client.users.getSessionUser().catch((error: unknown) => {
        throw new Error(
            `Comms accepted the profile change, but reading the status back failed: ${errorDetail(error)}. Use ${ToolNames.USER_INFO} to check it.`,
        )
    })
    return { ...profileUser, status: current.status }
}

const updateUserInfo = {
    name: ToolNames.UPDATE_USER_INFO,
    description:
        "Change the user's name, timezone, language or status; fields left out are kept. A status given replaces the whole status. The status is shown next to their name in Comms and Todoist. Returns the user as user-info does.",
    parameters: ArgsSchema,
    outputSchema: UserInfoOutputSchema.shape,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    async execute(args, client) {
        const profile = buildProfile(args)
        // undefined leaves the status alone, and null removes it.
        const status =
            args.status === undefined || args.status === null
                ? args.status
                : buildStatus(args.status, new Date())
        if (!profile && status === undefined) {
            throw new Error(
                'At least one of `name`, `timezone`, `lang`, or `status` must be provided.',
            )
        }

        const profileWrite = profile
            ? await writeProfile(client, profile, status !== undefined)
            : undefined
        const statusUser =
            status === undefined
                ? undefined
                : await writeStatus(client, status).catch((error: unknown) => {
                      if (!profile) {
                          throw error
                      }
                      // The status failure may itself be unconfirmed, so this claims nothing about it.
                      throw new Error(`Comms accepted the profile change. ${errorDetail(error)}`)
                  })

        const result = buildUserInfoResult(
            await reportedUser(client, profileWrite?.user, statusUser),
        )
        const changed = [...Object.keys(profile ?? {}), ...(status !== undefined ? ['status'] : [])]
        const summary = [`Updated: ${changed.join(', ')}`, ...(profileWrite?.differences ?? [])]
        return {
            textContent: `${summary.join('\n')}\n\n${result.textContent}`,
            structuredContent: result.structuredContent,
        }
    },
} satisfies CommsTool<typeof ArgsSchema, typeof UserInfoOutputSchema.shape>

export { updateUserInfo }
