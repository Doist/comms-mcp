# Test rules

Calibrated on this repository's tests (315 in 28 files under `src/`, November 2026). Each rule says what to flag and what is fine, because a rule that flags good tests teaches agents to damage them.

## 1. It can fail

You saw the test fail once: before the fix, or with the feature undone. A test that has never failed may be testing nothing. A reviewer can't see this in the code: ask the author for the failing run, and list it as not verified if there is none.

## 2. It asserts outcomes

Assert what the caller gets or what reaches the API: `toHaveBeenCalledWith(<exact args>)`, `structuredContent` fields, the text. Flag an assertion that cannot tell right from wrong.

| Flag                                                                                                                                                                                                                                | Fine                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `toHaveBeenCalled()` or `toHaveBeenCalledTimes(n)` as the only evidence the behaviour happened: nothing checks which arguments reached the API (`src/tools/mark-done.test.ts:73` counts three `archiveThread` calls, never the IDs) | `toHaveBeenCalledTimes(n)` next to `toHaveBeenCalledWith` on the same call (`src/tools/list-channels.test.ts:247`)                          |
|                                                                                                                                                                                                                                     | `.not.toHaveBeenCalled()`: proves a call did **not** happen (about 40 in this repo, e.g. `src/tools/create-thread.test.ts:56`)              |
| `toBeDefined()` / `toBeTruthy()` as the last word on a value                                                                                                                                                                        | The same as a guard right before reading the value's fields (`src/tools/get-mentions.test.ts:54`, `src/tools/tool-annotations.test.ts:198`) |
| `expect.any(...)` where the input fixes the exact value (`src/tools/fetch-inbox.test.ts:217` accepts any `Date` for a given `sinceDate`)                                                                                            | `expect.any(...)` for a value the test cannot know, such as a generated ID, or a time taken from the clock                                  |
| `expect.objectContaining` that leaves out the field the test is about                                                                                                                                                               | `expect.objectContaining` around the fields the test is about, leaving out the rest (about a dozen in `src/tools/fetch-inbox.test.ts`)      |
| A test whose only assertion is that no error was thrown, when the behaviour is a result                                                                                                                                             | `rejects.toThrow('<message>')`: the error **is** the behaviour                                                                              |

Judge a test by its point, the behaviour its name describes. A weak assertion beside the ones that carry that point is fine.

## 3. Expected values come from outside the code under test

Write the expected value out as literals (a lookup table or `it.each` rows are fine), or build it from fixtures (`TEST_IDS`, `createMock*`). Flag an expectation that calls the code under test, or recomputes the answer the way the code does (the same arithmetic, string building or mapping function). A helper the code uses to build its answer counts as the code under test, even when it lives in another file.

## 4. Mock only real boundaries

The real boundary here is the Comms API: the `vi.mocked(..., true)` `CommsApi` passed to `execute`. Others: `console` (`vi.spyOn(console, 'error')` in `src/utils/degrade.test.ts`) and the clock.

| Flag                                                                            | Fine                                                                                      |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Any `vi.mock` of an internal module. There are none today; keep it that way     | A real MCP client and server over `InMemoryTransport` (`src/tool-schema-dialect.test.ts`) |
| Mocking the function the test is about, or one that computes its expected value | A stub function passed in as an argument (`src/utils/degrade.test.ts`)                    |

## 5. No skipped or focused tests

None exist today. `.only` fails in CI (`CI=true`, which `npm run verify` sets too). Don't add `.skip`, `.todo` or `xit` to get green.

## 6. No fixed sleeps

None exist today. Use fake timers (`vi.useFakeTimers`) or wait on the event, not `setTimeout`.

## 7. Snapshots only for model-facing text

`toMatchSnapshot()` on `extractTextContent(result)` is fine: that text is what the model reads, and its exact wording matters. All 60 snapshots here are of that kind. It must sit next to assertions on `structuredContent` or the API call, so the behaviour is not only in the snapshot (`src/tools/reply.test.ts:287` asserts the call, then snapshots the text). Flag a snapshot of structured data, or a snapshot as the only assertion of a test about behaviour. Read every snapshot diff before updating it.

## 8. Reading source files is for contracts

No test here reads a source file. A test that reads source or config to enforce a rule across the codebase is fine; one that reads a source file to check one function's behaviour should call the function instead.

## 9. No real user data

Fixtures use made-up names, emails and IDs (`TEST_IDS`, `example.com`). This repository is public.
