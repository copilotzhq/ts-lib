import type { NewMessage, Agent } from "@/interfaces/index.ts";
import type { ChatMessage, ToolCall, ChatContentPart } from "@/connectors/llm/types.ts";

type StoredAttachment = {
    kind?: string;
    mimeType?: string;
    data?: string;
    dataUrl?: string;
    durationMs?: number;
    format?: string;
    fileName?: string;
};

type MessageMetadata = Record<string, unknown> & {
    attachments?: StoredAttachment[];
};

const toDataUrl = (attachment: StoredAttachment): { data: string; mimeType: string } | null => {
    const mimeType = typeof attachment.mimeType === "string" && attachment.mimeType.length > 0
        ? attachment.mimeType
        : "application/octet-stream";

    if (typeof attachment.data === "string" && attachment.data.length > 0) {
        return { data: attachment.data, mimeType };
    }

    if (typeof attachment.dataUrl === "string" && attachment.dataUrl.startsWith("data:")) {
        const [, metaAndData] = attachment.dataUrl.split("data:");
        if (!metaAndData) return null;
        const [metaPart, base64Part] = metaAndData.split(",");
        if (!base64Part) return null;
        const extractedMime = metaPart?.split(";")[0] ?? mimeType;
        return { data: base64Part, mimeType: extractedMime };
    }

    return null;
};

const buildAttachmentParts = (metadata?: MessageMetadata): ChatContentPart[] | null => {
    const attachments = metadata?.attachments;
    if (!Array.isArray(attachments) || attachments.length === 0) {
        return null;
    }

    const parts: ChatContentPart[] = [];

    for (const attachment of attachments) {
        const kind = typeof attachment.kind === "string" ? attachment.kind : undefined;
        const dataInfo = toDataUrl(attachment);

        if (!dataInfo) {
            continue;
        }

        if (kind === "image") {
            const url = `data:${dataInfo.mimeType};base64,${dataInfo.data}`;
            parts.push({ type: "image_url", image_url: { url } });
            continue;
        }

        if (kind === "audio") {
            const formatFromMime = dataInfo.mimeType.includes("/") ? dataInfo.mimeType.split("/")[1] : undefined;
            const format = typeof attachment.format === "string" && attachment.format.length > 0
                ? attachment.format
                : formatFromMime;
            parts.push({
                type: "input_audio",
                input_audio: {
                    data: dataInfo.data,
                    ...(format ? { format } : {}),
                },
            });
            continue;
        }

        if (kind === "video" || kind === "file") {
            const file_data = `data:${dataInfo.mimeType};base64,${dataInfo.data}`;
            parts.push({
                type: "file",
                file: {
                    file_data,
                    mime_type: dataInfo.mimeType,
                },
            });
            continue;
        }

        // Default fallback: treat as file
        const fallback = `data:${dataInfo.mimeType};base64,${dataInfo.data}`;
        parts.push({
            type: "file",
            file: {
                file_data: fallback,
                mime_type: dataInfo.mimeType,
            },
        });
    }

    return parts.length > 0 ? parts : null;
};

export function historyGenerator(chatHistory: NewMessage[], currentAgent: Agent): ChatMessage[] {
    return chatHistory.map((msg, _i) => {
        const role = msg.senderType === "agent"
            ? (msg.senderId === currentAgent.name ? "assistant" : "user")
            : msg.senderType;

        const metadata = (msg.metadata ?? undefined) as MessageMetadata | undefined;

        let content = msg.content || "";

        if (msg.senderType === "agent" && msg.senderId !== currentAgent.name) {
            content = `[${msg.senderId}]: ${content}`;
        } else if (msg.senderType === "user" && msg.senderId !== "user") {
            content = `[${msg.senderId}]: ${content}`;
        } else if (msg.senderType === "tool") {
            content = `[Tool Result]: ${content}`;
        }

        const attachmentParts = buildAttachmentParts(metadata);
        const finalContent: string | ChatContentPart[] = attachmentParts
            ? [ { type: "text", text: content }, ...attachmentParts ]
            : content;

        // Prefer top-level toolCalls on assistant messages for rehydration
        const toolCallsCandidate = (msg as unknown as { toolCalls?: Array<{ id?: string; function: { name: string; arguments: string } }> }).toolCalls;
        const toolCalls: ToolCall[] | undefined = (toolCallsCandidate && Array.isArray(toolCallsCandidate) && toolCallsCandidate.length > 0)
            ? toolCallsCandidate.map((call, i) => ({
                id: call.id || `${call.function?.name || 'call'}_${i}`,
                function: { name: call.function.name, arguments: call.function.arguments },
            }))
            : undefined;

        return {
            content: finalContent,
            role: role,
            tool_call_id: (msg as unknown as { toolCallId?: string }).toolCallId || undefined,
            ...(toolCalls ? { toolCalls } : {}),
        };
    });
}