import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { getMcpServer } from './mcp-server.js'

const DEFAULT_HTTP_PORT = 3000
const DEFAULT_HTTP_HOST = '127.0.0.1'
const DEFAULT_MCP_PATH = '/mcp'
const TODOIST_AUTHORIZATION_SERVER = 'https://todoist.com'

const SCOPES_SUPPORTED = [
    'user:read',
    'user:write',
    'workspaces:read',
    'workspaces:write',
    'comms:channels:read',
    'comms:channels:write',
    'comms:channels:delete',
    'comms:content:read',
    'comms:content:write',
    'comms:content:delete',
    'comms:messages:read',
    'comms:messages:write',
    'comms:messages:delete',
]

type AuthenticatedRequest = IncomingMessage & { auth?: AuthInfo }

type HttpServerOptions = {
    baseUrl?: string
    host?: string
    path?: string
    port?: number
    resourceUrl?: URL
}

type HttpServerConfig = Required<Pick<HttpServerOptions, 'host' | 'path' | 'port'>> & {
    baseUrl?: string
    metadataUrl: URL
    resourceUrl: URL
}

function getBearerToken(authorization: string | undefined): string | null {
    if (!authorization) return null

    const [scheme, token, extra] = authorization.trim().split(/\s+/)
    if (scheme?.toLowerCase() !== 'bearer' || !token || extra) return null

    return token
}

function getOAuthProtectedResourceMetadataPath(path = DEFAULT_MCP_PATH): string {
    return `/.well-known/oauth-protected-resource${path === '/' ? '' : path}`
}

function buildProtectedResourceMetadata(resourceUrl: URL) {
    return {
        resource: resourceUrl.toString(),
        authorization_servers: [TODOIST_AUTHORIZATION_SERVER],
        bearer_methods_supported: ['header'],
        scopes_supported: SCOPES_SUPPORTED,
        resource_name: 'Comms MCP',
    }
}

function parsePort(value: string | undefined, fallback = DEFAULT_HTTP_PORT): number {
    if (!value) return fallback

    const port = Number(value)
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        throw new Error(`Invalid HTTP port: ${value}`)
    }

    return port
}

function getLocalResourceUrl(host: string, port: number, path: string): URL {
    const advertisedHost = host === '0.0.0.0' || host === '::' ? DEFAULT_HTTP_HOST : host
    const formattedHost = advertisedHost.includes(':') ? `[${advertisedHost}]` : advertisedHost

    return new URL(path, `http://${formattedHost}:${port}`)
}

function getHttpServerOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): HttpServerOptions {
    return {
        baseUrl: env.COMMS_BASE_URL,
        host: env.COMMS_MCP_HTTP_HOST ?? DEFAULT_HTTP_HOST,
        port: parsePort(env.COMMS_MCP_HTTP_PORT ?? env.PORT),
        resourceUrl: env.COMMS_MCP_RESOURCE_URL ? new URL(env.COMMS_MCP_RESOURCE_URL) : undefined,
    }
}

function getHttpServerConfig(options: HttpServerOptions): HttpServerConfig {
    const host = options.host ?? DEFAULT_HTTP_HOST
    const path = options.path ?? DEFAULT_MCP_PATH
    const port = options.port ?? DEFAULT_HTTP_PORT
    const resourceUrl = options.resourceUrl ?? getLocalResourceUrl(host, port, path)
    const metadataUrl = new URL(
        getOAuthProtectedResourceMetadataPath(resourceUrl.pathname),
        resourceUrl.origin,
    )

    return { baseUrl: options.baseUrl, host, metadataUrl, path, port, resourceUrl }
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers = {}) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        ...headers,
    })
    res.end(JSON.stringify(body))
}

function sendUnauthorized(res: ServerResponse, metadataUrl: URL) {
    sendJson(
        res,
        401,
        { error: 'invalid_token', error_description: 'Missing or invalid bearer token.' },
        { 'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl.toString()}"` },
    )
}

function isMetadataPath(pathname: string, mcpPath: string, resourcePath: string): boolean {
    return (
        pathname === '/.well-known/oauth-protected-resource' ||
        pathname === getOAuthProtectedResourceMetadataPath(mcpPath) ||
        pathname === getOAuthProtectedResourceMetadataPath(resourcePath)
    )
}

function logHttpError(message: string, error: unknown) {
    const errorInfo =
        error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { message: String(error) }

    console.error(JSON.stringify({ level: 'error', message, error: errorInfo }))
}

async function handleMcpRequest(
    req: AuthenticatedRequest,
    res: ServerResponse,
    config: HttpServerConfig,
) {
    const token = getBearerToken(req.headers.authorization)
    if (!token) {
        sendUnauthorized(res, config.metadataUrl)
        return
    }

    req.auth = {
        token,
        clientId: 'todoist-oauth',
        scopes: [],
        resource: config.resourceUrl,
    }

    const mcpServer = getMcpServer({ commsApiKey: token, baseUrl: config.baseUrl })
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

    const close = () => {
        void transport.close()
        void mcpServer.close()
    }
    res.on('close', close)

    await mcpServer.connect(transport)
    await transport.handleRequest(req, res)
}

async function handleHttpRequest(
    req: AuthenticatedRequest,
    res: ServerResponse,
    config: HttpServerConfig,
) {
    const url = new URL(req.url ?? '/', config.resourceUrl.origin)

    if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true })
        return
    }

    if (
        req.method === 'GET' &&
        isMetadataPath(url.pathname, config.path, config.resourceUrl.pathname)
    ) {
        sendJson(res, 200, buildProtectedResourceMetadata(config.resourceUrl))
        return
    }

    if (url.pathname !== config.path) {
        sendJson(res, 404, { error: 'not_found' })
        return
    }

    if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' })
        return
    }

    try {
        await handleMcpRequest(req, res, config)
    } catch (error) {
        logHttpError('Error handling MCP HTTP request', error)
        if (!res.headersSent) {
            sendJson(res, 500, {
                jsonrpc: '2.0',
                error: { code: -32603, message: 'Internal server error' },
                id: null,
            })
        }
    }
}

function startHttpServer(options: HttpServerOptions = {}): Promise<Server> {
    const config = getHttpServerConfig(options)
    const server = createServer((req, res) => {
        void handleHttpRequest(req, res, config)
    })

    return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(config.port, config.host, () => {
            server.off('error', reject)
            resolve(server)
        })
    })
}

export {
    buildProtectedResourceMetadata,
    getBearerToken,
    getHttpServerOptionsFromEnv,
    getOAuthProtectedResourceMetadataPath,
    startHttpServer,
}
export type { HttpServerOptions }
