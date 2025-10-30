## Cross-Runtime Compatibility

- Runtime detection helpers (`isDeno`/`isNode`/`isBun`) and centralized shims for env (`env.get`), filesystem, subprocess, timers.
- Database adapters: choose `omnipg` only on Deno (or make ominipg compatible with Node/Bun/Browser too); provide Node/Bun path using `pg`/`postgres.js` with Drizzle’s node driver; reconcile connection config + caching.
- Native tools refactor: wrap `Deno.*` usage in adapters, switch to `fs/promises`, `child_process.spawn`, or Bun equivalents; disable unsupported tools gracefully.
- CLI + examples: migrate `runCLI`, streaming callbacks, stdout writes to runtime-aware IO (`readline`, `process.stdout.write`, Bun streams).
- Packaging: introduce `package.json` with ESM/CJS builds, reuse `deno.json` export map, ensure bundler handles aliases (`@/`).
- Testing: add multi-runtime CI (Deno, Node, Bun) with representative smoke tests for DB connections and native tools.
- Docs: update README quick-starts per runtime, note limitations (e.g., command tool unavailable in browsers) and configuration differences.

## Retrieval-Augmented Generation (RAG)

- Schema expansion: add `documents`, `document_chunks`, `embeddings`, `ingestion_jobs`, plus metadata indexes and pgvector support (pglite fallback).
- Connector layer (`connectors/rag`): pluggable source connectors (HTTP fetch, local file upload, plain text) and format loaders (PDF, DOCX, CSV/XLSX, HTML) for phase one, returning normalized `Document` objects. Later phase will support Drive/GitHub/etc and custom /user defined connectors.
- Ingestion pipeline: queue-driven stages (`fetch` → `parse` → `chunk` → `embed` → `store`), reusable chunker + tokenizer, dedupe via hash, retries + logging.
- Event processors: introduce `RAG_INGEST` and `RAG_QUERY` processors; ingestion emits status `NEW_MESSAGE` (system/tool sender), query returns ranked snippets with provenance.
- Embedding adapters: interface for providers (OpenAI, local/Ollama) with configurable model per agent/workspace.
- Retrieval integration: message processor injects retrieved snippets into LLM context respecting token budgets, avoids duplicates, includes source citations.
- Tool surface: new native tools `ingest_from_connector`, `ingest_document`, `search_documents`, `delete_document` with validation + auth scopes.
- Documentation + samples: walkthrough of enabling vector storage, configuring connectors, demo agent using ingestion + retrieval in end-to-end flow.

## Auto-expiring Queue Events

- Schema changes: add `expires_at TIMESTAMP`, optional `ttl_ms`, `status='expired'`, indexes on `(status, expires_at)`.
- API: allow `enqueueEvent` callers to set TTL; provide defaults + config knobs; expose TTL in queue inspection endpoints.
- Worker logic: in `getNextPendingQueueItem`, skip expired rows, mark them `expired`, optionally hard-delete old expired rows with bounded DELETE tied to queue access.
- When `onEvent` overrides the default processor, persist queue item status as `overwritten` (new enum) before finishing to aid diagnostics and replay decisions.
- Surface metrics/logs for expirations and overrides, and expose admin utilities to inspect, replay, or purge expired/overwritten items.

## MCP Streaming Transport

- Define transport interface for MCP connectors (`send`, `onMessage`, `close`) and keep existing stdio implementation as a concrete adapter.
- Implement streaming HTTP transport (`fetch` + `ReadableStream` or WebSocket fallback) following MCP framing (JSON lines / SSE), including reconnect/backoff and auth headers.
- Allow MCP connector configs to select transport type (`stdio`, `http-stream`, etc.) and share lifecycle with agent event loop (request id multiplex).
- Add integration tests with mock MCP HTTP server across Deno/Node/Bun and document usage, limitations, and security considerations.

## API Tool Response Controls

- Introduce configuration (global + per-API) to control tool responses: toggles for `includeHeaders`, `includeStatus`, `includeStatusText`, and `unwrapData` (return payload directly).
- Adjust API tool generator so executors honor these settings while still throwing informative errors (status/headers included in error messages even if excluded in success path).
- Default behavior: omit headers, include numeric status; provide compatibility flag to keep legacy full response structure.
- Update documentation and tests/examples to cover slim vs detailed response modes and migration guidance.

