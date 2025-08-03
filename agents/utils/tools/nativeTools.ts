import { nativeTools } from "../../tools/registry/index.ts";
import type { RunnableTool } from "../../Interfaces.ts";

export function getNativeTools(): { [key: string]: RunnableTool } {
    return nativeTools;
}