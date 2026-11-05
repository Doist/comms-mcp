---
name: write-tests
description: Writes or changes tests in this repository to its quality bar, with the right helpers and layer. Use when adding, fixing or reviewing tests, when a change "needs a test", or when deciding whether a test may change.
---

# Write tests

## Where tests live

- Next to the code: `src/tools/reply.ts` → `src/tools/reply.test.ts`. Vitest, globals on (`vi` is imported from `vitest`).
- Tool tests call `<tool>.execute(args, mockCommsApi)`. The mock is `vi.mocked({ ... } as unknown as CommsApi, true)` with only the methods the tool uses (`true` makes it deep, since `CommsApi` is nested: `api.threads.getThread`). Clear it in `beforeEach` with `vi.clearAllMocks()`.
- Contract tests check every registered tool: `src/tools/tool-annotations.test.ts` (annotations) and `src/tool-schema-dialect.test.ts` (the schemas a real client sees). `src/mcp-helpers.test.ts` covers `registerTool` itself.
- Agent tooling tests live in `.agents/scripts/` and run copies of the tools in throwaway repos (`.agents/scripts/lib/test-repo.ts`).

## Helpers

From `src/utils/test-helpers.ts`: `createMockChannel`, `createMockThread`, `createMockComment`, `createMockConversation`, `createMockConversationMessage`, `createMockUser`, `createMockWorkspace`, `usersByIds`, `extractTextContent`, `extractStructuredContent`, `TEST_ERRORS`, `TEST_IDS`, `TODAY`. Use them instead of building objects by hand; extend them when a test needs a new shape.

## The quality bar

Read [references/test-rules.md](references/test-rules.md) before writing or reviewing a test. In short: a test counts only if it can fail. It asserts outcomes, takes expected values from outside the code under test, mocks only real boundaries, and you saw it fail once.

Done when each new test has failed once for the right reason, and then passes.

## When an existing test may change

- **The behaviour changed on purpose** (a feature or a fix): change the assertions that describe it, and say which in the report.
- **A refactor:** only how the test reaches the code (imports, names, call sites). Never its inputs, assertions or snapshots.
- **A snapshot changed:** read the diff line by line before `npx vitest run <file> -u`; never update every snapshot at once. It is model-facing text; every change reaches users.
- **Never** to make a failing check pass without a behaviour change: no `.skip`, no deleted test, no looser matcher.
