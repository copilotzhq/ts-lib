import type { ConversationMessage } from "../../../core-collections/internal/contracts.ts";
import type {
  LlmJsonObject,
  LlmMessage,
  LlmToolCall,
} from "@copilotz/copilotz/llm";
import {
  agentAskMetadata,
  agentAskResultMetadata,
  agentFailureMetadata,
  coreToolActionMessageMetadata,
  coreToolPlanMetadata,
  coreToolPlanResultMetadata,
  coreToolResultOrigin,
  workflowMetadata,
} from "../workflow-metadata.ts";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function messageName(message: ConversationMessage): string | undefined {
  return optionalText(message.sender.name) ??
    optionalText(message.sender.externalId);
}

function embeddedToolCalls(value: unknown): readonly LlmToolCall[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.map((candidate, index) => {
    const call = record(candidate);
    const id = optionalText(call.id);
    const action = optionalText(call.action);
    const input = record(call.input);
    if (!id || !action) {
      throw new TypeError(
        `Assistant message tool call ${index} is missing its id or Action alias.`,
      );
    }
    return Object.freeze({
      id,
      action,
      input: structuredClone(input) as LlmJsonObject,
    });
  }));
}

function toolCallId(message: ConversationMessage): string | undefined {
  const toolAction = coreToolActionMessageMetadata(message.metadata);
  if (toolAction?.toolCallId) return toolAction.toolCallId;
  const branch = coreToolPlanResultMetadata(message.metadata);
  if (branch?.origin.toolCallId) return branch.origin.toolCallId;
  return optionalText(record(record(message.metadata).toolInvocation).id);
}

function toolPlanId(message: ConversationMessage): string | undefined {
  return coreToolPlanMetadata(message.metadata)?.planId ??
    coreToolResultOrigin(message.metadata)?.planId;
}

