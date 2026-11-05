# Check: evidence

Apply to the PR description and any report from an agent.

## Report

- A behaviour claim ("fixed", "works", "safe", "no regressions") with no test or command that ran it.
- A "Not verified" section missing when something could not be checked: real Comms API calls, model behaviour, the build.
- A change to shared code (`src/utils/`, `src/mcp-helpers.ts`, `src/index.ts`) without the one fact that makes it safe.
- A PR title whose type doesn't match the change: behaviour changes need `feat:`, `fix:` or `perf:` to release (`!` for breaking); tooling and docs use `chore:`, `ci:`, `docs:` or `test:` so they don't.

## Fine

- Claims about what the code shows, with the cited line.
