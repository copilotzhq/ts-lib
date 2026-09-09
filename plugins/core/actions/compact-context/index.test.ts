import { assertEquals } from "@std/assert";
import { compactContextAction } from "./index.ts";

Deno.test("foreground context compaction owns its durable Action identity", () => {
  assertEquals(compactContextAction.id, "copilotz.core.context.compact");
});
