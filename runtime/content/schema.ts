import type { ContentRef } from "./types.ts";

/** Canonical persisted content reference; resolved values are not stored here. */
export const contentRefSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    assetId: { type: "string" },
    kind: {
      type: "string",
      enum: ["text", "json", "image", "audio", "video", "file"],
    },
    role: { type: "string" },
    mediaType: { type: "string" },
    name: { type: "string" },
    alt: { type: "string" },
    language: { type: "string" },
    disposition: { type: "string", enum: ["inline", "attachment"] },
    metadata: { type: "object" },
  },
  required: ["assetId", "kind", "role", "mediaType"],
} as const;

export const contentSequenceSchema = {
  type: "array",
  items: contentRefSchema,
} as const;

/** Checks reference metadata; additional resolved-value properties are allowed. */
export function isContentRef(value: unknown): value is ContentRef {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  if (!contentRefSchema.required.every((key) => typeof ref[key] === "string")) {
    return false;
  }
  if (
    !(contentRefSchema.properties.kind.enum as readonly unknown[]).includes(
      ref.kind,
    )
  ) return false;
  for (const key of ["name", "alt", "language"] as const) {
    if (ref[key] !== undefined && typeof ref[key] !== "string") return false;
  }
  if (
    ref.disposition !== undefined &&
    !(contentRefSchema.properties.disposition.enum as readonly unknown[])
      .includes(ref.disposition)
  ) return false;
  return ref.metadata === undefined || (
    ref.metadata !== null && typeof ref.metadata === "object" &&
    !Array.isArray(ref.metadata)
  );
}
