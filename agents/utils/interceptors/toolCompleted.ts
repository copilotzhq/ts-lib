
import * as utils from "../index.ts";

type Media = { key: string, value: string };
type HandleMediaInput = { medias: Media[], output: any, sanitized: any };
type HandleMediaSync = (input: HandleMediaInput) => any;
type HandleMediaAsync = (input: HandleMediaInput) => Promise<any>;
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
