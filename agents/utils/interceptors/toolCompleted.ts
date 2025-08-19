import type { ToolCompletedData, ToolCompletedResponse } from "copilotz/agents";
import { utils } from "copilotz/agents";

type Media = { key: string, value: string };
type HandleMediaInput = { medias: Media[], output: ToolCompletedData['toolOutput'], sanitized: ToolCompletedData['toolOutput'] };
type HandleMediaSync = (input: HandleMediaInput) => ToolCompletedResponse;
type HandleMediaAsync = (input: HandleMediaInput) => Promise<ToolCompletedResponse>;
type HandleMediaVoid = (input: HandleMediaInput) => void;

export type HandleMedia = HandleMediaSync | HandleMediaAsync | HandleMediaVoid;

export async function interceptMediaInToolOutput(data: any, handleMedia: HandleMedia = () => { }): Promise<any> {
    const { output } = data;
    const { data: sanitized, content } = utils.general.sanitizeBase64DataUrl(output);

    const medias = content.map(({ key, value }: { key: string, value: string }) => {
        return { key, value };
    });
    const newToolOutput = await handleMedia({ medias, output, sanitized });

    return newToolOutput;
}
