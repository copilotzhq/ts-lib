# Core

## What it is

The semantic plugin for agent Messages, LLM routing, Tools, parallel plans, and
Agent-to-Agent Ask.

## Why it exists

Applications need one durable orchestration layer over provider-neutral LLM and
domain storage primitives.

## How to use it

Install `corePlugin`, compose Agents and LLM connections, then send typed
`message(...)` inputs.

## How it works

Core combines Core Collections with LLM lifecycle processing, projects provider
results into canonical Messages, and coordinates Tool/Ask futures through
durable plans.

New Agent invocations select the latest authorized conversation state in a
consistent read snapshot. User, Tool and Ask triggers follow the same path;
replayed Actions reuse their captured request. Certified compaction supplies the
lower boundary, and over-budget input fails explicitly if compaction cannot
advance. Transcript order remains chronological and Tool identifiers include
their plan identity; execution fan-in remains unchanged.
