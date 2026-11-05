# Working with coding agents

This repository is set up so coding agents prove their work before they call it done. This page explains the parts, what each one guarantees, and where it stops. It grows as each part lands.

## Layers

1. **Git hooks** run for everyone, people and agents alike, on every commit and push.
2. **`npm run verify`** runs every CI check locally and records a pass.
3. **`AGENTS.md`** tells agents what done means. Claude Code reads it through `CLAUDE.md`; Codex and Cursor read it directly.

## Rules and what holds them

| Rule                                          | Held by                                                              | Certainty                                |
| --------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| No commits on `main`                          | `pre-commit` and `commit-msg` → `.agents/scripts/branch-guard.sh`    | Enforced locally; `--no-verify` skips it |
| No pushes to `main`                           | `pre-push` → `branch-guard.sh`; the "Protect default branch" ruleset | Enforced on GitHub                       |
| Committed files are linted and formatted      | `pre-commit` (lefthook, staged files only); CI                       | Checked in CI                            |
| Type check passes before a commit             | `pre-commit`; CI                                                     | Checked in CI                            |
| Tests pass before a push                      | `pre-push`; CI                                                       | Checked in CI                            |
| Agent tooling never ships in the npm package  | `.agents/scripts/package-contents.test.ts`                           | Checked in CI                            |
| `npm run verify` runs what CI runs            | `.agents/scripts/lib/steps.test.ts` compares it with `ci.yml`        | Checked in CI                            |
| Run `npm run verify` before calling work done | `AGENTS.md`                                                          | Asked                                    |
| Never weaken a check to pass it               | `AGENTS.md`                                                          | Asked                                    |

"Checked in CI" means the `Test` workflow fails on a pull request that breaks it. No status check is required on `main`, so a red pull request can still be merged: the person merging has to look. A local hook alone is a speed bump: `git commit --no-verify` skips it.

## Git hooks

[Lefthook](https://github.com/evilmartians/lefthook) runs the hooks, configured in `lefthook.yml`. `npm install` installs them into `.git/hooks` (the `prepare` script runs `lefthook install --reset-hooks-path`, which also clears any `core.hooksPath` that would stop lefthook installing).

- **`pre-commit`** refuses a commit on `main`, then lints and formats the staged files (re-staging what the tools fix), and runs the type check. Unstaged changes in a partly staged file are left alone.
- **`commit-msg`** refuses a commit on `main` again. Lefthook runs no pre-commit job when nothing is staged, so without it an empty commit would get past.
- **`pre-push`** refuses a push to `main`, then runs the tests. It checks `git push --dry-run` too.
- If node is not on `PATH` (some GUI git clients), both hooks still apply the branch rule, skip the checks, and say so. CI runs the same checks.
- The default branch is read from `origin/HEAD`, falling back to `main`.

The release workflow commits and pushes to `main` from GitHub Actions, and `npm ci` runs `prepare` there, which installs the hooks. The guard therefore skips itself when `GITHUB_ACTIONS=true`. That is the one exemption. Branch protection on GitHub is the real enforcement; the hooks only catch mistakes early.

**Limits:**

- Worktrees share the hooks in `.git/hooks`, so the branch rule works in a new worktree at once. Lint, format, types and tests need `npm ci` in that worktree first.
- Without the lefthook binary (no `node_modules` in the main checkout), the hooks print "Can't find lefthook in PATH" and let the commit through.
- The hooks run under whatever node is on `PATH`. `package.json` asks for Node 24 or later (`.nvmrc`).

## `npm run verify`

One command, every check a pull request's CI runs: lint, format, both type checks and all tests. It takes about ten seconds, most of it the tests, so it checks the whole tree rather than guessing which tests a change affects.

- **Before the checks** it stops if Node is older than `package.json` requires, if `package.json` and the lockfile disagree, or if `node_modules` does not match the lockfile, transitive dependencies included (from npm's `node_modules/.package-lock.json`). All three make checks fail for reasons unrelated to your change.
- **Only docs changed** since the branch left `main`: it runs only the format check, which reads Markdown too, and keeps an earlier pass. The agent instructions (`AGENTS.md`, `CLAUDE.md`, `docs/agents.md`, `.agents/`) count as code, since they decide how agents check their work.
- **Only CI files changed** (`.github/` workflows other than `ci.yml`, Renovate): it runs only the format check, the one local check that reads them, and keeps an earlier pass. `ci.yml` counts as code, since a local test compares verify with it.
- **Environment:** it runs the tests with CI's `NODE_ENV=test` and `CI=true`. It drops `COMMS_API_KEY`, `COMMS_BASE_URL`, `COMMS_CREATE_THREAD_DISPLAY_IN_INBOX` and `USE_STRUCTURED_CONTENT` and says so: CI never sets them, and they change what the server does.
- **Output:** one line per step. A failing step prints the last 30 lines of its log and the log's path under `.tmp/agents/logs/`.
- **The record:** after a full pass it writes a content hash of every file local checks read (not docs, not CI-only files) to `.tmp/agents/verified.json`. A run that fails, or sees files change while it runs, deletes it.
- **What it cannot see:** the real Comms API, how models use tool descriptions, the build (CI does not build either; `npm publish` does), and Node versions other than yours (CI runs 24 and 26). It prints these after every pass.

If CI gains a step, a job or a test environment variable, `.agents/scripts/lib/steps.test.ts` fails until verify gains it too.

## Where the tooling lives

- `.agents/scripts/` holds scripts and their tests. It is not under `scripts/`, next to `scripts/run-tool.ts`, nor a top-level "tools" folder, which would read as MCP tools (`src/tools/`). Like `scripts/`, it is left out of the npm package.
- The tooling runs straight from TypeScript with Node's type stripping, so it only uses erasable syntax (`.agents/scripts/tsconfig.json` enforces this). `npm run type-check` covers it, its tests included.
- Tests run in `npm test` and CI. They copy the tools into throwaway git repositories and never touch your checkout. A test helper clears the variables git exports to hooks, since `npm test` itself runs inside `pre-push`.

## Releases

semantic-release publishes from `main` on every merge. The squash-merged PR title decides whether anything ships: `feat:`, `fix:`, `perf:` and any breaking change (`!`) release; `chore:`, `ci:`, `docs:`, `test:` and `refactor:` do not. Changes to the agent tooling use `chore:` or `ci:`, so they never publish a new version.
