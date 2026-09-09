/** Built-in Action that returns the current time.
 *
 * @module
 */

import { defineAction } from "@copilotz/copilotz/actions";
import { record } from "../internal/input.ts";

export function createGetCurrentTimeAction(now: () => Date) {
  return defineAction({
    id: "copilotz.tools.builtin.get_current_time",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["iso", "readable", "timestamp", "date-only", "time-only"],
          default: "iso",
        },
        timezone: { type: "string", default: "local" },
      },
    },
    execute(raw) {
      const input = record(raw);
      const format = typeof input.format === "string" ? input.format : "iso";
      const timezone = typeof input.timezone === "string"
        ? input.timezone
        : "local";
      const value = now();
      const timeZone = timezone === "local" ? undefined : timezone;
      let currentTime: string | number;
      if (format === "timestamp") currentTime = value.getTime();
      else if (format === "date-only") {
        currentTime = value.toISOString().slice(0, 10);
      } else if (format === "time-only") {
        currentTime = new Intl.DateTimeFormat("en-GB", {
          timeZone,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        }).format(value);
      } else if (format === "readable") {
        currentTime = new Intl.DateTimeFormat(undefined, {
          timeZone,
          dateStyle: "medium",
          timeStyle: "long",
        }).format(value);
      } else currentTime = value.toISOString();
      return {
        current_time: currentTime,
        format,
        timezone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: value.getTime(),
        iso: value.toISOString(),
      };
    },
  });
}
