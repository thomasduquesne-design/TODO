import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const streams = sqliteTable("streams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  owner: text("owner").notNull(),
  dueDate: text("due_date").notNull(),
  progress: integer("progress").notNull().default(0),
  prompt: text("prompt").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
