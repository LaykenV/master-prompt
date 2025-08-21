import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { MODEL_ID_SCHEMA } from "./agent";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,
  multiModelRuns: defineTable({
    masterMessageId: v.string(),
    masterThreadId: v.string(),
    masterModelId: MODEL_ID_SCHEMA,
    allRuns: v.array(v.object({
      modelId: MODEL_ID_SCHEMA,
      threadId: v.string(),
      isMaster: v.boolean(),
    })),
  })
    .index("by_master_message", ["masterMessageId"]) 
    .index("by_master_thread", ["masterThreadId"]),
});
