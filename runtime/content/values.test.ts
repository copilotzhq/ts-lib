import { assertEquals, assertRejects } from "@std/assert";
import { createMemoryAssetRepository } from "./repository.ts";
import { createContentNormalizer } from "./normalizer.ts";
import { createContentResolver } from "./resolver.ts";
import { resolveContentInputs } from "./values.ts";

Deno.test("content values resolve mixed inputs in one authorized batch without publishing literals", async () => {
  const assets = createMemoryAssetRepository();
  const refs = await createContentNormalizer({ assets }).normalize([
    "hello",
    { type: "json", value: { ok: true } },
    {
      type: "file",
      bytes: new Uint8Array([0, 255]),
      mediaType: "application/octet-stream",
      name: "a.bin",
    },
  ], { namespace: "a" });
  const resolver = createContentResolver({ assets });
  let batches = 0;
  const values = await resolveContentInputs(["literal", ...refs, refs[2]], {
    resolveMany(input) {
      batches++;
      return resolver.getMany(input, { namespace: "a" });
    },
  });
  assertEquals(batches, 1);
  assertEquals(values[0], "literal");
  assertEquals(
    typeof values[1] === "object" && values[1].type === "text" &&
      values[1].text,
    "hello",
  );
  assertEquals(
    typeof values[2] === "object" && values[2].type === "json" &&
      values[2].value,
    { ok: true },
  );
  const file = values[3];
  const repeated = values[4];
  if (
    typeof file !== "object" || !("bytes" in file) ||
    typeof repeated !== "object" || !("bytes" in repeated)
  ) throw new Error("Expected files");
  assertEquals(file.name, "a.bin");
  assertEquals(file.bytes, new Uint8Array([0, 255]));
  file.bytes[0] = 10;
  assertEquals(repeated.bytes[0], 0);
  await assertRejects(() =>
    resolveContentInputs(refs, {
      resolveMany: (input) => resolver.getMany(input, { namespace: "other" }),
    })
  );
  const denied = createContentResolver({ assets, authorize: () => false });
  await assertRejects(() =>
    resolveContentInputs(refs, {
      resolveMany: (input) => denied.getMany(input, { namespace: "a" }),
    })
  );
});

Deno.test("invalid reference metadata is rejected before any content body read", async () => {
  let reads = 0;
  const content = {
    resolveMany: () => {
      reads++;
      return Promise.resolve([]);
    },
  };
  for (
    const patch of [{ kind: "unknown" }, { role: 42 }, { mediaType: null }, {
      disposition: "unknown",
    }]
  ) {
    const ref = {
      assetId: "asset",
      kind: "text",
      role: "body",
      mediaType: "text/plain",
      ...patch,
    };
    await assertRejects(
      () => resolveContentInputs([ref as never], content),
      TypeError,
      "Invalid content reference metadata",
    );
  }
  assertEquals(reads, 0);
});
