import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import { extractStructuredContent, extractTextContent } from '../../utils/test-helpers.js'
import { ToolNames } from '../../utils/tool-names.js'
import { away } from '../away.js'

// The Comms SDK has no away-mode endpoint. `get` honestly reports the
// user as not away; `set` and `clear` reject so the LLM doesn't silently
// "succeed" without state actually changing. These tests pin both halves
// and assert no SDK calls leak out from any branch.
const mockCommsApi = {
    users: {
        getSessionUser: jest.fn(),
        update: jest.fn(),
    },
} as unknown as jest.Mocked<CommsApi>

const { AWAY } = ToolNames

describe(`${AWAY} tool`, () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    describe('get action', () => {
        it('returns not-away and does not hit the SDK', async () => {
            const result = await away.execute({ action: 'get' }, mockCommsApi)

            const textContent = extractTextContent(result)
            expect(textContent).toContain('**Status:** Not away')
            expect(textContent).toContain('not currently exposed by the Comms SDK')

            const structured = extractStructuredContent(result)
            expect(structured).toEqual(
                expect.objectContaining({
                    type: 'away_status',
                    action: 'get',
                    isAway: false,
                }),
            )

            expect(mockCommsApi.users.getSessionUser).not.toHaveBeenCalled()
            expect(mockCommsApi.users.update).not.toHaveBeenCalled()
        })
    })

    describe('set action', () => {
        it('rejects with a clear unsupported error and does not hit the SDK', async () => {
            await expect(
                away.execute(
                    {
                        action: 'set',
                        type: 'vacation',
                        from: '2025-03-01',
                        until: '2025-03-15',
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('not currently supported by the Comms SDK')

            expect(mockCommsApi.users.update).not.toHaveBeenCalled()
        })
    })

    describe('clear action', () => {
        it('rejects with a clear unsupported error and does not hit the SDK', async () => {
            await expect(away.execute({ action: 'clear' }, mockCommsApi)).rejects.toThrow(
                'not currently supported by the Comms SDK',
            )

            expect(mockCommsApi.users.update).not.toHaveBeenCalled()
        })
    })
})
