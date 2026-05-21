import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import { ToolNames } from '../../utils/tool-names.js'
import { away } from '../away.js'

// The Comms SDK has no away-mode endpoint. Every action throws — silently
// reporting `isAway: false` would be a lie (the user may genuinely be away;
// we just can't tell). The tool is also unregistered from the MCP server,
// so it's only reachable through the importable-tools surface, which still
// gets the loud failure.
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

    it.each(['get', 'set', 'clear'] as const)(
        'rejects %s with an unsupported-by-SDK error and does not touch the client',
        async (action) => {
            await expect(
                away.execute(
                    {
                        action,
                        ...(action === 'set'
                            ? { type: 'vacation' as const, until: '2025-03-15' }
                            : {}),
                    },
                    mockCommsApi,
                ),
            ).rejects.toThrow('not currently supported by the Comms SDK')

            expect(mockCommsApi.users.getSessionUser).not.toHaveBeenCalled()
            expect(mockCommsApi.users.update).not.toHaveBeenCalled()
        },
    )
})
