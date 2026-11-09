import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { getMcpServer } from './mcp-server.js'
import { createCommsClient } from './usage-tracking.js'
import { TEST_IDS } from './utils/test-helpers.js'

const packageVersion = (
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
        version: string
    }
).version

const SESSION_USER_PATH = '/api/v1.0/users/get_session_user'
const WORKSPACES_PATH = '/api/v1.0/workspaces/get'
const WORKSPACE_USER_PATH = '/api/v1.0/workspace_users/getone'

// Raw API payloads, snake_case with Unix timestamps, as the SDK receives them.
const USER_PAYLOAD = {
    id: TEST_IDS.USER_1,
    full_name: 'Test User',
    short_name: 'Test',
    timezone: 'UTC',
    removed: false,
    email: 'test@example.com',
    lang: 'en',
}
const WORKSPACE_USER_PAYLOAD = {
    id: TEST_IDS.USER_1,
    full_name: 'Test User',
    short_name: 'Test',
    timezone: 'UTC',
    removed: false,
    user_type: 'USER',
    version: 1,
}
const WORKSPACE_PAYLOAD = {
    id: TEST_IDS.WORKSPACE_1,
    name: 'Test Workspace',
    creator: TEST_IDS.USER_1,
    created_ts: 1704067200,
    plan: 'free',
}

type ReceivedRequest = {
    path: string
    authorization: string | undefined
    userAgent: string | undefined
    doistPlatform: string | undefined
    doistVersion: string | undefined
    mcpTool: string | undefined
}

type FakeCommsApi = {
    baseUrl: string
    received: ReceivedRequest[]
    close: () => Promise<void>
}

/**
 * A Comms API on a local port, so requests go through the SDK's real transport. `respond`
 * gives each path's JSON body, and may wait before answering.
 */
async function startFakeCommsApi(
    respond: (path: string) => unknown | Promise<unknown>,
): Promise<FakeCommsApi> {
    const received: ReceivedRequest[] = []

    async function handle(request: IncomingMessage, response: ServerResponse) {
        function header(name: string) {
            return request.headers[name] as string | undefined
        }
        const path = new URL(request.url ?? '/', 'http://localhost').pathname
        received.push({
            path,
            authorization: header('authorization'),
            userAgent: header('user-agent'),
            doistPlatform: header('doist-platform'),
            doistVersion: header('doist-version'),
            mcpTool: header('mcp-tool'),
        })
        try {
            const body = await respond(path)
            response.writeHead(200, { 'Content-Type': 'application/json' })
            response.end(JSON.stringify(body))
        } catch (error) {
            // Fail the request rather than leave it hanging until the test times out.
            response.writeHead(500, { 'Content-Type': 'text/plain' })
            response.end(String(error))
        }
    }

    const server = createServer((request, response) => {
        void handle(request, response)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo

    return {
        baseUrl: `http://127.0.0.1:${port}`,
        received,
        async close() {
            // The SDK keeps connections alive, which would hold `close` open.
            server.closeAllConnections()
            await new Promise((resolve) => server.close(resolve))
        },
    }
}

function respondWithFixtures(path: string): unknown {
    switch (path) {
        case SESSION_USER_PATH:
            return USER_PAYLOAD
        case WORKSPACES_PATH:
            return [WORKSPACE_PAYLOAD]
        case WORKSPACE_USER_PATH:
            return WORKSPACE_USER_PAYLOAD
        default:
            throw new Error(`Unexpected request to ${path}`)
    }
}

async function connectClient(baseUrl: string) {
    const server = getMcpServer({ token: 'test-token', baseUrl })
    const client = new Client({ name: 'test-client', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
    return {
        client,
        async close() {
            await client.close()
            await server.close()
        },
    }
}

describe('usage-tracking headers', () => {
    let api: FakeCommsApi | undefined

    afterEach(async () => {
        await api?.close()
        api = undefined
    })

    it('tags a tool call’s request with the server, its version and the tool’s name', async () => {
        api = await startFakeCommsApi(respondWithFixtures)
        const { client, close } = await connectClient(api.baseUrl)

        try {
            const result = await client.callTool({ name: 'user-info', arguments: {} })
            expect(result.isError).toBeFalsy()
        } finally {
            await close()
        }

        expect(api.received).toEqual([
            {
                path: SESSION_USER_PATH,
                authorization: 'Bearer test-token',
                userAgent: `comms-mcp/${packageVersion}`,
                doistPlatform: 'mcp',
                doistVersion: packageVersion,
                mcpTool: 'user-info',
            },
        ])
    })

    it('names each tool on its own requests when tools run at the same time', async () => {
        // get-workspaces's workspace list is held until user-info has sent its request, so
        // get-workspaces makes its follow-up creator lookup while user-info is in flight.
        let sessionUserRequested: () => void = () => {}
        const userInfoStarted = new Promise<void>((resolve) => {
            sessionUserRequested = resolve
        })
        api = await startFakeCommsApi(async (path) => {
            if (path === SESSION_USER_PATH) sessionUserRequested()
            if (path === WORKSPACES_PATH) await userInfoStarted
            return respondWithFixtures(path)
        })
        const { client, close } = await connectClient(api.baseUrl)

        try {
            const results = await Promise.all([
                client.callTool({ name: 'get-workspaces', arguments: {} }),
                client.callTool({ name: 'user-info', arguments: {} }),
            ])
            expect(results.map((result) => result.isError ?? false)).toEqual([false, false])
        } finally {
            await close()
        }

        // The two calls' first requests may arrive in either order; what matters is the tool each
        // request names, so compare them sorted by path.
        const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path)
        expect(api.received.map(({ path, mcpTool }) => ({ path, mcpTool })).sort(byPath)).toEqual(
            [
                { path: WORKSPACES_PATH, mcpTool: 'get-workspaces' },
                { path: SESSION_USER_PATH, mcpTool: 'user-info' },
                { path: WORKSPACE_USER_PATH, mcpTool: 'get-workspaces' },
            ].sort(byPath),
        )
    })

    it('tags a request made outside any tool as unknown', async () => {
        api = await startFakeCommsApi(respondWithFixtures)

        await createCommsClient({
            token: 'test-token',
            baseUrl: api.baseUrl,
        }).users.getSessionUser()

        expect(api.received).toEqual([
            {
                path: SESSION_USER_PATH,
                authorization: 'Bearer test-token',
                userAgent: `comms-mcp/${packageVersion}`,
                doistPlatform: 'mcp',
                doistVersion: packageVersion,
                mcpTool: 'unknown',
            },
        ])
    })
})
