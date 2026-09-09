/** Reserves eligible durable conversation history for consolidation. @module */
import { defineProcessor, type Processor } from "@copilotz/copilotz/plugins";
import type { LongTermMemoryConfig } from "../../resources/config/index.ts";

import type { MemoryProcessorContext } from "../../internal/contracts.ts";
import { reserveMemoryCheckpoint } from "../../internal/reservation.ts";

export function createMemoryReservationProcessor(
  config: LongTermMemoryConfig,
): Processor<MemoryProcessorContext> {
  return defineProcessor({
    id: "copilotz.memory.reserve",
    on: [{ eventType: "message.created" }],
    settlement: "detached",
    async handle(event, context) {
      if (event.visibility?.kind === "internal") return;
      if (!event.durable || !event.threadId || !event.subject) return;
      const messageRecord = await context.collections.message.get({
        id: event.subject.id,
      });
      if (!messageRecord) return;
      await reserveMemoryCheckpoint(context, messageRecord, config);
    },
  });
}
