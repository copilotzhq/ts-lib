/**
 * Default configuration for semantic-memory maintenance.
 *
 * @module
 */

export type LongTermMemoryConfig = Readonly<{
  triggerEstimatedTokens: number;
  retainRecentEstimatedTokens: number;
  maxContentEstimatedTokens: number;
  retrievalLimit: number;
}>;

export const DEFAULT_LONG_TERM_MEMORY_CONFIG: LongTermMemoryConfig = Object
  .freeze({
    triggerEstimatedTokens: 20_000,
    retainRecentEstimatedTokens: 0,
    maxContentEstimatedTokens: 12_000,
    retrievalLimit: 20,
  });

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

/** Applies the Memory plugin's durable configuration defaults and bounds. */
export function normalizedConfig(
  value?: Partial<LongTermMemoryConfig>,
): LongTermMemoryConfig {
  return Object.freeze({
    triggerEstimatedTokens: positiveInteger(
      value?.triggerEstimatedTokens,
      DEFAULT_LONG_TERM_MEMORY_CONFIG.triggerEstimatedTokens,
    ),
    retainRecentEstimatedTokens: nonNegativeInteger(
      value?.retainRecentEstimatedTokens,
      DEFAULT_LONG_TERM_MEMORY_CONFIG.retainRecentEstimatedTokens,
    ),
    maxContentEstimatedTokens: positiveInteger(
      value?.maxContentEstimatedTokens,
      DEFAULT_LONG_TERM_MEMORY_CONFIG.maxContentEstimatedTokens,
    ),
    retrievalLimit: positiveInteger(
      value?.retrievalLimit,
      DEFAULT_LONG_TERM_MEMORY_CONFIG.retrievalLimit,
    ),
  });
}
