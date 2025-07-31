interface WriteFileParams {
    path: string;
    content: string;
    encoding?: string;
    createDirs?: boolean;
}

export default {
    key: "write_file",
    name: "Write File",
    description: "Write content to a file on the local filesystem.",
    inputSchema: {
        type: "object",
        properties: {
            path: { type: "string", description: "Path to the file to write." },
            content: { type: "string", description: "Content to write to the file." },
            encoding: { 
                type: "string", 
                description: "Text encoding (always utf8 for text files).",
                default: "utf8"
            },
            createDirs: {
                type: "boolean",
                description: "Create parent directories if they don't exist.",
                default: false
            },
        },
        required: ["path", "content"],
    },
    execute: async ({ path, content, encoding = "utf8", createDirs = false }: WriteFileParams) => {
        try {
            // Security check - prevent directory traversal
            if (path.includes("..") || path.includes("~")) {
                throw new Error("Directory traversal not allowed");
            }
            
            // Create parent directories if requested
            if (createDirs) {
                const dir = path.substring(0, path.lastIndexOf("/"));
                if (dir) {
                    await Deno.mkdir(dir, { recursive: true });
                }
            }
            
            // Write file content (Deno.writeTextFile always uses UTF-8)
            await Deno.writeTextFile(path, content);
            
            return {
                path,
                size: content.length,
                encoding: "utf8",
                created: createDirs
            };
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                throw new Error(`Directory not found: ${path}`);
            } else if (error instanceof Deno.errors.PermissionDenied) {
                throw new Error(`Permission denied: ${path}`);
            }
            throw new Error(`Failed to write file: ${(error as Error).message}`);
        }
    },
}