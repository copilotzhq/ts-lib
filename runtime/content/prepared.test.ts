import { assert, assertEquals } from "@std/assert";
import { adoptPreparedBody } from "./prepared.ts";
import { createContentPreparer } from "./preparer.ts";
import { createMemoryBodyStore } from "./body-store.ts";
import type { PreparedContent } from "./types.ts";

Deno.test("prepared body adoption preserves target identity and rejects mismatched or unsealed bodies", async () => {
  const preparer = createContentPreparer();
  const target = await preparer.prepare("hello", { namespace: "a" });
  const source = await preparer.prepare("hello", { namespace: "a" });
  const asset = source.assets[0];
  const readyBody = await createMemoryBodyStore().put({
    bodyId: "stream",
    bytes: asset.body,
    digest: asset.digest,
    mediaType: asset.mediaType,
  });
  const ready: PreparedContent = {
    content: source.content,
    assets: [{
      ...asset,
      readyBody,
      location: { kind: "memory", backendId: "memory", key: "stream" },
    }],
  };
  const adopted = adoptPreparedBody(target, ready);
  assert(adopted);
  assertEquals(adopted.content, target.content);
  assertEquals(adopted.assets[0].id, target.assets[0].id);
  assertEquals(adopted.assets[0].readyBody, readyBody);
  assertEquals(adopted.assets[0].body.length, 0);
  assertEquals(target.assets[0].body.length, 5);
  assertEquals(adoptPreparedBody(target, source), undefined);
  for (
    const patch of [{ namespace: "other" }, { mediaType: "text/html" }, {
      byteLength: 3,
    }, { digest: "sha256:other" as const }]
  ) {
    assertEquals(
      adoptPreparedBody(target, {
        ...ready,
        assets: [{ ...ready.assets[0], ...patch }],
      }),
      undefined,
    );
  }
  assertEquals(
    adoptPreparedBody(target, {
      ...ready,
      content: [source.content[0], source.content[0]],
    }),
    undefined,
  );
});
