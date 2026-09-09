import { assertEquals } from "@std/assert";
import { pendingDependenciesOutsideCandidate } from "./implementation.ts";

Deno.test("a completed Tool or Ask result outside a bounded prefix keeps its group pending", () => {
  const dependencies = new Map<string, readonly string[]>([
    ["plan-message", ["plan:release"]],
    ["tool-result", ["plan:release"]],
    ["ask-question", ["ask:approval", "plan:release"]],
    ["ask-answer", ["ask:approval", "plan:release"]],
  ]);

  assertEquals(
    [...pendingDependenciesOutsideCandidate(
      dependencies,
      new Set(["plan-message", "ask-question"]),
    )].sort(),
    ["ask:approval", "plan:release"],
  );
  assertEquals(
    [...pendingDependenciesOutsideCandidate(
      dependencies,
      new Set(["plan-message", "tool-result", "ask-question", "ask-answer"]),
    )],
    [],
  );
});
