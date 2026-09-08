# LLM connection Resource

## what it is

A process-local provider transport and authentication declaration.

## why it exists

It keeps credentials and endpoint configuration outside durable LLM calls.

## how it works

`defineLlmConnection` validates and freezes built-in or custom-adapter
connections.

## how to use it

Register it in `resources.llmConnections` and select it with
`{ connection, model }`.
