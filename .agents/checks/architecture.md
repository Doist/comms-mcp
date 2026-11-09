# Check: architecture

Rules lint and types can't express. Report where a change works around one.

## Report

- A tool added or removed in some of the seven places "Adding a New Tool" in `AGENTS.md` lists, but not all: `src/utils/tool-names.ts`, the tool file and its test in `src/tools/`, `src/tool-registry.ts` (registration), `src/mcp-server.ts` (`instructions`, when the tool needs routing guidance), `src/index.ts` (`tools` and named exports), `scripts/run-tool.ts`, `src/tools/tool-annotations.test.ts`.
- A change to anything exported from `src/index.ts` (names, parameters, return shapes, `validateCommsToken`) in a PR not titled `feat!:` or `fix!:`. Other packages depend on it.
- Tool annotations that understate the worst case: a tool that can delete, archive or remove someone, marked `readOnlyHint: true` or `destructiveHint: false`.
- A tool that fails the whole call when one lookup among many fails, where `src/utils/degrade.ts` would return the rest.
- A tool calling the network other than through the `CommsApi` client passed to `execute`.
- A barrel file, or a helper that duplicates one in `src/utils/` or `src/mcp-helpers.ts`.
- A named helper written as a `const` arrow function (see "Code Style" in `AGENTS.md`).

## Fine

- Additive exports in `src/index.ts` in a `feat:` PR.
- What `src/tools/tool-annotations.test.ts` pins today, unless the change alters the tool's behaviour:
    - `openWorldHint: false` on every tool (`src/mcp-helpers.ts` sets it).
    - `destructiveHint: false` on `update-object` and `update-channel`, which edit content in place. Whether an edit counts as destructive is an open question for the owner, not a finding on every PR that touches them.
