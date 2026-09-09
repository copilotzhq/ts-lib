/** Built-in Action that fetches asset metadata.
 *
 * @module
 */

import { defineAction } from "@copilotz/copilotz/actions";
import {
  assetIdFromInput,
  assetKind,
  formatAssetRef,
} from "../internal/assets.ts";
import { record } from "../internal/input.ts";

export function createFetchAssetAction() {
  return defineAction({
    id: "copilotz.tools.builtin.fetch_asset",
    inputSchema: {
      type: "object",
      properties: {
        assetId: { type: "string" },
        id: { type: "string" },
        ref: { type: "string" },
      },
      anyOf: [{ required: ["assetId"] }, { required: ["id"] }, {
        required: ["ref"],
      }],
    },
    async execute(raw, context) {
      const id = assetIdFromInput(context.namespace, record(raw));
      const asset = await context.content.get(id);
      if (!asset) throw new Error(`Asset '${id}' was not found.`);
      const kind = assetKind(asset.mediaType);
      return {
        assetId: id,
        assetRef: formatAssetRef(context.namespace, id),
        content: Object.freeze({
          assetId: id,
          kind,
          role: "attachment",
          mediaType: asset.mediaType,
        }),
        mimeType: asset.mediaType,
        size: asset.byteLength,
      };
    },
  });
}
