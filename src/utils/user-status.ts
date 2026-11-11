import type { UserStatus } from '@todoist/comms-sdk'
import type { UserInfoOutput } from './output-schemas.js'

type StatusOutput = NonNullable<UserInfoOutput['status']>

// Comms sends RFC 3339, but an end that fails to parse is still worth showing, so it is reported as
// sent. A set never gets this far with one: it fails the comparison with the end it asked for.
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

/** The status lines of a user-info text, in the same `**Label:** value` form as the rest. */
function describeStatus(status: StatusOutput | undefined): string[] {
    if (!status) {
        return ['**Status:** none']
    }

    const lines = [`**Status:** ${status.emoji ? `${status.emoji} ` : ''}${status.message}`]
    lines.push(`**Status Until:** ${status.activeUntil ?? 'no end'}`)
    const effects = [
        status.pauseNotifications ? 'Comms notifications paused' : undefined,
        status.pauseActivity ? 'Karma and streaks paused' : undefined,
    ].filter((effect): effect is string => effect !== undefined)
    if (effects.length > 0) {
        lines.push(`**Status Effects:** ${effects.join(', ')}`)
    }
    return lines
}

export { describeStatus, normaliseActiveUntil, toStatusOutput }
