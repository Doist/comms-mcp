import { formatAttachmentsLine, normalizeAttachments } from '../attachments.js'

const validAttachment = {
    attachmentId: 'abc-123',
    urlType: 'file',
    fileName: 'report.pdf',
    fileSize: 4096,
    title: 'Report',
    url: 'https://comms.todoist.com/files/abc/report.pdf',
}

describe('normalizeAttachments', () => {
    it('returns undefined for non-array input', () => {
        expect(normalizeAttachments(undefined)).toBeUndefined()
        expect(normalizeAttachments(null)).toBeUndefined()
        expect(normalizeAttachments('nope')).toBeUndefined()
        expect(normalizeAttachments({ attachmentId: 'x', urlType: 'file' })).toBeUndefined()
    })

    it('returns undefined for an empty array', () => {
        expect(normalizeAttachments([])).toBeUndefined()
    })

    it('drops non-object items', () => {
        expect(normalizeAttachments([1, 'a', null, [], undefined])).toBeUndefined()
    })

    it('drops objects missing the required attachmentId / urlType fields', () => {
        expect(normalizeAttachments([{}])).toBeUndefined()
        expect(normalizeAttachments([new Date()])).toBeUndefined()
        expect(normalizeAttachments([{ attachmentId: 'x' }])).toBeUndefined()
        expect(normalizeAttachments([{ urlType: 'file' }])).toBeUndefined()
        expect(normalizeAttachments([{ attachmentId: 1, urlType: 'file' }])).toBeUndefined()
    })

    it('keeps only the valid attachments from a mixed array', () => {
        const result = normalizeAttachments([validAttachment, {}, 'nope'])
        expect(result).toHaveLength(1)
        expect(result?.[0]).toMatchObject({ attachmentId: 'abc-123', urlType: 'file' })
    })
})

describe('formatAttachmentsLine', () => {
    it('returns undefined when there are no attachments', () => {
        expect(formatAttachmentsLine(undefined)).toBeUndefined()
        expect(formatAttachmentsLine([])).toBeUndefined()
    })

    it('renders fileName, byte size and url', () => {
        expect(formatAttachmentsLine([validAttachment])).toBe(
            '**Attachments (1):** report.pdf (4096 bytes) — https://comms.todoist.com/files/abc/report.pdf',
        )
    })

    it('falls back to title when fileName is absent', () => {
        const line = formatAttachmentsLine([
            { attachmentId: 'a', urlType: 'file', fileName: null, title: 'My Title' },
        ])
        expect(line).toBe('**Attachments (1):** My Title')
    })

    it('omits the size segment when fileSize is missing', () => {
        const line = formatAttachmentsLine([
            { attachmentId: 'a', urlType: 'file', fileName: 'a.txt' },
        ])
        expect(line).toBe('**Attachments (1):** a.txt')
    })

    it('renders the url alone when there is no name', () => {
        const line = formatAttachmentsLine([
            { attachmentId: 'a', urlType: 'file', url: 'https://example.com/x' },
        ])
        expect(line).toBe('**Attachments (1):** https://example.com/x')
    })

    it('falls back to "(unnamed attachment)" when neither name nor url is set', () => {
        const line = formatAttachmentsLine([{ attachmentId: 'a', urlType: 'file' }])
        expect(line).toBe('**Attachments (1):** (unnamed attachment)')
    })

    it('joins multiple attachments with "; "', () => {
        const line = formatAttachmentsLine([
            { attachmentId: 'a', urlType: 'file', fileName: 'a.txt' },
            { attachmentId: 'b', urlType: 'file', fileName: 'b.txt' },
        ])
        expect(line).toBe('**Attachments (2):** a.txt; b.txt')
    })
})
