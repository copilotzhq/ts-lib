# DeepSeek adapter

## What it is

The built-in DeepSeek provider wire adapter.

## Why it exists

It translates DeepSeek’s compatible protocol into the LLM boundary.

## How to use it

Declare a LLM connection with `provider: "deepseek"`.

## How it works

It maps text-first chat input, streaming output, and cache-aware usage.
