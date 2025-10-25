import type { NewMessage, Agent } from "@/interfaces/index.ts";


export function historyGenerator(chatHistory: NewMessage[], currentAgent: Agent): ChatMxessage[] {
    return chatHistory.map((msg, _i) => {
        const role = msg.senderType === "agent"
            ? (msg.senderId === currentAgent.name ? "assistant" : "user")
            : msg.senderType;

        let content = msg.content || "";

        if (msg.senderType === "agent" && msg.senderId !== currentAgent.name) {
            content = `[${msg.senderId}]: ${content}`;
        } else if (msg.senderType === "user" && msg.senderId !== "user") {
            content = `[${msg.senderId}]: ${content}`;
        } else if (msg.senderType === "tool") {
            content = `[Tool Result]: ${content}`;
        }

        // Prefer top-level toolCalls on assistant messages for rehydration
        const toolCallsCandidate = (msg as unknown as { toolCalls?: Array<{ id?: string; function: { name: string; arguments: string } }> }).toolCalls;
        const toolCalls: ToolCall[] | undefined = (toolCallsCandidate && Array.isArray(toolCallsCandidate) && toolCallsCandidate.length > 0)
            ? toolCallsCandidate.map((call, i) => ({
                id: call.id || `${call.function?.name || 'call'}_${i}`,
                function: { name: call.function.name, arguments: call.function.arguments },
            }))
            : undefined;

        return {
            content,
            role: role,
            tool_call_id: (msg as unknown as { toolCallId?: string }).toolCallId || undefined,
            ...(toolCalls ? { toolCalls } : {}),
        };
    });
}