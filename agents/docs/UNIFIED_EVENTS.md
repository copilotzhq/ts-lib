## Unified Events Architecture

This document specifies a single-callback event model for the agents runtime, consolidating message and tool lifecycles under one interception point while preserving deterministic ordering and programmatic response control.

### Goals

- **One interception point** to mutate/short-circuit default behavior
- **Deterministic ordering** (persist → emit → enqueue)
- **Programmatic responses** that can bypass LLM/tool execution cleanly
- **Simple mental model**: the finalized event determines the next step

## Event Model

- **Event union** (queue payloads):
  - MessageEvent
    - type: `message`
    - createdBy: `user | agent | tool | system`
    - threadId: string
    - message: NewMessage (at least: `threadId`, `senderId`, `senderType`, `content`, optional `toolCalls`)
  - ToolCallEvent
    - type: `tool_call`
    - createdBy: `agent`
    - threadId: string
    - agentName: string
    - toolCalls: ToolCall[] (id, function { name, arguments: string })

Notes:
- ToolCallEvent is emitted after the agent LLM returns tool calls (batch-level; you can choose per-call if needed).
- All message content persisted to DB is clean text (no `<function_calls>` in content). Tool calls live as structured data on the message or in the event.

## Single Callback API

### Signature

```ts
type Event = MessageEvent | ToolCallEvent;

type Respond = (
  message: { content: string; senderId?: string; senderType?: 'user' | 'agent' | 'tool' | 'system' },
  opts?: { enqueueAfter?: 'tool_results' | 'immediately' }
) => Promise<void>;

onEvent?: (event: Event, respond: Respond) => Promise<Event | undefined> | (Event | undefined);
```

### Semantics

- **Return value**: If you return an event, the engine uses the returned event for default processing. If you return `undefined`, the original event is used.
- **respond(...)**: Enqueues a new event programmatically and **suppresses default processing** for the current event.
  - Default `senderId`: current agent when applicable; default `senderType`: `agent`.

This contract yields:
- Return → mutate the event and keep default path
- respond → bypass default path and continue with your programmatic message

## Processing Pipeline

### Queue Consumer

```ts
async function processQueueItem(item: Event) {
  const { event: finalEvent, responded } = await dispatchOnEvent(item);
  if (responded) return; // default path suppressed

  if (finalEvent.type === 'tool_call') {
    await processToolCallEvent(finalEvent);
  } else { // message
    await processMessageEvent(finalEvent);
  }
}
```

### processMessageEvent

- For `createdBy = 'user' | 'agent' | 'tool' | 'system'`:
  - Run target-agent routing for the thread (existing logic)
  - If an agent is selected:
    - Build LLM context/history (clean content, tool definitions)
    - Call LLM → get `answer` (clean) + `toolCalls` (structured)
    - Persist the agent message (clean content, attach `toolCalls` on the message if needed)
    - Enqueue a `MessageEvent` with `createdBy: 'agent'`
    - If `toolCalls.length > 0`, enqueue a `ToolCallEvent` for the same thread/agent

### processToolCallEvent

- Before executing tools:
  - (Optional) emit a synthetic event (same `tool_call`) through `onEvent` with `createdBy: 'agent'` and allow mutation/deny
  - If a `respond(...)` occurred, skip tool execution
- Execute tools (batch or per-call)
  - Persist `tool_logs` (raw JSONB input/output)
  - Persist tool result `messages` with `createdBy: 'tool'`
  - If a programmatic respond was requested during this step, **do not enqueue** tool-result messages—enqueue the programmatic message instead (after persistence). Otherwise enqueue the tool-result messages as `MessageEvent`s.

## Ordering & Persistence

- Always: **Persist → onEvent → Enqueue next**
- For tool paths with programmatic respond:
  - Persist tool logs + tool result messages first
  - If `respond(...)` was called, **do not enqueue** tool-result messages; enqueue the programmatic message(s) instead (preserves flow and avoids agent re-run) 

## Streaming

- Keep streaming callbacks as-is:
  - `onTokenStream`, `onContentStream`, `onToolCallStream`
- `onEvent` is not a streaming surface; it’s invoked at queue-consumption boundaries.

## Types to Add (Interfaces)

```ts
export type CreatedBy = 'user' | 'agent' | 'tool' | 'system';

export interface MessageEvent {
  type: 'message';
  createdBy: CreatedBy;
  threadId: string;
  message: NewMessage; // persisted or about to be persisted
}

export interface ToolCallEvent {
  type: 'tool_call';
  createdBy: 'agent';
  threadId: string;
  agentName: string;
  toolCalls: ToolCall[];
}

export type Event = MessageEvent | ToolCallEvent;

export type Respond = (
  message: { content: string; senderId?: string; senderType?: CreatedBy },
  opts?: { enqueueAfter?: 'tool_results' | 'immediately' }
) => Promise<void>;

export interface ChatCallbacks {
  onEvent?: (event: Event, respond: Respond) => Promise<Event | undefined> | (Event | undefined);
  onTokenStream?: (data: TokenStreamData) => void | Promise<void> | TokenStreamData;
  onContentStream?: (data: ContentStreamData) => void | Promise<void> | ContentStreamData;
  onToolCallStream?: (data: ToolCallStreamData) => void | Promise<void> | ToolCallStreamData;
}
```

## Threads Runtime Changes

### Enqueuing
- User input → persist user message → enqueue `MessageEvent{ createdBy:'user' }`
- Agent output → persist agent message → enqueue `MessageEvent{ createdBy:'agent' }`
- Agent tool calls → enqueue `ToolCallEvent`
- Tool results → persist tool result messages → enqueue a `MessageEvent` per tool result (unless a programmatic respond occurred)

### Queue Consumption
- Replace scattered callback invocations with:
  - `dispatchOnEvent(event)` which:
    - Calls `onEvent(event, respond)`
    - Tracks whether `respond` was invoked (`responded` flag)
    - Returns `{ event: mutatedOrOriginal, responded }`
- If `responded`: skip default behavior
- Else run default behavior based on `event.type`

### respond Implementation
- Default `senderType`: 'agent' (or infer from context)
- Default `senderId`: current agent (if available)
- Persist the programmatic message and enqueue
- For tool phases, support `enqueueAfter: 'tool_results'` (defer until after persistence) and suppress enqueuing tool-result messages

## Example Flows

### 1) User → Agent
- User sends text → MessageEvent(user)
- onEvent can mutate/guard; if `respond` is called, skip LLM
- Default: route → call LLM → persist agent message → enqueue MessageEvent(agent)
- If tool calls exist → enqueue ToolCallEvent

### 2) Agent → Tool → Programmatic
- ToolCallEvent(agent)
- onEvent denies tool execution and responds with system message
- Tool execution skipped; system message is enqueued

### 3) Agent → Tool → Tool Results → Agent
- ToolCallEvent(agent)
- Default: execute tools → persist logs/results → enqueue MessageEvent(tool) per result
- Next loop: MessageEvent(tool) triggers agent processing

## Testing Plan
- Unit tests: 
  - callback return mutation
  - respond suppression of default paths
  - tool-call denial flow
  - programmatic respond ordering after tool results
- Integration tests:
  - multi-turn threads with mixed tool usage
  - concurrent queue processing per thread

## Notes
- LLM layer stays provider-agnostic and returns clean text + structured toolCalls
- Content saved to DB is always clean; `<function_calls>` are reconstructed only for LLM input (if needed)


