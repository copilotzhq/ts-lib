## Copilotz Agents Framework – Improvements Backlog

Purpose: a concise, issue-ready backlog to guide hardening, safety, performance, and developer experience work across the agents runtime, tools, and LLM layers.

### 1) Queue and concurrency
- **Iterative worker loop**: Replace recursive `processQueue` with an iterative loop; avoid stack growth and enable clearer control flow.
- **Atomic claim-next**: Move "claim next item" and state transitions into a single DB transaction/lock to prevent races.
- **Visibility timeout + retries**: Add in-flight visibility timeout and capped exponential backoff retries; record attempt counts.
- **Backpressure & concurrency caps**: Configurable max concurrent threads/jobs; fair scheduling per thread.
- **Idempotency**: Deduplicate by queue item id + hash; safe reprocessing on retry without duplicating side effects.

Suggested issues:
- P0: Refactor queue to iterative worker with transactional claim-next
- P0: Add visibility timeout and capped retries for queue items
- P1: Add per-thread concurrency caps and backpressure
- P1: Implement idempotent queue operations and dedupe

### 2) Tooling safety and validation
- **Schema validation**: Enforce JSON Schema (Ajv) for tool inputs including `required` and type checks; human-friendly error messages.
- **Timeouts & cancellation**: Per-tool execution timeouts; propagate cancellation and surface partial outputs where relevant.
- **Guardrails**: For `run_command` and `http_request`, add allowlists, sandboxing, size limits, and rate limits.
- **Audit logging**: Structured tool logs with redaction of secrets and large payload truncation.

Suggested issues:
- P0: Add Ajv-based validation for tool inputs with helpful errors
- P0: Add per-tool timeout and cancellation propagation
- P1: Harden `run_command`/`http_request` with allowlists and limits
- P2: Add redacted, structured audit logs for tool executions

### 3) MCP lifecycle and performance
- **Connection pooling**: Reuse MCP client connections; graceful shutdown and health checks.
- **Metadata caching**: Cache tool metadata and capabilities; version tags for compatibility.
- **Isolation & limits**: Per-server concurrency caps and timeouts; clearer error semantics.
- **Security**: Allowlist server binaries/paths and args; explicit consent for external MCPs.

Suggested issues:
- P1: Introduce MCP connection pool with health/idle management
- P1: Cache MCP tool metadata with capability filters
- P2: Per-MCP concurrency caps and timeouts
- P2: Add allowlist and safety checks for MCP executables

### 4) Routing and mentions
- **Robust mentions**: Support `@([A-Za-z0-9_\-.]+)` (case-insensitive); handle non-ASCII names; preserve quoting.
- **Routing strategies**: Skill-based tags, priority queues, and confidence scoring for selecting agents in multi-party threads.
- **Config clarity**: Better errors for `allowedAgents` violations; diagnostics for routing decisions.

Suggested issues:
- P1: Expand mention parsing and make matching case-insensitive
- P1: Add skill/priority-based routing strategy hooks
- P2: Improve diagnostics for routing and `allowedAgents` filtering

### 5) Streaming robustness
- **Unified event protocol**: Provider-agnostic streaming events (NDJSON or equivalent) for content and function calls.
- **Boundary handling**: Remove ad-hoc `<function_calls>` parsing; robust chunk reassembly across token boundaries.
- **Backpressure**: Flow control between provider, runtime, and callbacks.

Suggested issues:
- P0: Replace custom function-call parsing with structured stream events
- P1: Implement chunk boundary reassembly and buffering
- P2: Add backpressure-aware streaming to callbacks

### 6) Observability
- **Structured logging**: JSON logs with correlation ids (threadId, queueId, toolCallId) and consistent fields.
- **Tracing & metrics**: OpenTelemetry spans for queue, LLM calls, tool exec; durations and error taxonomy.
- **Sampling & PII**: Safe defaults with sampling and redaction hooks.

Suggested issues:
- P1: Add OpenTelemetry tracing around queue, LLM, tools
- P1: Add structured logs and correlation ids
- P2: Introduce log sampling and PII redaction policies

### 7) Limits and safeguards
- **Execution limits**: Max steps/tool calls per thread/task; circuit breaker on repeated failures.
- **Loop detection**: Detect and halt agent-to-agent loops; add duplicate message suppression.
- **Rate limiting/budgets**: Per-agent/provider throughput and token/cost budgets.

Suggested issues:
- P0: Add per-thread step/tool-call caps and circuit breaker
- P1: Loop detection and duplicate suppression
- P1: Rate limits and budgets per agent/provider

### 8) Types and developer experience
- **Type safety**: Stronger typings for tool IO (generics), `AgentConfig`, and message shapes; eliminate `any`.
- **Typed callbacks**: Export strict callback interfaces and helper wrappers.
- **Config validation**: CLI/utility to validate agent/tool configs before runtime.
- **Scaffolding**: Generator for programmatic agents with tests and typed stubs.

Suggested issues:
- P1: Strengthen typings for tools and agents; remove `any`
- P1: Export fully typed callback signatures
- P2: Add config-validation utility/CLI
- P2: Add programmatic agent scaffolding generator

### 9) Memory and knowledge integration
- **RAG**: Integrate `knowledge/` retrieval into LLM context (thread/task-aware).
- **Agent memory**: Episodic memory and periodic summarization; TTL and purge policies.
- **Memory tools**: Tools to write/read/update memory with schema and quotas.

