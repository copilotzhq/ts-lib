import { chat } from "@/connectors/llm/index.ts";
import type { ChatMessage, ChatRequest, ChatResponse, ProviderConfig, ToolDefinition } from "@/connectors/llm/types.ts";
import type { Event, NewEvent, EventProcessor, MessagePayload, ProcessorDeps } from "@/interfaces/index.ts";
import type { ToolCallInput } from "@/event-processors/tool_call/index.ts";

export type {
    ChatMessage,
}

export interface ContentStreamData {
    threadId: string;
    agentName: string;
    token: string;
    isComplete: boolean;
}

// Typed Event Payloads
export type LLMCallPayload = {
    agentName: string;
    agentId: string;
    agentType: "user" | "agent" | "tool" | "system";
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: ProviderConfig;
}

export type LLMResultPayload = {
    agentName: string;
    agentId: string;
    agentType: "user" | "agent" | "tool" | "system";
    messages: ChatMessage[],
    tools: ToolDefinition[],
    config: ProviderConfig;
}

// Utilities reused from legacy engine (minimized/duplicated to avoid refactors)
const escapeRegex = (string: string): string => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


export const llmCallProcessor: EventProcessor<LLMCallPayload, ProcessorDeps> = {
    shouldProcess: () => true,
    process: async (event: Event, deps: ProcessorDeps) => {

        const payload = event.payload as LLMCallPayload

        const threadId = typeof event.threadId === "string"
            ? event.threadId
            : (() => { throw new Error("Invalid thread id for LLM call event"); })();

        let _error: string | undefined;
        let response: unknown;

        const producedEvents: NewEvent[] = [];

        // Get context from dependencies
        const context= deps.context;

        // Streaming callback: ai/llm filters out <function_calls> already.
        const streamCallback = (context.stream && (context.callbacks?.onContentStream))
            ? (token: string) => {

                if (context.callbacks?.onContentStream) {
                    
                    const callbackData: ContentStreamData = {
                        threadId,
                        agentName: payload.agentName,
                        token,
                        isComplete: false,
                    }
                    context.callbacks.onContentStream(callbackData);
                }
            }
            : undefined;

            response = await chat(
                {
                    messages: payload.messages,
                    tools: payload.tools,
                } as ChatRequest,
                payload.config,
                Deno.env.toObject() as Record<string, string>,
                streamCallback
            );


        const llmResponse = response as unknown as ChatResponse;

        // finalize stream
        if (streamCallback) {
            if (context.callbacks?.onContentStream) {
                context.callbacks.onContentStream({
                    threadId,
                    agentName: payload.agentName,
                    token: "",
                    isComplete: true,
                } as ContentStreamData);
            }
        }

        // Clean response
        let answer: string | undefined = ("answer" in llmResponse) ? (llmResponse as unknown as { answer?: string }).answer : undefined;
        const toolCalls: ToolCallInput[] | undefined = ("toolCalls" in llmResponse) ? (llmResponse as unknown as { toolCalls?: ToolCallInput[] }).toolCalls : undefined;

        if (!answer && !toolCalls) {
            return { producedEvents: [] };
        }

        if (answer) {
            const selfPrefixPattern = new RegExp(`^(\\[${escapeRegex(payload.agentName)}\\]:\\s*|@${escapeRegex(payload.agentName)}\\b(:\\s*|\\s+))`, 'i');
            answer = answer.replace(selfPrefixPattern, '');
        }

        // Enqueue a NEW_MESSAGE event
        producedEvents.push({
            threadId,
            type: "NEW_MESSAGE",
            payload: {
                senderId: payload.agentId,
                senderType: "agent",
                content: answer || "",
                toolCalls: toolCalls,
            } as MessagePayload,
            parentEventId: event.id,
            traceId: event.traceId,
            priority: event.priority,
        });

        return { producedEvents };
    }
};
