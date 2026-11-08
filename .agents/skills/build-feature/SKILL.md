---
name: build-feature
description: Builds a new tool, parameter or behaviour in thin test-first slices, after settling the open decisions with the owner. Use when asked to "add", "build", "implement", "support" or "create" something, such as a new tool or a new tool parameter.
---

# Build a feature

## 1. Read the closest existing feature

Find the tool most like the one you are building and read it with its test: `src/tools/create-thread.ts` for a create, `src/tools/fetch-inbox.ts` for a read, `src/tools/update-object.ts` for an update, `src/tools/mark-done.ts` for an action on several items. Read "Adding a New Tool" in `AGENTS.md`. Done when you can name the file you will copy patterns from.

## 2. Settle decisions in one round

List what the request leaves open: naming, input shape, what to return, error cases, who gets notified, annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), and the line it needs in the `instructions` in `src/mcp-server.ts`. Ask the owner all of them at once, each with your recommendation. Don't ask what the code can answer. Done when every decision has an answer.

## 3. Write "done" as checkable behaviours

Write each behaviour as an input and the expected output, for example: "`reply` to a conversation with `notifyAudience` set throws `notifyAudience can only be used when replying to a thread.`". Each becomes a test. Done when a test could pass or fail on every one.

## 4. Build in thin slices, test first

For each behaviour: write its test at the public interface (`<tool>.execute(args, mockCommsApi)`), see it fail, make it pass, run its test file. Follow `write-tests`. Done when every behaviour from step 3 has a passing test you saw fail.

## 5. Update everything the change touches

| You changed                     | Also update                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Added a tool                    | Every place in "Adding a New Tool" in `AGENTS.md`: `src/utils/tool-names.ts`, `src/mcp-server.ts`, `src/index.ts`, `scripts/run-tool.ts`, `src/tools/tool-annotations.test.ts` |
| Annotations                     | `src/tools/tool-annotations.test.ts` pins every tool's hints; the type is `RequiredToolAnnotations` from `@doist/mcp-core`                                                     |
| A clearable optional field      | Test setting it and clearing it ("Testing Requirements" in `AGENTS.md`); describe the clearing value in the schema                                                             |
| Tool or field descriptions      | Nothing measures how models read them: show the before and after text in the PR                                                                                                |
| Output schemas                  | `src/utils/output-schemas.ts`; `src/tool-schema-dialect.test.ts` checks what clients see                                                                                       |
| A lookup that may fail per item | `src/utils/degrade.ts` (`degradeWithLog`, `degradeAllWithLog`) rather than failing the whole call                                                                              |
| Cross-tool routing              | The `instructions` string in `src/mcp-server.ts`                                                                                                                               |

Done when each row that applies is handled.

## 6. Verify and report

Follow `verify`. If the feature needs restructuring first, do that as a separate change with `refactor`.
