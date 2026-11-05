# Check: tool surface

What models see: tool names, descriptions, input and output schemas, the `instructions` string in `src/mcp-server.ts`. Every change here reaches every client.

## Report

- A changed tool or field description, or `instructions` text, without the before and after text and a reason in the description. Nothing measures how models read it, so a reviewer has to.
- A description that contradicts the tool's behaviour or another tool's description, or the `instructions` naming a tool or field that no longer exists.
- A renamed or removed tool, or a renamed input field, without a breaking-change PR title. Clients and saved prompts call them by name.
- An output schema that no longer matches what `src/tool-schema-dialect.test.ts` expects clients to see.

## Fine

- Wording fixes inside one description, with the reason stated.
