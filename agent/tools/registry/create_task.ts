import { createOperations } from "../../database/operations.ts";
import { ToolExecutionContext } from "../../Interfaces.ts";

interface CreateTaskParams {
    name: string;
    goal: string;
}

export default {
    key: "create_task",
    name: "Create Task",
    description: "Creates a new task.",
    inputSchema: {
        type: "object",
        properties: {
            name: { type: "string", description: "The name of the task." },
            goal: { type: "string", description: "The goal of the task." },
        },
        required: ["name", "goal"],
    },
    execute: async ({ name, goal }: CreateTaskParams, context?: ToolExecutionContext) => {
        // Get database instance from context or fallback to global
        const db = context?.db;
        const ops = createOperations(db);
        const task = await ops.createTask({ name, goal });
        return { task };
    },
}