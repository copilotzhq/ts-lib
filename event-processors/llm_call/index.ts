import { chat } from "@/connectors/llm/index.ts";
import type { ChatMessage, ChatRequest, ChatResponse } from "@/connectors/llm/types.ts";
import type { Event, NewEvent, EventProcessor, MessagePayload, ProcessorDeps, LlmCallEventPayload } from "@/interfaces/index.ts";
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

export type LLMCallPayload = LlmCallEventPayload;
export type LLMResultPayload = LlmCallEventPayload;

// Utilities reused from legacy engine (minimized/duplicated to avoid refactors)
const escapeRegex = (string: string): string => string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


export const llmCallProcessor: EventProcessor<LLMCallPayload, ProcessorDeps> = {
    shouldProcess: () => true,
    process: async (event: Event, deps: ProcessorDeps) => {

        const payload = event.payload as LlmCallEventPayload;

        const threadId = typeof event.threadId === "string"
            ? event.threadId
            : (() => { throw new Error("Invalid thread id for LLM call event"); })();

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

            const envVars: Record<string, string> = (() => {
                try {
                    const anyGlobal = globalThis as unknown as {
                        Deno?: { env?: { toObject?: () => Record<string, string> } };
                        process?: { env?: Record<string, string | undefined> };
                    };
                    const fromDeno = anyGlobal?.Deno?.env?.toObject?.();
                    if (fromDeno && typeof fromDeno === "object") return fromDeno;
                    const fromNode = anyGlobal?.process?.env;
                    if (fromNode && typeof fromNode === "object") {
                        const out: Record<string, string> = {};
                        for (const [k, v] of Object.entries(fromNode)) {
                            if (typeof v === "string") out[k] = v;
                        }
                        return out;
                    }
                } catch {
                    // ignore
                }
                return {};
            })();

            const response = await chat(
                {
                    messages: payload.messages,
                    tools: payload.tools,
                } as ChatRequest,
                payload.config,
                envVars,
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

        const normalizedToolCalls = Array.isArray(toolCalls)
            ? toolCalls.map((call) => {
                let parsedArgs: Record<string, unknown> = {};
                try {
                    parsedArgs = call?.function?.arguments
                        ? JSON.parse(call.function.arguments)
                        : {};
                } catch (_err) {
                    parsedArgs = {};
                }
                return {
                    id: call?.id ?? null,
                    name: call?.function?.name ?? "",
                    args: parsedArgs,
                };
            })
            : undefined;

        const newMessagePayload: MessagePayload = {
            content: answer || "",
            sender: {
                id: payload.agentId,
                type: "agent",
                name: payload.agentName,
            },
            toolCalls: normalizedToolCalls,
        };

        // Enqueue a NEW_MESSAGE event
        producedEvents.push({
            threadId,
            type: "NEW_MESSAGE",
            payload: newMessagePayload,
            parentEventId: typeof event.id === "string" ? event.id : undefined,
            traceId: typeof event.traceId === "string" ? event.traceId : undefined,
            priority: typeof event.priority === "number" ? event.priority : undefined,
        });

        return { producedEvents };
    }
};
