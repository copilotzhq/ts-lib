import { assertRejects } from "@std/assert";
import { prepareAttemptTranscript } from "./transcript.ts";
import { ContextInputLimitError } from "./errors.ts";

Deno.test("attempt preparation rejects oversized history without dropping it", async () => {
  const error = await assertRejects(() =>
    prepareAttemptTranscript({
      request: {
        messages: [
          {
            role: "user",
            content: "a".repeat(80),
            metadata: { sourceMessageId: "m1" },
          },
          {
            role: "assistant",
            content: "b".repeat(80),
            metadata: { sourceMessageId: "m2" },
          },
        ],
      },
      config: { limitEstimatedInputTokens: 30 },
    }), ContextInputLimitError);
  if (!(error instanceof ContextInputLimitError)) throw error;
  if (error.estimatedInputTokens <= error.limitEstimatedInputTokens) {
    throw new Error("Expected the estimate to exceed the configured limit.");
  }
});