Suggested issues:
- P2: Thread-aware RAG helper integrated into LLM context builder
- P2: Episodic memory with summarization and TTL
- P3: Memory read/write tools with quotas

### 10) Tests and examples
- **Integration tests**: Queue concurrency, retries, routing/mentions, tool error paths, streaming.
- **Examples**: Minimal programmatic agent with tools; MCP integration example with pooling.

Suggested issues:
- P0: Add integration tests for queue and retries
- P1: Add tests for tool error paths and validation
- P1: Add routing/mentions tests (allowedAgents and multi-party)
- P2: Add streaming tests for structured events
- P2: Add examples for programmatic agent + MCP with pooling

### Draft issue template (copy/paste into new issues)
```
Title: <short, action-oriented>

Summary
- What/Why:

Acceptance Criteria
- [ ] 

Out of Scope
- 

Notes
- Related files/dirs: 
- Telemetry: 
```




=====

### Core flow
- createThread entrypoint
  - File: `agents/threads/index.ts`
  - Creates/fetches a thread, validates participants, persists the initial message, then enqueues it and starts queue processing.
- Message queue processing
  - `processQueue` pulls next pending item, marks processing, calls `processMessage`, updates status, then recurses to continue.
- Message routing
  - `processMessage` builds a processing context (thread, history, active task, tools), triggers `onMessageReceived` interceptor, discovers target agents by:
    - continuing tool-call chains, or
    - parsing `@AgentName` mentions, or
    - falling back to the other participant in 2-party threads.
- Agent execution
  - `processAgentMessage`:
    - Programmatic agents: calls the provided `processingFunction`.
    - Standard agents: builds LLM context/history, calls `ai/chat` with formatted tools and optional streaming callbacks, then:
      - Creates/saves the agent message
      - Executes any tool calls
      - Saves tool logs and tool result messages
      - Re-queues the agent if mentions exist (or programmatic agent asked to continue)

### Tools system
- Native tools registry: `agents/tools/registry/index.ts` (e.g., `ask_question`, `create_thread`, `create_task`, `http_request`, file ops, `run_command`, etc.)
- API tools: `agents/tools/api-generator.ts` generates `RunnableTool[]` from API configs.
- MCP tools: `agents/tools/mcp-generator.ts` connects to MCP servers, lists tools, wraps them as `RunnableTool` via an executor.
- Tool execution: `agents/tools/processing.ts` (handles matching/dispatch; schema validation is light).

### Context and interceptors
- Context building: merges native/user/API/MCP tools; passes full agent set separately for tool-context awareness.
- Interceptors/callbacks: `onMessageReceived`, `onMessageSent`, `onToolCalling`, `onToolCompleted`, `onLLMCompleted`, `onIntercepted`, plus streaming callbacks (`onTokenStream`, `onContentStream`, `onToolCallStream`). Interceptors can mutate payloads before use.

### Agents and types
- Agents can be standard (LLM-driven) or programmatic (`processingFunction`).
- Routing constraints via `allowedAgents` and tool access via `allowedTools`.
- LLM layer: `ai/` providers (OpenAI, Anthropic, Gemini, Groq, Ollama) with shared `chat` interface and tool call support.

### Database
- Abstracted via `agents/database` (`createDatabase`, `createOperations`); used for threads, messages, tool logs, queue state. The queue processing assumes single-runner semantics using “currently processing” checks.

### Targeted improvements
- Queue and concurrency
  - Replace recursive `processQueue` with an iterative loop to avoid deep recursion and enable backpressure.
  - Strengthen locking/atomicity in operations (DB-side “claim next item” with status transition in one transaction).
  - Add visibility timeout and retry with capped backoff for failed items.
- Tooling safety and validation
  - Enforce JSON Schema `required` and type validation on tool inputs (e.g., Ajv), with clear error messages. Current formatting defaults to `{}` if schema is malformed.
  - Harden risky tools (`run_command`, `http_request`) with allowlists/timeouts/sandboxing.
  - Add per-tool execution timeouts and cancellation propagation.
- MCP lifecycle
  - Pool and reuse MCP connections; ensure deterministic disconnects on idle/error.
  - Cache tool metadata; surface capability/version data to agents.
- Routing and mentions
  - Improve mention regex to support non-word characters (`@([A-Za-z0-9_\-\.]+)`) and case-insensitive matching.
  - Add routing strategies (round-robin, skill-based via tags, priority queues) for >2 participants.
- Streaming robustness
  - Avoid custom `<function_calls>` parsing; unify provider-agnostic streaming schema (NDJSON events or well-defined tokens), with boundary detection across chunk splits.
- Observability
  - Add structured logs and metrics (OpenTelemetry), include correlation IDs (threadId, queueId, toolCallId), and durations (already partially tracked for tools/LLM).
- Limits and safeguards
  - Global per-thread max steps/tool calls; cycle detection for agent-to-agent loops.
  - Rate-limiting per agent and provider; budget-aware execution.
- Types and DX
  - Tighten types in tool definitions and message shapes; minimize `any`.
  - Export typed callback signatures; add example middleware for common policies (PII redaction, prompt hardening).
- Memory/Knowledge
  - Integrate `knowledge/` components for retrieval-augmented prompts and agent memory (summaries, episodic memory).
- Tests and examples
  - Add integration tests for queue concurrency, tool error paths, and routing with mentions and `allowedAgents`.
  - Provide minimal runnable examples for programmatic agents and MCP integrations.

