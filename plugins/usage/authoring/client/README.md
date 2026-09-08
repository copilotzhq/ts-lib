# Usage client

## What it is

`createUsageClient()` is a small browser-safe fetch binding for the Usage HTTP
adapter. It accepts a base URL, an optional async request-header callback, and a
Fetch implementation for SSR or tests.

## Why it exists

Browser and SSR consumers need one typed boundary for authorized Usage reads.

## How to use it

Create the client with the mounted Usage endpoint and call `analytics()` or
`attempts()` with a filter range.

## How it works

It exposes `analytics()` and `attempts()`. Filters always include a half-open
UTC range: records at `from` are included and records at `to` are excluded.
Missing measurements remain `null`; reported zero remains `0`.
