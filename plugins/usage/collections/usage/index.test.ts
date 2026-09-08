import { assert, assertEquals } from "@std/assert";
import { usageCollection } from "./index.ts";

Deno.test("Usage Collection retains its canonical name", () => {
  assertEquals(usageCollection.name, "usage");
  assert("connection" in usageCollection.schema.properties);
  assert("cacheCreationInputTokens" in usageCollection.schema.properties);
});
