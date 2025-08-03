import type { ToolCompletedData, ToolCompletedResponse } from "copilotz/agents";
import { utils } from "copilotz/agents";

type Media = { key: string, value: string };
type HandleMediaInput = { medias: Media[], toolOutput: ToolCompletedData['toolOutput'], sanitized: ToolCompletedData['toolOutput'] };
type HandleMediaSync = (input: HandleMediaInput) => ToolCompletedResponse;
type HandleMediaAsync = (input: HandleMediaInput) => Promise<ToolCompletedResponse>;
type HandleMediaVoid = (input: HandleMediaInput) => void;

export type HandleMedia = HandleMediaSync | HandleMediaAsync | HandleMediaVoid;

export async function interceptMediaInToolOutput(data: ToolCompletedData, handleMedia: HandleMedia = () => { }): Promise<ToolCompletedResponse> {
    const { toolOutput, ...rest } = data;
    const { data: sanitized, content } = utils.general.sanitizeBase64DataUrl(toolOutput);
    const medias = content.map(({ key, value }: { key: string, value: string }) => {
        return { key, value };
    });
    const newToolOutput = await handleMedia({ medias, toolOutput, sanitized });

    return { ...rest, toolOutput: newToolOutput || toolOutput };
}