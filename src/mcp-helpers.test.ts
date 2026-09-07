import type { CommsApi } from '@doist/comms-sdk'
import { jest } from '@jest/globals'
import type { McpServer, StandardSchemaWithJSON } from '@modelcontextprotocol/server'
import { z } from 'zod'
import type { CommsTool } from './comms-tool.js'
import { registerTool } from './mcp-helpers.js'

function buildTool() {
    return {
        name: 'schema-tool',
        description: 'Tool with cached schemas',
        parameters: { limit: z.number().default(10), date: z.string().pipe(z.iso.date()) },
        outputSchema: { date: z.string().pipe(z.iso.date()) },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
        execute: jest.fn<CommsTool<z.ZodRawShape>['execute']>(),
    }
}

function captureRegistration(tool: ReturnType<typeof buildTool>, client = {} as CommsApi) {
    const mock = jest.fn<McpServer['registerTool']>()
    registerTool(tool, { registerTool: mock } as unknown as McpServer, client)
    const registration = mock.mock.calls[0]!
    return {
        input: registration[1].inputSchema as StandardSchemaWithJSON<unknown, unknown>,
        output: registration[1].outputSchema as StandardSchemaWithJSON<unknown, unknown>,
        callback: registration[2],
    }
}

describe('cached tool schemas', () => {
    const options = { target: 'draft-2020-12' as const }

    it('reuses input and output conversions across servers and preserves validation', async () => {
        const tool = buildTool()
        const first = captureRegistration(tool)
        const second = captureRegistration(tool)
        expect(first.input).toBe(second.input)
        expect(first.output).toBe(second.output)
        expect(first.input).not.toBe(first.output)
        for (const side of ['input', 'output'] as const) {
            const convert = first[side]['~standard'].jsonSchema[side]
            expect(convert(options)).toBe(convert(options))
        }
        expect(await first.input['~standard'].validate({ date: '2026-09-06' })).toEqual({
            value: { limit: 10, date: '2026-09-06' },
        })
        expect(await first.input['~standard'].validate({ date: 'invalid' })).toHaveProperty(
            'issues',
        )
        expect(await first.output['~standard'].validate({ date: 'invalid' })).toHaveProperty(
            'issues',
        )
        expect(captureRegistration(buildTool()).input).not.toBe(first.input)
    })

    it('preserves both conversion directions and delegates custom options', () => {
        const tool = buildTool()
        const config = captureRegistration(tool)
        for (const side of ['input', 'output'] as const) {
            const schema = z.object(side === 'input' ? tool.parameters : tool.outputSchema)
            for (const io of ['input', 'output'] as const) {
                const convert = config[side]['~standard'].jsonSchema[io]
                expect(convert(options)).toEqual(z.toJSONSchema(schema, { ...options, io }))
                expect(convert({ target: 'draft-07' })).toEqual(
                    z.toJSONSchema(schema, { target: 'draft-07', io }),
                )
                expect(
                    convert({
                        ...options,
                        libraryOptions: {
                            override: (context: { jsonSchema: Record<string, unknown> }) => {
                                context.jsonSchema.description = 'custom conversion'
                            },
                        },
                    }).description,
                ).toBe('custom conversion')
            }
        }
    })

    it('keeps execution clients isolated when servers share schemas', async () => {
        const tool = buildTool()
        tool.execute.mockResolvedValue({ content: [] })
        const firstClient = {} as CommsApi
        const secondClient = {} as CommsApi
        const first = captureRegistration(tool, firstClient)
        const second = captureRegistration(tool, secondClient)
        const args = { limit: 10, date: '2026-09-06' }
        // The callback does not use the SDK request context.
        const context = {} as Parameters<typeof first.callback>[1]
        await first.callback(args, context)
        await second.callback(args, context)
        expect(tool.execute.mock.calls).toEqual([
            [args, firstClient],
            [args, secondClient],
        ])
    })
})
