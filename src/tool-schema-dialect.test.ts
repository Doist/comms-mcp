import { describeAdvertisedToolSchemas } from '@doist/mcp-core/testing'
import { getMcpServer } from './mcp-server.js'
import { registeredTools } from './tool-registry.js'

// Every registered tool is advertised once, with JSON Schema 2020-12 schemas that match a direct
// Zod conversion of its own shapes. Each test builds a fresh server, so the shared schema cache is
// exercised across servers too.
describeAdvertisedToolSchemas({
    tools: registeredTools,
    createServer: () => getMcpServer({ commsApiKey: 'test-token' }),
})
