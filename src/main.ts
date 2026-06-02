#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import dotenv from 'dotenv'
import { getHttpServerOptionsFromEnv, startHttpServer } from './http-server.js'
import { getMcpServer } from './mcp-server.js'

async function startStdioServer() {
    const commsApiKey = process.env.COMMS_API_KEY
    if (!commsApiKey) {
        throw new Error('COMMS_API_KEY is not set')
    }

    const server = getMcpServer({ commsApiKey, baseUrl: process.env.COMMS_BASE_URL })
    const transport = new StdioServerTransport()
    await server.connect(transport)
    // We use console.error because standard I/O is being used for the MCP server communication.
    console.error('Server started')
}

async function main() {
    const transport = process.env.COMMS_MCP_TRANSPORT ?? 'stdio'
    if (transport === 'stdio') {
        await startStdioServer()
        return
    }

    if (transport !== 'http') {
        throw new Error(`Unsupported COMMS_MCP_TRANSPORT: ${transport}`)
    }

    const options = getHttpServerOptionsFromEnv()
    await startHttpServer(options)
    console.error(
        JSON.stringify({
            level: 'info',
            message: 'HTTP server started',
            host: options.host,
            port: options.port,
        }),
    )
}

dotenv.config({ quiet: true })
main().catch((error) => {
    console.error('Error starting the Comms MCP server:', error)
    process.exit(1)
})
