import type { CollectionRecord } from "@copilotz/copilotz/collections";
import type { LlmMessage } from "@copilotz/copilotz/llm";
import type { ConversationMessage } from "../../../core-collections/internal/contracts.ts";
import type { CoreProcessorContext } from "../runtime-context.ts";
import { buildLlmTranscript } from "./transcript.ts";

/** Resolve only final model-facing messages, after participant and causal projection. */
export async function prepareLlmTranscript(
  context: CoreProcessorContext,
  input: Parameters<typeof buildLlmTranscript>[0],
): Promise<readonly LlmMessage[]> {
  const sources: string[] = [];
  const transcript = buildLlmTranscript(input, (id) => sources.push(id));
  const snapshots = new Map(
    input.history.map((message) => [message.id, message]),
  );
  const withReasoning = new Set(
    sources.filter((id, index) =>
      transcript[index].role === "assistant" &&
      snapshots.get(id)?.sender.id === input.participantId
    ),
  );
  const resolved = new Map<string, CollectionRecord>();
  const messages = context.collections.message;
  if (!messages) throw new Error("Core requires the Message Collection.");
  for (const reasoning of [false, true]) {
    const ids = [...new Set(sources)].filter((id) =>
      withReasoning.has(id) === reasoning
    );
    for (let offset = 0; offset < ids.length; offset += 1000) {
      const records = await messages.list({
        where: { threadId: input.threadId },
        filter: { field: "id", in: ids.slice(offset, offset + 1000) },
        limit: 1000,
      }, {
        content: {
          fields: reasoning
            ? ["content", "metadata.llmReasoning"]
            : ["content"],
          exclude: [{ disposition: "attachment" }, {
            kind: "file",
            disposition: null,
          }],
        },
      });
      for (const record of records) {
        const snapshot = snapshots.get(record.id);
        if (
          !snapshot || String(record.updatedAt) !== snapshot.updatedAt ||
          String(record.senderId) !== snapshot.sender.id
        ) {
          throw new Error(
            "Message history changed during content preparation.",
          );
        }
        resolved.set(record.id, record);
      }
    }
  }
  return Object.freeze(transcript.map((message, index) => {
    const record = resolved.get(sources[index]);
    if (!record) throw new Error("Message history is no longer available.");
    const common = {
      ...message,
      content: record.content as LlmMessage["content"],
    };
    if (common.role !== "assistant") return common;
    const metadata = record.metadata as ConversationMessage["metadata"];
    return {
      ...common,
      ...(withReasoning.has(sources[index]) &&
          Array.isArray(metadata.llmReasoning)
        ? { reasoning: metadata.llmReasoning as LlmMessage["content"] }
        : {}),
    };
  }));
}
