import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { encode } from 'gpt-tokenizer'
import { getMcpServer } from './mcp-server.js'
import { registeredTools } from './tool-registry.js'

/**
 * Budget for the fixed cost every session pays before a tool runs: the `tools/list` payload
 * plus the `instructions` block. Treat it as a ratchet rather than headroom: it should move down
 * over time, and a rise needs justifying in the PR that causes it. Override it with
 * `MCP_TOKEN_BUDGET=NNNN` to experiment without editing the source.
 */
const DEFAULT_TOKEN_BUDGET = 14_000
const TOKEN_BUDGET = Number(process.env.MCP_TOKEN_BUDGET ?? DEFAULT_TOKEN_BUDGET)

function tokens(text: string): number {
    return encode(text).length
}

function pad(value: string | number, width: number): string {
    return String(value).padStart(width)
}

// What a client receives, read from a running server, so nothing here restates how
// registration titles a tool or compiles its schemas.
async function readAdvertisedSurface() {
    const server = getMcpServer({ token: 'test-token' })
    const client = new Client({ name: 'token-footprint', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    try {
        const { tools } = await client.listTools()
        return { tools, instructions: client.getInstructions() }
    } finally {
        await client.close()
        await server.close()
    }
}

describe('token footprint', () => {
    it('keeps the tools/list payload and instructions within the budget', async () => {
        const { tools, instructions } = await readAdvertisedSurface()
        // Both halves of the fixed cost must be there: a lost block would read as a saving.
        expect(tools).toHaveLength(registeredTools.length)
        expect(instructions).toEqual(expect.stringMatching(/\S/))

        const rows = tools
            .map((tool) => ({
                name: tool.name,
                total: tokens(JSON.stringify(tool)),
                description: tokens(tool.description ?? ''),
                inputSchema: tokens(JSON.stringify(tool.inputSchema)),
                outputSchema: tool.outputSchema ? tokens(JSON.stringify(tool.outputSchema)) : 0,
            }))
            .sort((a, b) => b.total - a.total)
        // One JSON array on the wire: the per-tool rows above are only the breakdown.
        const toolsList = tokens(JSON.stringify(tools))
        const instructionsTokens = tokens(instructions ?? '')
        const combined = toolsList + instructionsTokens

        console.log(
            [
                '',
                '=== MCP token footprint ===',
                `tools registered:    ${tools.length}`,
                `instructions:        ${instructionsTokens} tokens`,
                `tools/list payload:  ${toolsList} tokens`,
                `combined fixed cost: ${combined} tokens`,
                `budget:              ${TOKEN_BUDGET} tokens`,
                '',
                'Per tool (total / description / inputSchema / outputSchema):',
                ...rows.map(
                    (row) =>
                        `  ${pad(row.total, 5)}  ${pad(row.description, 4)}  ${pad(row.inputSchema, 5)}  ${pad(row.outputSchema, 5)}   ${row.name}`,
                ),
            ].join('\n'),
        )

        expect(combined).toBeLessThan(TOKEN_BUDGET)
    })
})
