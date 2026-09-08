/** Process-local LLM connection declarations. @module */

import {
  type LlmAuthResolution,
  type LlmConnectionContext,
  type LlmConnectionExecution,
  type LlmConnectionResource,
  type LlmJsonObject,
  type LlmJsonValue,
  type LlmMode,
  normalizeLlmConnection,
} from "../../internal/contracts.ts";

export type {
  LlmAuthResolution,
  LlmConnectionContext,
  LlmConnectionExecution,
  LlmConnectionResource,
  LlmJsonObject,
  LlmJsonValue,
  LlmMode,
};

/** Validates and freezes one process-local connection without registering it. */
export function defineLlmConnection(
  connection: LlmConnectionResource,
): LlmConnectionResource {
  return normalizeLlmConnection(connection);
}

export { normalizeLlmModelSelections } from "../../internal/contracts.ts";
export type {
  LlmAuthResolver,
  LlmModelSelection,
  LlmModelSelections,
} from "../../internal/contracts.ts";
