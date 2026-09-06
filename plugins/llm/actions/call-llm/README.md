# Call LLM

## What it is

The provider-neutral durable `llm.call` Action.

## Why it exists

It separates agent orchestration from individual model-provider protocols.

## How to use it

Compose `llmPlugin` and invoke the `callLlm` Action with configured model
aliases.

## How it works

It resolves model and credential Resources, streams the selected Adapter, and
records normalized output and attempts.

Tool-call stream lanes are speculative drafts. Copilotz validates the final Tool
declaration before accepting it or allowing Core to execute a Tool. A rejected
attempt may publish bounded, credential-safe diagnostic evidence as ordinary
Action progress; adapter authors must never include request content,
credentials, or provider error bodies in that evidence.

The Action declares `request.messages[].content` and
`request.messages[].reasoning` as runtime-managed input content. Its handler
receives metadata plus prepared values and never loads Asset bodies. An entry
with `resolve: false` is an intentional descriptor; the handler renders an
attachment notice rather than asking storage for its body. Core selects these
entries during its Collection read. Direct callers can supply prepared values or
explicit descriptors through the Action runtime.

Assistant reasoning is passed to built-in providers through the existing escaped
`<think>` formatter. Core supplies reasoning only for the target Agent's own
assistant history, not peer messages. Custom model adapters receive an optional
`reasoning` string on assistant messages.

The runtime stores reference-only invocation input, reuses existing content, and
restores prepared values on execution recovery. Calling `execute()` directly
bypasses that runtime boundary and therefore requires already-prepared entries.
