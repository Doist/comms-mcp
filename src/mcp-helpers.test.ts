import type { CommsApi } from '@doist/comms-sdk'
import type { McpServer, StandardSchemaWithJSON } from '@modelcontextprotocol/server'
import { vi } from 'vitest'
import { z } from 'zod'
import type { CommsTool } from './comms-tool.js'
import { registerTools } from './mcp-helpers.js'

function buildTool() {
    return {
        name: 'schema-tool',
        description: 'Tool with cached schemas',
        parameters: { limit: z.number().default(10), date: z.string().pipe(z.iso.date()) },
        outputSchema: { date: z.string().pipe(z.iso.date()) },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
        execute: vi.fn<CommsTool<z.ZodRawShape>['execute']>(),
    }
}

function captureRegistration(tool: ReturnType<typeof buildTool>, client = {} as CommsApi) {
    const mock = vi.fn<McpServer['registerTool']>()
    registerTools({
        tools: [tool],
        server: { registerTool: mock } as unknown as McpServer,
        client,
    })
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

    it('logs a failing tool without its arguments, which carry message content', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const tool = buildTool()
        const failure = new Error('Thread not found')
        tool.execute.mockRejectedValue(failure)
        const { callback } = captureRegistration(tool)
        const args = { limit: 10, date: '2026-09-06', content: 'Private plans for the offsite' }
        const context = {} as Parameters<typeof callback>[1]

        const result = await callback(args, context)

        expect(result).toEqual({
            content: [{ type: 'text', text: 'Thread not found' }],
            isError: true,
        })
        expect(consoleError).toHaveBeenCalledWith('Error executing tool schema-tool:', failure)
        expect(JSON.stringify(consoleError.mock.calls)).not.toContain('Private plans')
        consoleError.mockRestore()
    })

    it('keeps execution clients isolated when servers share schemas', async () => {
        const tool = buildTool()
        tool.execute.mockResolvedValue({})
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

describe('result content', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.resetModules()
    })

    // USE_STRUCTURED_CONTENT and NODE_ENV are read when mcp-helpers loads, so each case stubs them
    // and imports a fresh copy.
    async function callWithEnv(env: Record<string, string>) {
        for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
        vi.resetModules()
        const { registerTools: freshRegisterTools } = await import('./mcp-helpers.js')
        const mock = vi.fn<McpServer['registerTool']>()
        freshRegisterTools({
            tools: [
                {
                    name: 'find-thing',
                    description: 'Finds a thing.',
                    parameters: {},
                    outputSchema: { id: z.string(), note: z.string().optional() },
                    annotations: {
                        readOnlyHint: true,
                        destructiveHint: false,
                        idempotentHint: true,
                    },
                    execute: async () => ({
                        textContent: 'Found thing t1.',
                        structuredContent: { id: 't1', note: null as unknown as undefined },
                    }),
                },
            ],
            server: { registerTool: mock } as unknown as McpServer,
            client: {} as CommsApi,
        })
        const callback = mock.mock.calls[0]![2] as (args: object, ctx: object) => Promise<unknown>
        return callback({}, {})
    }

    it('sends the payload as JSON first and the summary last when clients may ignore structuredContent', async () => {
        expect(await callWithEnv({ NODE_ENV: 'production', USE_STRUCTURED_CONTENT: '' })).toEqual({
            content: [
                { type: 'text', text: '{"id":"t1"}' },
                { type: 'text', text: 'Found thing t1.' },
            ],
            structuredContent: { id: 't1' },
        })
    })

    it('sends the summary alone when USE_STRUCTURED_CONTENT is on', async () => {
        expect(
            await callWithEnv({ NODE_ENV: 'production', USE_STRUCTURED_CONTENT: 'true' }),
        ).toEqual({
            content: [{ type: 'text', text: 'Found thing t1.' }],
            structuredContent: { id: 't1' },
        })
    })
})
