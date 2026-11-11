# Check: architecture

Rules lint and types can't express. Report where a change works around one.

## Report

- A tool added or removed in some of the seven places "Adding a New Tool" in `AGENTS.md` lists, but not all: `src/utils/tool-names.ts`, the tool file and its test in `src/tools/`, `src/tool-registry.ts` (registration), `src/mcp-server.ts` (`instructions`, when the tool needs routing guidance), `src/index.ts` (`tools` and named exports), `scripts/run-tool.ts`, `src/tools/tool-annotations.test.ts`.
- A change to anything exported from `src/index.ts` (names, parameters, return shapes, `validateCommsToken`) in a PR not titled `feat!:` or `fix!:`. Other packages depend on it.
- Tool annotations that understate the worst case: a tool that can delete, archive, remove someone or overwrite existing content in place (a thread, comment or message body, a channel's name, description or visibility), marked `readOnlyHint: true` or `destructiveHint: false`. The previous value is gone after an edit, so an edit counts as destructive.
- A tool that fails the whole call when one lookup among many fails, where `src/utils/degrade.ts` would return the rest.
- A tool calling the network other than through the `CommsApi` client passed to `execute`.
- A barrel file, or a helper that duplicates one in `src/utils/` or `src/mcp-helpers.ts`.
- A named helper written as a `const` arrow function (see "Code Style" in `AGENTS.md`).

## Fine

- Additive exports in `src/index.ts` in a `feat:` PR.
- `openWorldHint: false` on every tool, as `src/tools/tool-annotations.test.ts` pins it (`src/mcp-helpers.ts` sets it), unless the change alters the tool's behaviour.
