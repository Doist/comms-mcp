import { describeTokenFootprint } from '@doist/mcp-core/testing'
import { encode } from 'gpt-tokenizer'
import { getMcpServer } from './mcp-server.js'

/**
 * Budget for the fixed cost every session pays before a tool runs: the `tools/list` payload
 * plus the `instructions` block. Treat it as a ratchet rather than headroom: it should move down
 * over time, and a rise needs justifying in the PR that causes it. Override it with
 * `MCP_TOKEN_BUDGET=NNNN` to experiment without editing the source; `npm run verify` ignores it.
 */
const DEFAULT_TOKEN_BUDGET = 14_000

describeTokenFootprint({
    createServer: () => getMcpServer({ token: 'test-token' }),
    countTokens: (text) => encode(text).length,
    budget: Number(process.env.MCP_TOKEN_BUDGET ?? DEFAULT_TOKEN_BUDGET),
})
