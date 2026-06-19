import { type Attachment } from '@doist/comms-sdk'

export type { Attachment }

/**
 * Separator between an attachment's label and its URL in the formatted text line.
 * Kept in one place so the rendering logic below stays in sync with itself.
 */
const URL_SEPARATOR = ' — '

/**
 * Coerce a raw `attachments` value from the Comms API into a list of attachment
 * objects, dropping anything that doesn't carry the two fields every attachment
 * is guaranteed to have (`attachmentId` and `urlType`). Returns `undefined` when
 * nothing valid remains so callers can omit the field entirely rather than
 * emitting an empty array or a malformed entry that fails the output schema.
 *
 * Note: an attachment's `url` points at the Comms file store and currently
 * requires a browser session cookie to download — there is no OAuth-authenticated
 * attachment download endpoint on the public Comms REST API today.
 */
export function normalizeAttachments(value: unknown): Attachment[] | undefined {
    if (!Array.isArray(value)) {
        return undefined
    }
    const attachments = value.filter((item): item is Attachment => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            return false
        }
        const candidate = item as Record<string, unknown>
        return typeof candidate.attachmentId === 'string' && typeof candidate.urlType === 'string'
    })
    return attachments.length > 0 ? attachments : undefined
}

/**
 * Render a one-line `**Attachments (n):** ...` summary, or `undefined` when there
 * are none. Each attachment shows its name (falling back to title), an optional
 * byte size, and its URL.
 */
export function formatAttachmentsLine(attachments: Attachment[] | undefined): string | undefined {
    if (!attachments || attachments.length === 0) {
        return undefined
    }
    const items = attachments
        .map((a) => {
            const name = a.fileName ?? a.title ?? undefined
            const size = typeof a.fileSize === 'number' ? ` (${a.fileSize} bytes)` : ''
            const url = a.url ?? undefined
            if (name) {
                return url ? `${name}${size}${URL_SEPARATOR}${url}` : `${name}${size}`
            }
            return url ?? '(unnamed attachment)'
        })
        .join('; ')
    return `**Attachments (${attachments.length}):** ${items}`
}
