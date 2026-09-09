import { assert, assertEquals, assertThrows } from "@std/assert";
import { ContextInputLimitError } from "../../internal/errors.ts";
import { preflightLlmRequest, validateBuiltinProviderCall } from "./index.ts";

Deno.test("provider bridge rejects unsupported built-in session mode", () => {
  assertThrows(() => validateBuiltinProviderCall("openai", "session", {}));
});

Deno.test("bridge preflight uses wire formatting and rejects an oversized request", () => {
  const request = {
    instructions: "System rules " + "x".repeat(2_000),
    tools: [{
      name: "lookup",
      description: "Looks up a record.",
      inputSchema: { type: "object" },
    }],
    messages: [],
  };
  const error = assertThrows(
    () =>
      preflightLlmRequest(request, {
        provider: "openai",
        model: "gpt-test",
        limitEstimatedInputTokens: 10,
      }),
    ContextInputLimitError,
  );
  assert(error.estimatedInputTokens > error.limitEstimatedInputTokens);
});

Deno.test("preflight measures prepared message bodies through the execution projection", () => {
  const message = {
    role: "user" as const,
    content: [{
      assetId: "body",
      kind: "text" as const,
      role: "body",
      mediaType: "text/plain",
      value: "a long conversation sentence ".repeat(300),
    }],
  };
  const request = { messages: [message] };
  const measured = preflightLlmRequest(request, {
    model: "test",
    limitEstimatedInputTokens: 100_000,
  });
  assert(measured.estimatedInputTokens > 100);
  const failure = assertThrows(
    () =>
      preflightLlmRequest(request, {
        model: "test",
        limitEstimatedInputTokens: 100,
      }),
    ContextInputLimitError,
  );
  assertEquals(failure.estimatedInputTokens, measured.estimatedInputTokens);
});