/** Maps one canonical Message into the provider-neutral LLM history contract. */
function projectMessage(
  message: ConversationMessage,
  targetParticipantId?: string,
): LlmMessage | null {
  // A public failure receipt is for the human-facing timeline only. Replaying
  // it into a later Model request would turn a transient provider failure into
  // an instruction-bearing conversation fact.
  if (agentFailureMetadata(message.metadata)) return null;
  const content = Object.freeze(structuredClone(message.content));
  const name = messageName(message);
  if (message.sender.participantType === "agent") {
    const ask = agentAskMetadata(message.metadata);
    if (ask) {
      const mode = ask.mode ?? "public";
      if (ask.phase === "question") {
        if (targetParticipantId === ask.askedParticipantId) {
          return Object.freeze({
            role: "user",
            content,
            ...(name ? { name } : {}),
          });
        }
        return targetParticipantId === ask.askingParticipantId ||
            mode === "private"
          ? null
          : Object.freeze({ role: "user", content, ...(name ? { name } : {}) });
      }
      if (ask.phase === "progress") {
        if (targetParticipantId === ask.askedParticipantId) {
          const toolCalls = embeddedToolCalls(message.metadata.llmToolCalls);
          const planId = toolPlanId(message);
          return Object.freeze({
            role: "assistant",
            content,
            ...(name ? { name } : {}),
            ...(toolCalls.length ? { toolCalls } : {}),
            ...(planId && toolCalls.length ? { toolPlanId: planId } : {}),
          });
        }
        return mode === "public" && content.length
          ? Object.freeze({ role: "user", content, ...(name ? { name } : {}) })
          : null;
      }
      // The caller receives this answer only through the receipt below.
      if (targetParticipantId === ask.askingParticipantId) return null;
      if (targetParticipantId === ask.askedParticipantId) {
        return Object.freeze({
          role: "assistant",
          content,
          ...(name ? { name } : {}),
        });
      }
      return mode === "private"
        ? null
        : Object.freeze({ role: "user", content, ...(name ? { name } : {}) });
    }
    if (targetParticipantId && message.sender.id === targetParticipantId) {
      const toolCalls = embeddedToolCalls(message.metadata.llmToolCalls);
      const planId = toolPlanId(message);
      return Object.freeze({
        role: "assistant",
        content,
        ...(name ? { name } : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
        ...(planId && toolCalls.length ? { toolPlanId: planId } : {}),
      });
    }
    if (embeddedToolCalls(message.metadata.llmToolCalls).length) return null;
    return Object.freeze({ role: "user", content, ...(name ? { name } : {}) });
  }
  if (message.sender.participantType === "tool") {
    const requesterId = optionalText(message.metadata.requesterId) ??
      workflowMetadata(message.metadata)?.agentParticipantId;
    const id = toolCallId(message);
    const planId = toolPlanId(message);
    if (id && requesterId === targetParticipantId) {
      return Object.freeze({
        role: "tool",
        content,
        toolCallId: id,
        ...(planId ? { toolPlanId: planId } : {}),
        ...(name ? { name } : {}),
      });
    }
    const historyVisibility = optionalText(
      message.metadata.historyVisibility,
    ) ?? "public_status";
    if (historyVisibility !== "public") return null;
  }
  return Object.freeze({ role: "user", content, ...(name ? { name } : {}) });
}

function toLlmMessage(
  message: ConversationMessage,
  targetParticipantId?: string,
): LlmMessage | null {
  const projected = projectMessage(message, targetParticipantId);
  if (
    projected?.role !== "assistant" ||
    message.sender.id !== targetParticipantId ||
    !Array.isArray(message.metadata.llmReasoning)
  ) return projected;
  return {
    ...projected,
    reasoning: message.metadata
      .llmReasoning as import("@copilotz/copilotz/content").ContentSequence,
  };
}

function receiptAnswer(
  receipt: ConversationMessage,
  answer: ConversationMessage | undefined,
  targetParticipantId?: string,
): LlmMessage | null {
  const result = agentAskResultMetadata(receipt.metadata);
  if (
    !result || result.status !== "completed" || !result.answerMessageId ||
    !answer || answer.id !== result.answerMessageId ||
    answer.sender.id !== result.askedParticipantId ||
    targetParticipantId === undefined
  ) return null;
  const ask = agentAskMetadata(answer.metadata);
  if (
    !ask || ask.phase !== "answer" || ask.askId !== result.askId ||
    ask.askingParticipantId !== targetParticipantId
  ) return null;
  const name = messageName(answer);
  return Object.freeze({
    role: "user",
    content: Object.freeze(structuredClone(answer.content)),
    ...(name ? { name } : {}),
  });
}

/** Compiles immutable Core Messages into participant-relative LLM history. */
export function buildLlmTranscript(
  input: Readonly<{
    threadId: string;
    history: readonly ConversationMessage[];
    messageIds?: readonly string[];
    participantId?: string;
  }>,
  onSelectedSource?: (messageId: string) => void,
): readonly LlmMessage[] {
  const history = input.history;
  const selected = input.messageIds !== undefined
    ? (() => {
      const byId = new Map(history.map((message) => [message.id, message]));
      return input.messageIds.map((id) => {
        const message = byId.get(id);
        if (!message) {
          throw new Error(
            `LLM input message '${id}' was not found in thread '${input.threadId}'.`,
          );
        }
        return message;
      });
    })()
    : history;
  const byId = new Map(history.map((message) => [message.id, message]));
  const output: LlmMessage[] = [];
  const sources = new WeakMap<LlmMessage, string>();
  const project = (message: ConversationMessage) => {
    const result = toLlmMessage(message, input.participantId);
    if (result) sources.set(result, message.id);
    return result;
  };

  const appendNormal = (message: ConversationMessage) => {
    const projected = project(message);
    if (projected) output.push(projected);
  };
  for (const message of selected) {
    const answerId = agentAskResultMetadata(message.metadata)?.answerMessageId;
    const answer = answerId
      ? receiptAnswer(message, byId.get(answerId), input.participantId)
      : null;
    appendNormal(message);
    if (answer) {
      sources.set(answer, answerId!);
      output.push(answer);
    }
  }
  for (const message of output) onSelectedSource?.(sources.get(message)!);
  return Object.freeze(output);
}
