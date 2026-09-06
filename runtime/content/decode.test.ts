import { assertEquals, assertRejects } from "@std/assert";
import { createMemoryAssetRepository } from "./repository.ts";
import { createContentResolver } from "./resolver.ts";
import { decodeContentBody } from "./decode.ts";
import type { ContentError, ContentRef } from "./types.ts";

Deno.test("stored text and JSON reject malformed UTF-8 with asset identity; binary stays exact", async () => {
  const assets = createMemoryAssetRepository();
  const bytes = new Uint8Array([0xc3, 0x28]);
  const asset = await assets.publish({
    namespace: "tenant",
    body: bytes,
    mediaType: "application/octet-stream",
  });
  const resolver = createContentResolver({ assets });
  for (const kind of ["text", "json"] as const) {
    const ref: ContentRef = {
      assetId: asset.id,
      kind,
      role: "body",
      mediaType: asset.mediaType,
    };
    const error = await assertRejects(() =>
      resolver.get(ref, { namespace: "tenant" })
    );
    assertEquals((error as ContentError).code, "asset_corrupted");
    assertEquals((error as ContentError).assetId, asset.id);
    assertEquals((error as ContentError).namespace, "tenant");
  }
  const binary = decodeContentBody(bytes, "file").value;
  assertEquals(binary, bytes);
  assertEquals(binary === bytes, false);
  assertEquals(
    decodeContentBody(new TextEncoder().encode('"你好"'), "json").value,
    "你好",
  );
});
