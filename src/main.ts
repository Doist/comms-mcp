#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import dotenv from 'dotenv'
import { getMcpServer } from './mcp-server.js'
import { buildServerOptions } from './utils/server-options.js'

function main() {
    const options = buildServerOptions()
    // stderr (stdout is reserved for the MCP protocol). Surfacing the
    // target up-front turns "why am I getting 403s" debugging into one
    // log line — staging vs prod tokens aren't cross-compatible.
    console.error(`Comms MCP targeting ${options.baseUrl ?? 'https://comms.todoist.com (default)'}`)
    const server = getMcpServer(options)
    const transport = new StdioServerTransport()
    server
        .connect(transport)
        .then(() => {
            console.error('Server started')
        })
        .catch((error) => {
            console.error('Error starting the Comms MCP server:', error)
            process.exit(1)
        })
}

dotenv.config({ quiet: true })
main()
