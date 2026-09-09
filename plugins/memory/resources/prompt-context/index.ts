/** Provides the latest settled semantic memory as conversation context. @module */
import { createMemoryContextResource as createImplementation } from "../../internal/implementation.ts";
import type { ContextResource } from "@copilotz/copilotz/core";
import type { LongTermMemoryConfig } from "../../resources/config/index.ts";

export function createMemoryContextResource(
  enabled: boolean,
  config?: LongTermMemoryConfig,
): ContextResource & Readonly<{ historyAfterMessageId?: string }> {
  return createImplementation(enabled, config);
}
