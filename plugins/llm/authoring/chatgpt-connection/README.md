# Connected ChatGPT authentication

## What it is

`createChatGptConnection` creates a process-local OpenAI connection for an
already-linked ChatGPT account. Applications supply their OAuth client ID and
trusted `load`, `save`, and `markExpired` callbacks. Initial sign-in and OAuth
callback registration remain application-owned.

## Why it exists

Applications can reuse the refresh protocol without sharing identity, storage,
or encryption policy.

## How it works

`load` returns a decrypted account snapshot after checking the caller's
authority. The snapshot carries an opaque `version` identifying its persisted
credentials. `save` and `markExpired` must compare that version atomically
before changing storage, and return the current authorized account if another
writer won. Disconnects return `null`. Do not return a different account as a
fallback.

Tokens and account snapshots are ephemeral. Encrypt tokens in the application's
storage callbacks; never return them from Actions or place them in Agent
selections, durable metadata, logs, or public errors.

The helper refreshes expiring tokens, preserves refresh tokens omitted by the
provider, and marks an unchanged account expired only for `invalid_grant`.
Transient provider failures and malformed responses do not revoke an account.
The returned token must have a confirmed future expiry before use.

Refresh sharing is limited to one helper instance and tenant/connection/account
revision. Cancelling a waiter detaches it; an already-started refresh has a
separate 30-second lifetime so its rotated token can still be saved. Conditional
storage prevents stale overwrites across processes, but does not serialize
provider refresh requests across Gateways. Applications needing that guarantee
must coordinate account refresh externally.

## How to use it

Register the returned value under `resources.llmConnections` and reference its
alias from an Agent model selection. Provide the callbacks described above and
test them against your storage implementation.

The helper requires an explicit OAuth registration; it does not grant
eligibility or register an application. See the
[official authentication guidance](https://learn.chatgpt.com/docs/auth).

A successful rotation must be stored before its credentials are returned. Across
processes, an `invalid_grant` response can arrive before another refresh stores
its successful result. The application's conditional write must distinguish that
expiry marker from a disconnect or changed token/account state; it must not
discard valid rotated tokens merely because the unchanged snapshot was marked
expired. A deleted or relinked account must never be revived.
