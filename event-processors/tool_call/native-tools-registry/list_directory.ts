interface ListDirectoryParams {
    path: string;
    showHidden?: boolean;
}

interface DirectoryEntry {
    name: string;
    type: "file" | "directory";
    size?: number;
}

export default {
    key: "list_directory",
    name: "List Directory",
    description: "List contents of a directory.",
    inputSchema: {
        type: "object",
        properties: {
            path: { 
                type: "string", 
                description: "Path to the directory to list.",
                default: "."
            },
            showHidden: {
                type: "boolean",
                description: "Include hidden files (starting with .).",
                default: false
            },
        },
    },
    execute: async ({ path = ".", showHidden = false }: ListDirectoryParams) => {
        try {
            // Security check - prevent directory traversal
            if (path.includes("..") || path.includes("~")) {
                throw new Error("Directory traversal not allowed");
            }
            
            const entries: DirectoryEntry[] = [];
            
            for await (const entry of Deno.readDir(path)) {
                // Skip hidden files unless requested
                if (!showHidden && entry.name.startsWith(".")) {
                    continue;
                }
                
                const dirEntry: DirectoryEntry = {
                    name: entry.name,
                    type: entry.isFile ? "file" : "directory"
                };
                
                // Try to get file size for files
                if (entry.isFile) {
                    try {
                        const stat = await Deno.stat(`${path}/${entry.name}`);
                        dirEntry.size = stat.size;
                    } catch {
                        // Ignore stat errors
                    }
                }
                
                entries.push(dirEntry);
            }
            
            // Sort: directories first, then files, alphabetically
            entries.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === "directory" ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });
            
            return {
                path,
                entries,
                count: entries.length
            };
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                throw new Error(`Directory not found: ${path}`);
            } else if (error instanceof Deno.errors.PermissionDenied) {
                throw new Error(`Permission denied: ${path}`);
            }
            throw new Error(`Failed to list directory: ${(error as Error).message}`);
        }
    },
}