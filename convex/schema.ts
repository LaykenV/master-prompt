import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,
  multiModelRuns: defineTable({
    masterMessageId: v.string(),
    masterThreadId: v.string(),
    secondaryRuns: v.array(v.object({
      modelId: v.union(
        v.literal("gpt-4o-mini"),
        v.literal("gpt-4o"),
        v.literal("gemini-2.5-flash"),
        v.literal("gemini-2.5-pro")
      ),
      threadId: v.string(),
    })),
  }).index("by_master_message", ["masterMessageId"]),
});
