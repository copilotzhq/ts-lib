import { createContentError } from "./errors.ts";
import type { ContentBodyValue, ContentKind } from "./types.ts";

type DecodeContext = { namespace?: string; assetId?: string };
type DecodedBody = { text?: string; value: ContentBodyValue };

/** Decode each interpretation once while returning independent JSON/binary values. */
export function createContentBodyDecoder(
  bytes: Uint8Array,
  context: DecodeContext = {},
) {
  let text: string | undefined;
  let json: { value: ContentBodyValue } | undefined;
  return (kind: ContentKind): DecodedBody => {
    try {
      if (kind !== "text" && kind !== "json") return { value: bytes.slice() };
      text ??= new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (kind === "text") return { text, value: text };
      json ??= { value: JSON.parse(text) };
      return { text, value: structuredClone(json.value) };
    } catch (cause) {
      throw createContentError(
        "asset_corrupted",
        `Content body cannot be decoded${
          context.assetId ? `: ${context.assetId}` : "."
        }`,
        { ...context, cause },
      );
    }
  };
}

/** One strict byte-to-value conversion for stored and hydrated content. */
export function decodeContentBody(
  bytes: Uint8Array,
  kind: ContentKind,
  context: DecodeContext = {},
): DecodedBody {
  return createContentBodyDecoder(bytes, context)(kind);
}
