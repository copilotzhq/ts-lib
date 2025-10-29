import { pgTable, uuid, text, varchar, jsonb, timestamp } from "../../drizzle.ts";
import { threads } from "../threads/index.ts";
import { users } from "../users/index.ts";

export const messages: any = pgTable("messages", {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
        .notNull()
        .references(() => threads.id),
    senderUserId: uuid("sender_user_id").references(() => users.id),
    senderId: text("sender_id").notNull(),
    senderType: varchar("sender_type", { enum: ["agent", "user", "system", "tool"] })
        .notNull(),
    externalId: varchar("external_id", { length: 255 }),
    content: text("content"),
    toolCallId: varchar("tool_call_id", { length: 255 }),
    toolCalls: jsonb("tool_calls").$type<object[]>(),
    metadata: jsonb("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type MessagePayload = Omit<NewMessage, "id" | "threadId" | "senderUserId" | "createdAt" | "updatedAt">;