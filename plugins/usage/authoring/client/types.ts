/** Browser-safe analytics contract shared by Usage consumers. @module */
export type UsageAnalyticsKind = "llm" | "tool";
export type UsageGroup =
  | "provider"
  | "model"
  | "connection"
  | "resource"
  | "agentId"
  | "threadId";
export type UsageInterval = "hour" | "day" | "week";
export interface UsageFilters {
  kind: UsageAnalyticsKind;
  from: string;
  to: string;
  provider?: string;
  model?: string;
  connection?: string;
  resource?: string;
  agentId?: string;
  threadId?: string;
  status?: string;
}
export interface UsageMetrics {
  attempts: number;
  completed: number;
  failed: number;
  cancelled: number;
  deferred: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
  cacheCreationInputTokens: number | null;
  totalTokens: number | null;
  durationMs: number | null;
  averageDurationMs: number | null;
  durationReported: number;
  inputReported: number;
  cacheReported: number;
  /** Input tokens only from attempts reporting both input and cache reads. */
  cacheMeasuredInputTokens: number | null;
  /** Cache reads from the same measured attempts. */
  cacheMeasuredReadTokens: number | null;
  cacheReuse: number | null;
  /** Fraction of attempts with both input and cache-read measurements. */
  cacheCoverage: number | null;
}
export interface UsageBreakdown extends UsageMetrics {
  key: string;
  dimensions: Record<string, string | null>;
}
export interface UsageSeriesPoint extends UsageMetrics {
  bucket: string;
}
export interface UsageAnalytics {
  summary: UsageMetrics;
  series: UsageSeriesPoint[];
  breakdown: UsageBreakdown[];
  filters: UsageFilters;
  groupBy: UsageGroup[];
  interval: UsageInterval;
  generatedAt: string;
  timezone: "UTC";
}
export interface UsageAttempt {
  id: string;
  kind: string;
  provider: string | null;
  model: string | null;
  connection: string | null;
  resource: string | null;
  agentId: string | null;
  threadId: string | null;
  status: string | null;
  occurredAt: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  durationMs: number | null;
}
export interface UsageAttemptPage {
  items: UsageAttempt[];
  pageInfo: { next: string | null; hasMore: boolean };
}
export interface UsageAnalyticsRequest {
  filters: UsageFilters;
  groupBy?: UsageGroup[];
  interval?: UsageInterval;
  signal?: AbortSignal;
}
export interface UsageAttemptsRequest {
  filters: UsageFilters;
  after?: string;
  limit?: number;
  signal?: AbortSignal;
}
export interface UsageDataSource {
  analytics(request: UsageAnalyticsRequest): Promise<UsageAnalytics>;
  attempts(request: UsageAttemptsRequest): Promise<UsageAttemptPage>;
}
