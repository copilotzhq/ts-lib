# Anthropic adapter

## What it is

The built-in Anthropic provider wire adapter.

## Why it exists

It translates Anthropic’s Messages protocol into the LLM boundary.

## How to use it

Declare a LLM connection with `provider: "anthropic"`.

## How it works

It builds Anthropic requests and decodes streaming content and usage frames.
