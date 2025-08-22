import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { MODEL_ID_SCHEMA } from "./agent";

const RUN_STATUS = v.union(
  v.literal("initial"),
  v.literal("debate"),
  v.literal("complete"),
  v.literal("error"),
);

// The schema is normally optional, but Convex Auth
// requires indexes defined on `authTables`.
// The schema provides more precise TypeScript types.
export default defineSchema({
  ...authTables,
  multiModelRuns: defineTable({
    masterMessageId: v.string(),
    masterThreadId: v.string(),
    masterModelId: MODEL_ID_SCHEMA,
    // Narrative run summary generated after debate
    runSummary: v.optional(v.string()),

    // Per-run tracking with status and prompt message ids for stages
    allRuns: v.array(v.object({
      modelId: MODEL_ID_SCHEMA,
      threadId: v.string(),
      isMaster: v.boolean(),
      status: RUN_STATUS, // default at creation: "initial"
      initialPromptMessageId: v.optional(v.string()),
      debatePromptMessageId: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
    })),
  })
    .index("by_master_message", ["masterMessageId"]) 
    .index("by_master_thread", ["masterThreadId"]),
});
