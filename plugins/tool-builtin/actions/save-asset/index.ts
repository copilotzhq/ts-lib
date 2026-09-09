/** Built-in Action that validates an existing asset reference.
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

export function createSaveAssetAction() {
  return defineAction({
    id: "copilotz.tools.builtin.save_asset",
    inputSchema: {
      type: "object",
      properties: { assetId: { type: "string" }, ref: { type: "string" } },
      oneOf: [{ required: ["assetId"] }, { required: ["ref"] }],
    },
    async execute(raw, context) {
      const id = assetIdFromInput(context.namespace, record(raw));
      const asset = await context.content.get(id);
      if (!asset) throw new Error(`Asset '${id}' was not found.`);
      const kind = assetKind(asset.mediaType);
      return {
        assetId: asset.id,
        assetRef: formatAssetRef(context.namespace, asset.id),
        content: {
          assetId: asset.id,
          kind,
          role: "attachment",
          mediaType: asset.mediaType,
        },
        mimeType: asset.mediaType,
        size: asset.byteLength,
        kind,
      };
    },
  });
}
