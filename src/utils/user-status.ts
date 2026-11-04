import type { UserStatus } from '@doist/comms-sdk'
import type { UserStatusOutput } from './output-schemas.js'

type StatusOutput = NonNullable<UserStatusOutput['status']>

// Comms sends RFC 3339, but an end that fails to parse must not turn a write that applied into an
// error, so it is reported as sent.
function normaliseActiveUntil(activeUntil: string): string {
    const parsed = new Date(activeUntil)
    return Number.isNaN(parsed.getTime()) ? activeUntil : parsed.toISOString()
}

function toStatusOutput(status: UserStatus): StatusOutput {
    const activeUntil = status.activeUntil ? normaliseActiveUntil(status.activeUntil) : undefined
    return {
        message: status.message,
        ...(status.emoji ? { emoji: status.emoji } : {}),
        ...(activeUntil ? { activeUntil } : {}),
        pauseNotifications: Boolean(status.effects?.pauseNotifications),
        pauseActivity: Boolean(status.effects?.pauseActivity),
    }
}

function buildUserStatusResult(
    status: UserStatus | null | undefined,
    heading: string,
): { textContent: string; structuredContent: UserStatusOutput } {
    if (!status) {
        return {
            textContent: `${heading}: none`,
            structuredContent: { type: 'user_status', hasStatus: false },
        }
    }

    const output = toStatusOutput(status)
    const lines = [`${heading}: ${output.emoji ? `${output.emoji} ` : ''}${output.message}`]
    lines.push(output.activeUntil ? `Until: ${output.activeUntil}` : 'Until: no end')
    const effects = [
        output.pauseNotifications ? 'Comms notifications paused' : undefined,
        output.pauseActivity ? 'Karma and streaks paused' : undefined,
    ].filter((effect): effect is string => effect !== undefined)
    if (effects.length > 0) {
        lines.push(`Effects: ${effects.join(', ')}`)
    }

    return {
        textContent: lines.join('\n'),
        structuredContent: { type: 'user_status', hasStatus: true, status: output },
    }
}

export { buildUserStatusResult }
