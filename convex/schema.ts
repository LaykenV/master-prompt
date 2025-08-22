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

// Structured run summary for rendering a table in the UI
const RUN_SUMMARY_STRUCTURED = v.object({
  originalPrompt: v.string(),
  overview: v.string(),
  crossModel: v.object({
    agreements: v.array(v.string()),
    disagreements: v.array(v.string()),
    convergenceSummary: v.string(),
  }),
  perModel: v.array(
    v.object({
      modelId: MODEL_ID_SCHEMA,
      modelName: v.string(),
      initialSummary: v.string(),
      refinedSummary: v.string(),
      changedPosition: v.boolean(),
      keyPoints: v.array(v.string()),
    }),
  ),
});

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
    // New structured summary for rich UI rendering
    runSummaryStructured: v.optional(RUN_SUMMARY_STRUCTURED),

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
