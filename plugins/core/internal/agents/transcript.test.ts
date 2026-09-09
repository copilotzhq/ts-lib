import { assertEquals } from "@std/assert";
import type { ConversationMessage } from "../../../core-collections/internal/contracts.ts";
import {
  CORE_TOOL_ACTION_METADATA_SCHEMA,
  CORE_TOOL_PLAN_METADATA_SCHEMA,
  withCoreToolPlanMetadata,
  withCoreToolPlanResultMetadata,
} from "../workflow-metadata.ts";
import { buildLlmTranscript } from "./transcript.ts";

const participant = (id: string, participantType: "agent" | "tool") =>
  ({
    id,
    namespace: "tenant",
    externalId: id,
    participantType,
    metadata: {},
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  }) as const;

function message(
  id: string,
  sender: ReturnType<typeof participant>,
  metadata: Readonly<Record<string, unknown>>,
): ConversationMessage {
  return {
    id,
    namespace: "tenant",
    threadId: "thread",
    sender,
    recipientIds: ["north"],
    content: [{
      assetId: `asset:${id}`,
      kind: "text",
      role: "body",
      mediaType: "text/plain",
    }],
    metadata,
    createdAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
  };
}

function result(id: string, planId: string): ConversationMessage {
  return message(
    id,
    participant("tool", "tool"),
    withCoreToolPlanResultMetadata({ requesterId: "north" }, {
      schema: "copilotz.core.tool-plan-result.v1",
      resultKind: "pipeline_failure",
      failedStageIndex: 0,
      failedAction: "lookup",
      origin: {
        schema: CORE_TOOL_ACTION_METADATA_SCHEMA,
        planId,
        planMessageId: `message:${planId}`,
        planIndex: 0,
        stageIndex: 0,
        stageCount: 1,
        planSize: 1,
        toolCallId: "shared",
        action: "lookup",
        threadId: "thread",
        triggerMessageId: "trigger",
        agentId: "north",
        agentParticipantId: "north",
        initiatorParticipantId: "human",
        availableToolIds: ["lookup"],
        responseVisibility: { kind: "public" },
        parentLlmActionRunId: `llm:${planId}`,
      },
    }),
  );
}

Deno.test("transcript keeps overlapping plans chronological and plan-qualified", () => {
  const plan = (id: string, planId: string) =>
    message(
      id,
      participant("north", "agent"),
      withCoreToolPlanMetadata({
        llmToolCalls: [{ id: "shared", action: "lookup", input: {} }],
      }, {
        schema: CORE_TOOL_PLAN_METADATA_SCHEMA,
        planId,
        planSize: 1,
      }),
    );
  const transcript = buildLlmTranscript({
    threadId: "thread",
    participantId: "north",
    history: [
      plan("plan:a", "a"),
      plan("plan:b", "b"),
      result("result:b", "b"),
    ],
  });
  assertEquals(transcript.map((item) => item.role), [
    "assistant",
    "assistant",
    "tool",
  ]);
  assertEquals(
    transcript[0]?.role === "assistant" ? transcript[0].toolPlanId : null,
    "a",
  );
  assertEquals(
    transcript[1]?.role === "assistant" ? transcript[1].toolPlanId : null,
    "b",
  );
  assertEquals(
    transcript[2]?.role === "tool" ? transcript[2].toolPlanId : null,
    "b",
  );
});
