import type { Agent, Thread } from "@/interfaces/index.ts";

export interface LLMContextData {
    threadContext: string;
    taskContext: string;
    agentContext: string;
    systemPrompt: string;
}

export function contextGenerator(
    agent: Agent,
    thread: Thread,
    activeTask: unknown,
    availableAgents: Agent[],
    allSystemAgents: Agent[]
): LLMContextData {
    const participantInfo = thread.participants?.map((p: string) => {
        const agentInfo = availableAgents.find((a: Agent) => a.name === p);
        return `name: ${p} | role: ${agentInfo?.role || "N/A"} | description: ${agentInfo?.description || "N/A"}`;
    }).join("\n- ") || "N/A";

    const otherAvailableAgents = allSystemAgents.filter(a =>
        a.name !== agent.name &&
        !(thread.participants?.includes(a.name))
    );

    const availableAgentsInfo = otherAvailableAgents.length > 0 ?
        otherAvailableAgents.map(a =>
            `name: ${a.name} | role: ${a.role} | description: ${a.description || "N/A"}`
        ).join("\n- ") : "None";

    const threadContext = [
        "## THREAD CONTEXT",
        `Current thread: "${thread.name}".`,
        ...(thread?.participants && thread.participants.length > 1 ? [
            `Participants in this thread:`,
            `- ${participantInfo}`,
            "",
            "IMPORTANT: In the conversation history, messages from other participants are prefixed with [SpeakerName]: to help you understand who said what. Your own previous messages appear without prefixes.",
            "",
            `If you expect an answer from a specific participant, use mention with @<name>, for example: @${thread.participants?.find((p: string) => p !== agent.name)} (otherwise, the participant will not be able to see your message).`
        ] : []),
        ...(otherAvailableAgents.length > 0 ? [
            "",
            "Other available agents (not in current thread):",
            `- ${availableAgentsInfo}`,
            "",
            "NOTE: You can communicate with these agents using tools like 'ask_question' for quick queries or 'create_thread' for longer discussions."
        ] : [])
    ].filter(Boolean).join("\n");

    let taskContext = "";
    if (activeTask && typeof activeTask === 'object') {
        const at = activeTask as { name?: string; goal?: string; status?: string };
        if (at.name || at.goal || at.status) {
            taskContext = [
                "## TASK CONTEXT",
                `Current task: ${at.name ?? "N/A"}`,
                `Goal: ${at.goal ?? "N/A"}`,
                `Status: ${at.status ?? "N/A"}`
            ].join("\n");
        }
    }

    const agentContext = [
        "## IDENTITY",
        `You are ${agent.name}`,
        `Your role is: ${agent.role}`,
        `Personality: ${agent.personality}`,
        `Your instructions are: ${agent.instructions}`
    ].join("\n");

    const currentDate = new Date().toLocaleString();
    const dateContext = `Current date and time: ${currentDate}`;

    const systemPrompt = [threadContext, taskContext, agentContext, dateContext]
        .filter(Boolean)
        .join("\n\n");

    return {
        threadContext,
        taskContext,
        agentContext,
        systemPrompt,
    };
}