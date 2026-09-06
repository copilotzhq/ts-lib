import { assertEquals } from "@std/assert";
import { getPath, setPath } from "./content-path.ts";

Deno.test("content paths share object-only traversal and normalized separators", () => {
  const record = {
    nested: { body: ["ref"] },
    rows: [{ body: ["ref"] }],
    empty: null,
  };
  assertEquals(getPath(record, ".nested..body."), ["ref"]);
  assertEquals(getPath(record, "rows.0.body"), undefined);
  assertEquals(getPath(record, "empty.body"), undefined);
  setPath(record, ".nested..body.", ["replacement"]);
  assertEquals(getPath(record, "nested.body"), ["replacement"]);
  const missing = {};
  setPath(missing, "nested.body", []);
  assertEquals(getPath(missing, "nested.body"), []);
});
