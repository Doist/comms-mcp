import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { z } from 'zod'
import { tools as registeredTools } from './index.js'
import { getMcpServer } from './mcp-server.js'
import { ToolNames } from './utils/tool-names.js'

const JSON_SCHEMA_2020_12 = 'https://json-schema.org/draft/2020-12/schema'

describe('advertised tool schema dialects', () => {
    it.each([1, 2])('matches direct JSON Schema 2020-12 conversion on server %i', async () => {
        const server = getMcpServer({ commsApiKey: 'test-token' })
        const client = new Client({ name: 'schema-dialect-test', version: '1.0.0' })
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

        try {
            const { tools } = await client.listTools()

            expect(tools).toHaveLength(Object.values(ToolNames).length)
            const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))
            for (const definition of Object.values(registeredTools)) {
                const advertised = toolsByName.get(definition.name)
                expect(advertised?.inputSchema).toEqual(
                    z.toJSONSchema(z.object(definition.parameters), {
                        target: 'draft-2020-12',
                        io: 'input',
                    }),
                )
                expect(advertised?.outputSchema).toEqual(
                    z.toJSONSchema(z.object(definition.outputSchema), {
                        target: 'draft-2020-12',
                        io: 'output',
                    }),
                )
            }
            for (const tool of tools) {
                expect(tool.inputSchema.$schema).toBe(JSON_SCHEMA_2020_12)
                expect(tool.outputSchema?.$schema).toBe(JSON_SCHEMA_2020_12)
            }
        } finally {
            await client.close()
            await server.close()
        }
    })
})
