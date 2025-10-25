interface ReadFileParams {
    path: string;
    encoding?: string;
}

export default {
    key: "read_file",
    name: "Read File",
    description: "Read content from a file on the local filesystem.",
    inputSchema: {
        type: "object",
        properties: {
            path: { type: "string", description: "Path to the file to read." },
            encoding: { 
                type: "string", 
                description: "Text encoding (always utf8 for text files).",
                default: "utf8"
            },
        },
        required: ["path"],
    },
    execute: async ({ path, encoding = "utf8" }: ReadFileParams) => {
        try {
            // Security check - prevent directory traversal
            if (path.includes("..") || path.includes("~")) {
                throw new Error("Directory traversal not allowed");
            }
            
            // Read file content (Deno.readTextFile always uses UTF-8)
            const content = await Deno.readTextFile(path);
            
            return {
                path,
                content,
                size: content.length,
                encoding: "utf8"
            };
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                throw new Error(`File not found: ${path}`);
            } else if (error instanceof Deno.errors.PermissionDenied) {
                throw new Error(`Permission denied: ${path}`);
            }
            throw new Error(`Failed to read file: ${(error as Error).message}`);
        }
    },
}