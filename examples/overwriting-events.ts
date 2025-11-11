import { createCopilotz } from "../index.ts";
import type { AgentConfig } from "../index.ts";
import type { NewEvent, Event, ToolCallEventPayload } from "../interfaces/index.ts";

// Example: Overwrite NEW_MESSAGE events with a custom LLM_CALL
// - Demonstrates event overriding: the original NEW_MESSAGE will be marked "overwritten"
// - Then our custom LLM_CALL is enqueued and processed

const AGENT_ID = "overwriter-agent-1";
const AGENT_NAME = "Overwriter";

const overwriterAgent: AgentConfig = {
    id: AGENT_ID,
    name: AGENT_NAME,
    role: "assistant",
    instructions: "You are Overwriter. Be concise.",
    llmOptions: {
        provider: "openai",
        model: "gpt-5",
        temperature: 1,
        apiKey: Deno.env.get("DEFAULT_OPENAI_KEY") || "",
        stream: true,
    },
    allowedTools: ["verbal_pause"],
};

const dbFilePath = `${Deno.cwd()}/db.db`;
const THREAD_EXT_ID = "overwriting-events-demo";

const copilotz = await createCopilotz({
    agents: [overwriterAgent],
    dbConfig: { url: `file:${dbFilePath}` },
    stream: true,
});

// Unified onEvent that overwrites incoming user NEW_MESSAGE with our own LLM_CALL
const onEvent = (ev: Event) => {
    if (ev.type === "NEW_MESSAGE") {
        console.log(`[onEvent] NEW_MESSAGE received: ${JSON.stringify(ev)}`);
        const payload = ev.payload;
        const senderType = payload.sender?.type ?? "user";
        if (senderType === "user") {
            if (typeof ev.threadId !== "string") {
                console.warn("[overwrite] Skipping: invalid threadId on event");
                return;
            }
            const _userText =
                typeof payload.content === "string"
                    ? payload.content
                    : Array.isArray(payload.content)
                        ? JSON.stringify(payload.content)
                        : "";

            console.log(`[overwrite] NEW_MESSAGE from user detected -> replacing with TOOL_CALL (verbal_pause)`);

            const toolPayload: ToolCallEventPayload = {
                agentName: AGENT_NAME,
                senderId: AGENT_ID,
                senderType: "agent",
                call: {
                    id: `verbal_pause_${Date.now()}`,
                    function: {
                        name: "verbal_pause",
                        arguments: "{}",
                    },
                },
            };

            const produced: NewEvent = {
                threadId: ev.threadId,
                type: "TOOL_CALL",
                payload: toolPayload,
                parentEventId: typeof ev.id === "string" ? ev.id : undefined,
                traceId: typeof ev.traceId === "string" ? ev.traceId : undefined,
                priority: typeof ev.priority === "number" ? ev.priority : undefined,
            };
            console.log(`[produced] TOOL_CALL produced: ${JSON.stringify(produced)}`);
            return { producedEvents: [produced] };
        }
    }
    // Do not override other events
    return;
};

const controller = await copilotz.start(
    {
        content: "Please introduce yourself in one short sentence.",
        sender: { type: "user", name: "CLI" },
        thread: { externalId: THREAD_EXT_ID },
    },
    onEvent,

);

// Drain and display events (so you can observe 'overwritten' status in logs/db)
await controller.closed;

await copilotz.shutdown();


