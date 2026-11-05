# Working with coding agents

This repository is set up so coding agents prove their work before they call it done. This page explains the parts, what each one guarantees, and where it stops. It grows as each part lands.

## Layers

1. **Git hooks** run for everyone, people and agents alike, on every commit and push.

## Rules and what holds them

| Rule                                         | Held by                                                              | Certainty                                |
| -------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------- |
| No commits on `main`                         | `pre-commit` and `commit-msg` → `.agents/scripts/branch-guard.sh`    | Enforced locally; `--no-verify` skips it |
| No pushes to `main`                          | `pre-push` → `branch-guard.sh`; the "Protect default branch" ruleset | Enforced on GitHub                       |
| Committed files are linted and formatted     | `pre-commit` (lefthook, staged files only); CI                       | Checked in CI                            |
| Type check passes before a commit            | `pre-commit`; CI                                                     | Checked in CI                            |
| Tests pass before a push                     | `pre-push`; CI                                                       | Checked in CI                            |
| Agent tooling never ships in the npm package | `.agents/scripts/package-contents.test.ts`                           | Checked in CI                            |

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

## Where the tooling lives

- `.agents/scripts/` holds scripts and their tests. It is not under `scripts/`, next to `scripts/run-tool.ts`, nor a top-level "tools" folder, which would read as MCP tools (`src/tools/`). Like `scripts/`, it is left out of the npm package.
- The tooling runs straight from TypeScript with Node's type stripping, so it only uses erasable syntax (`.agents/scripts/tsconfig.json` enforces this). `npm run type-check` covers it, its tests included.
- Tests run in `npm test` and CI. They copy the tools into throwaway git repositories and never touch your checkout. A test helper clears the variables git exports to hooks, since `npm test` itself runs inside `pre-push`.

## Releases

semantic-release publishes from `main` on every merge. The squash-merged PR title decides whether anything ships: `feat:`, `fix:`, `perf:` and any breaking change (`!`) release; `chore:`, `ci:`, `docs:`, `test:` and `refactor:` do not. Changes to the agent tooling use `chore:` or `ci:`, so they never publish a new version.
