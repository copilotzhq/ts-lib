import { assertEquals, assertThrows } from "@std/assert";
import { validateAgainstJsonSchema } from "../collections/validate.ts";
import {
  contentRefSchema,
  contentSequenceSchema,
  isContentRef,
} from "./schema.ts";

Deno.test("canonical content schema and reference guard validate shared metadata", () => {
  const ref = {
    assetId: "a",
    kind: "text",
    role: "body",
    mediaType: "text/plain",
  };
  for (const kind of contentRefSchema.properties.kind.enum) {
    const value = {
      ...ref,
      kind,
      name: "content",
      disposition: "inline",
      metadata: { source: "test" },
    };
    assertEquals(isContentRef(value), true);
    validateAgainstJsonSchema(contentSequenceSchema, [value], "content");
  }
  for (
    const patch of [
      { assetId: 3 },
      { kind: "unknown" },
      { role: null },
      { mediaType: [] },
      { name: 1 },
      { disposition: "unknown" },
      { metadata: [] },
    ]
  ) {
    const invalid = { ...ref, ...patch };
    assertEquals(isContentRef(invalid), false);
    assertThrows(() =>
      validateAgainstJsonSchema(contentRefSchema, invalid, "content")
    );
  }
  // A reference guard permits resolved entries; the persisted schema does not.
  assertEquals(isContentRef({ ...ref, value: "prepared" }), true);
  assertThrows(() =>
    validateAgainstJsonSchema(
      contentRefSchema,
      { ...ref, value: "prepared" },
      "content",
    )
  );
  assertEquals(isContentRef(null), false);
  assertEquals(isContentRef([]), false);
});
