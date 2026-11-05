# Check: privacy and secrets

This repository is public, and the npm package ships `dist/`.

## Report

- A secret, API key, token or password, even an expired one.
- Real user data in fixtures, snapshots or docs: real names, emails, message or thread content, workspace, channel or user IDs copied from an account.
- Internal details: private hostnames, internal URLs, Doist-internal tools or documents, internal workspace or thread IDs.
- A new path in package.json `files` that should not be published.
- Untracked files the change doesn't need (`.env`, logs, `.tmp/`).

## Fine

- Made-up fixtures (`TEST_IDS`, `example.com`).
- Public URLs: `comms.todoist.com`, `comms.staging.todoist.com` as documented in `.env.example`, GitHub.
- `COMMS_BASE_URL` documented as an option, without a private value.
