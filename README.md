# Comms MCP & AI Tools

MCP server and importable AI tools for the Doist Comms API. Use the
tools through an MCP server, or import them directly to plug Comms into
your own AI conversational interface.

## Using the tools

### 1. Install

```sh
npm install @doist/comms-mcp
```

### 2. Plug them into an AI

Example with [Vercel's AI SDK](https://ai-sdk.dev/docs/ai-sdk-core/generating-text#streamtext):

```js
import { fetchInbox, reply, markDone } from '@doist/comms-mcp'
import { streamText } from 'ai'

const result = streamText({
    model: yourModel,
    system: 'You are a helpful Comms assistant',
    tools: {
        fetchInbox,
        reply,
        markDone,
    },
})
```

## Using as an MCP server

### Quick start

```bash
npx @doist/comms-mcp
```

### Setup

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
    "mcpServers": {
        "comms": {
            "command": "npx",
            "args": ["-y", "@doist/comms-mcp"],
            "env": {
                "COMMS_API_KEY": "your-comms-api-key-here"
            }
        }
    }
}
```

#### Cursor

`~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per-project):

```json
{
    "mcpServers": {
        "comms": {
            "command": "npx",
            "args": ["-y", "@doist/comms-mcp"],
            "env": {
                "COMMS_API_KEY": "your-comms-api-key-here"
            }
        }
    }
}
```

#### Claude Code (CLI)

```bash
claude mcp add comms npx @doist/comms-mcp
export COMMS_API_KEY=your-comms-api-key-here
```

#### Visual Studio Code

1. Command Palette → MCP: Add Server
2. Configure:

```json
{
    "servers": {
        "comms": {
            "command": "npx",
            "args": ["-y", "@doist/comms-mcp"],
            "env": {
                "COMMS_API_KEY": "your-comms-api-key-here"
            }
        }
    }
}
```

### Targeting a non-production deployment

By default the server talks to `https://comms.todoist.com`. To point at
staging or a custom deployment, also set `COMMS_BASE_URL`:

```json
"env": {
    "COMMS_API_KEY": "your-comms-api-key-here",
    "COMMS_BASE_URL": "https://comms.staging.todoist.com"
}
```

### Getting a Comms API key

Generate a personal API token from the Comms app console, then export
it as `COMMS_API_KEY` (or paste it into the MCP client config above).

### HTTP bearer-token mode

The default transport is stdio for local MCP clients. To run an HTTP MCP
resource server that accepts per-request bearer tokens:

```bash
COMMS_MCP_TRANSPORT=http npx @doist/comms-mcp
```

HTTP mode listens on `127.0.0.1:3000` by default, serves MCP at `/mcp`,
and requires `Authorization: Bearer <token>`. Configure
`TODOIST_ID_HOST` and `TODOIST_ID_API_KEY` so the server can introspect
Todoist OAuth tokens before forwarding them to Comms. Todoist ID
network errors and 5xx responses defer to Comms, preserving the original
bearer token.

It also serves OAuth protected-resource metadata at
`/.well-known/oauth-protected-resource` and
`/.well-known/oauth-protected-resource/mcp`.

## Features

The tools are intentionally workflow-shaped rather than 1:1 wrappers
around API endpoints, so an LLM can complete a useful action with a
small number of calls.

### Available tools

- **userInfo** — Information about the current user and their workspaces
- **fetchInbox** — Threads and conversations from the inbox
- **loadThread** — Load a thread with its comments
- **loadConversation** — Load a conversation with its messages
- **searchContent** — Search a workspace for threads, comments, and messages
- **getMentions** — Threads, comments, and messages mentioning the current user
- **create-channel** / **update-channel** — Create or update workspace channels through MCP
- **createThread** — Start a new channel thread. Accepts an optional `displayInInbox` boolean (default `false`). When `true`, the thread is unarchived after creation so it appears in the author's Inbox. See also [COMMS_CREATE_THREAD_DISPLAY_IN_INBOX](#environment-variables).
- **updateObject** / **deleteObject** — Edit or remove a thread, comment, or message
- **reply** — Reply to a thread or conversation
- **react** — Add a reaction to a thread, comment, conversation, or message
- **markDone** — Mark threads or conversations as read and/or archived
- **buildLink** — Build URLs to Comms resources
- **listChannels** / **getGroups** / **getUsers** / **getWorkspaces** — Discovery helpers

For details, see [src/tools](src/tools).

## Environment Variables

| Variable                               | Default            | Description                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMMS_API_KEY`                        | _(required stdio)_ | Your Comms API key for stdio mode. HTTP mode reads the bearer token from each request instead.                                                                                                                                                                                                                               |
| `COMMS_MCP_TRANSPORT`                  | `stdio`            | Set to `http` to run the Streamable HTTP server.                                                                                                                                                                                                                                                                             |
| `COMMS_MCP_HTTP_HOST`                  | `127.0.0.1`        | Host for HTTP mode.                                                                                                                                                                                                                                                                                                          |
| `COMMS_MCP_HTTP_PORT`                  | `3000`             | Port for HTTP mode. `PORT` is also accepted.                                                                                                                                                                                                                                                                                 |
| `COMMS_MCP_RESOURCE_URL`               | local `/mcp` URL   | Public MCP resource URL advertised in OAuth protected-resource metadata.                                                                                                                                                                                                                                                     |
| `TODOIST_ID_HOST`                      | _(required HTTP)_  | Todoist ID service URL used to introspect OAuth bearer tokens in HTTP mode.                                                                                                                                                                                                                                                  |
| `TODOIST_ID_API_KEY`                   | _(required HTTP)_  | Todoist ID service API key used for the introspection request.                                                                                                                                                                                                                                                               |
| `COMMS_CREATE_THREAD_DISPLAY_IN_INBOX` | `false`            | Set to `true` to unarchive every newly-created thread so it appears in the author's Inbox, without needing to pass `displayInInbox: true` on each call. **Only takes effect when running the MCP locally.** The remote/hosted MCP does not have this variable set and will use the per-call `displayInInbox` parameter only. |

## Dependencies

- MCP server uses the official [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- Comms TypeScript SDK [@doist/comms-sdk](https://github.com/Doist/comms-sdk-typescript)

## Local development

### Prerequisites

- Node.js 18+
- npm
- A Comms API token

### Setup

```bash
git clone https://github.com/Doist/comms-mcp.git
cd comms-mcp
npm install
cp .env.example .env  # then add your COMMS_API_KEY
npm run build
```

### Commands

- `npm start` — Build and run the MCP inspector
- `npm run dev` — Watch mode with auto-restart
- `npm test` — Jest
- `npm run type-check` — TypeScript
- `npm run format:check` / `npm run format:fix` — oxlint + oxfmt

### Running a single tool directly

```bash
npx tsx scripts/run-tool.ts user-info '{}'
npx tsx scripts/run-tool.ts --list
```

## Contributing

1. Tests pass (`npm test`)
2. Types pass (`npm run type-check`)
3. Lint & format pass (`npm run format:check`)

Use [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `test:`, `chore:`.

## License

MIT
