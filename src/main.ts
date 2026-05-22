#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import dotenv from 'dotenv'
import { getMcpServer } from './mcp-server.js'

function main() {
    const commsApiKey = process.env.COMMS_API_KEY
    if (!commsApiKey) {
        throw new Error('COMMS_API_KEY is not set')
    }

    const server = getMcpServer({ commsApiKey })
    const transport = new StdioServerTransport()
    server
        .connect(transport)
        .then(() => {
            // We use console.error because standard I/O is being used for the MCP server communication.
            console.error('Server started')
        })
        .catch((error) => {
            console.error('Error starting the Comms MCP server:', error)
            process.exit(1)
        })
}

dotenv.config({ quiet: true })
main()
