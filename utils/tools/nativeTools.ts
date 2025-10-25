import { nativeTools } from "@/event-processors/tool_call/native-tools-registry/index.ts";
import type { Tool } from "@/interfaces/index.ts";

export function getNativeTools(): { [key: string]: Tool } {
    return nativeTools;
}