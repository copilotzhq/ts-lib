export function createFileLogger(path: string = "mcp-client.log") {

    // override console.log with our log function avoid 
    // interference with mcp server std transport
    Object.keys(globalThis.console).forEach((key: string) => {
        globalThis.console[key as keyof Console] = log;
    });

    function log(...args: any[]) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${args.join(" ")}\n`;
        Deno.writeTextFileSync(path, logMessage, { append: true });
    }

    return log;
}