import {
    buildProtectedResourceMetadata,
    getBearerToken,
    getHttpServerOptionsFromEnv,
    getOAuthProtectedResourceMetadataPath,
    startHttpServer,
} from '../http-server.js'

async function closeServer(server: Awaited<ReturnType<typeof startHttpServer>>) {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error)
            else resolve()
        })
    })
}

describe('HTTP MCP auth helpers', () => {
    it('parses bearer authorization headers', () => {
        expect(getBearerToken('Bearer tk_123')).toBe('tk_123')
        expect(getBearerToken('bearer tk_123')).toBe('tk_123')
        expect(getBearerToken('Basic tk_123')).toBeNull()
        expect(getBearerToken('Bearer')).toBeNull()
        expect(getBearerToken('Bearer tk_123 extra')).toBeNull()
    })

    it('builds OAuth protected-resource metadata for the MCP endpoint', () => {
        const metadata = buildProtectedResourceMetadata(new URL('https://mcp.example.com/mcp'))

        expect(metadata).toMatchObject({
            resource: 'https://mcp.example.com/mcp',
            authorization_servers: ['https://todoist.com'],
            bearer_methods_supported: ['header'],
            resource_name: 'Comms MCP',
        })
        expect(metadata.scopes_supported).toContain('comms:content:write')
    })

    it('uses the MCP path for protected-resource metadata discovery', () => {
        expect(getOAuthProtectedResourceMetadataPath('/mcp')).toBe(
            '/.well-known/oauth-protected-resource/mcp',
        )
        expect(getOAuthProtectedResourceMetadataPath('/')).toBe(
            '/.well-known/oauth-protected-resource',
        )
    })

    it('reads HTTP server options from environment variables', () => {
        const options = getHttpServerOptionsFromEnv({
            COMMS_BASE_URL: 'https://comms.staging.todoist.com',
            COMMS_MCP_HTTP_HOST: '0.0.0.0',
            COMMS_MCP_HTTP_PORT: '8787',
            COMMS_MCP_RESOURCE_URL: 'https://mcp.example.com/mcp',
        })

        expect(options).toEqual({
            baseUrl: 'https://comms.staging.todoist.com',
            host: '0.0.0.0',
            port: 8787,
            resourceUrl: new URL('https://mcp.example.com/mcp'),
        })
    })

    it('rejects invalid HTTP ports from environment variables', () => {
        expect(() => getHttpServerOptionsFromEnv({ COMMS_MCP_HTTP_PORT: 'nope' })).toThrow(
            'Invalid HTTP port: nope',
        )
    })

    it('serves health and OAuth metadata, and rejects unauthenticated MCP requests', async () => {
        const server = await startHttpServer({
            port: 0,
            resourceUrl: new URL('https://mcp.example.com/api/mcp'),
        })
        const address = server.address()
        if (typeof address !== 'object' || !address) throw new Error('Expected TCP server address')
        const baseUrl = `http://127.0.0.1:${address.port}`

        try {
            const health = await fetch(`${baseUrl}/health`)
            expect(health.status).toBe(200)
            await expect(health.json()).resolves.toEqual({ ok: true })

            const metadata = await fetch(`${baseUrl}/.well-known/oauth-protected-resource/api/mcp`)
            expect(metadata.status).toBe(200)
            await expect(metadata.json()).resolves.toMatchObject({
                resource: 'https://mcp.example.com/api/mcp',
                authorization_servers: ['https://todoist.com'],
            })

            const unauthenticated = await fetch(`${baseUrl}/mcp`, { method: 'POST' })
            expect(unauthenticated.status).toBe(401)
            expect(unauthenticated.headers.get('www-authenticate')).toBe(
                'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/api/mcp"',
            )
        } finally {
            await closeServer(server)
        }
    })
})
