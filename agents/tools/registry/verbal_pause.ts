export default {
    key: "verbal_pause",
    name: "Verbal Pause",
    description: "Use this to make a verbal pause and continue in the next turn; in order to emphasize key points and convey confidence - allowing other participants to process information.",
    inputSchema: null,
    outputSchema: null,
    execute: async (): Promise<{ response: string }> => {
        return { response: "ok" };
    },
}