# Check: security

The server holds a user's Comms token and runs tools a model chooses: posting to threads and conversations, notifying people, archiving, deleting. Tool output carries other people's messages. Apply to changes in `src/`.

## Report

- A token, `Authorization` header or `.env` value written to logs, errors, `textContent` or `structuredContent`.
- More message content or personal data in logs than before. `src/mcp-helpers.ts` already logs a failed call's arguments, message bodies included; a change that logs more, or logs on success, needs a reason.
- A change to `src/utils/validate-comms-token.ts` that accepts a token the API rejected, or turns a 401 or 403 into `valid`.
- A URL built from model input and fetched by the server. Tools reach Comms only through the `CommsApi` client.
- A tool that reaches more people than the model asked: wider notifications (`recipients`, `groups`, `notifyAudience`), more people who can read the content (`public` channels, extra conversation `recipients`), or a wider default.
- A wider default scope for a bulk action, such as `mark-done` acting on a whole workspace or channel when no IDs are given.
- A tool that posts, edits or deletes somewhere other than the target the model named, for example a fallback to another thread or conversation.
- A write, archive or delete a model could take from a read-only-looking tool.
- A description or `instructions` text that tells the model to act on what other people wrote in a message.
- An attachment `url` fetched or downloaded by the server: it needs a browser session (`src/utils/attachments.ts`).

## Fine

- Logging tool names, counts, IDs and error types (`src/utils/degrade.ts`).
- Test fixtures with fake tokens (`test-token`).
