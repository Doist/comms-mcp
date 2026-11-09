import { readFileSync } from 'node:fs'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { getMcpServer } from './mcp-server.js'

const packageVersion = (
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
        version: string
    }
).version

describe('getMcpServer', () => {
    it('reports the package version to clients', async () => {
        const server = getMcpServer({ token: 'test-token' })
        const client = new Client({ name: 'test-client', version: '1.0.0' })
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

        try {
            expect(client.getServerVersion()).toMatchObject({
                name: 'comms-mcp-server',
                version: packageVersion,
            })
        } finally {
            await client.close()
            await server.close()
        }
    })
})
