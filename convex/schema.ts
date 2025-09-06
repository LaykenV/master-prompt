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

  // Stripe billing: link Convex user -> Stripe customer
  billingCustomers: defineTable({
    userId: v.id("users"),
    stripeCustomerId: v.string(),
    email: v.optional(v.string()),
    createdAtMs: v.number(),
  })
    .index("by_user", ["userId"]) 
    .index("by_customer", ["stripeCustomerId"]),

  // Latest subscription snapshot per Stripe subscription/user
  subscriptions: defineTable({
    userId: v.id("users"),
    stripeCustomerId: v.string(),
    subscriptionId: v.string(),
    status: v.string(),
    priceId: v.string(),
    currentPeriodStartMs: v.number(),
    currentPeriodEndMs: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    paymentBrand: v.optional(v.string()),
    paymentLast4: v.optional(v.string()),
    updatedAtMs: v.number(),
  })
    .index("by_user", ["userId"]) 
    .index("by_subscription", ["subscriptionId"]) 
    .index("by_customer", ["stripeCustomerId"]),

  // Map Stripe price -> weekly budget in cents
  plans: defineTable({
    priceId: v.string(),
    name: v.string(),
    weeklyBudgetCents: v.int64(),
  }).index("by_price", ["priceId"]),

  // Immutable ledger of usage events
  usageEvents: defineTable({
    userId: v.id("users"),
    modelId: MODEL_ID_SCHEMA,
    promptTokens: v.number(),
    completionTokens: v.number(),
    reasoningTokens: v.number(),
    totalTokens: v.number(),
    inputCents: v.int64(),
    outputCents: v.int64(),
    totalCents: v.int64(),
    provider: v.string(),
    createdAtMs: v.number(),
    weekStartMs: v.number(),
    monthStartMs: v.number(),
  })
    .index("by_user_time", ["userId", "createdAtMs"]) 
    .index("by_user_week", ["userId", "weekStartMs"]) 
    .index("by_user_month", ["userId", "monthStartMs"]),

  // Aggregated usage per user/week for fast reads
  weeklyUsage: defineTable({
    userId: v.id("users"),
    weekStartMs: v.number(),
    totalCents: v.int64(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    reasoningTokens: v.number(),
    requests: v.number(),
    lastEventAtMs: v.number(),
  }).index("by_user_week", ["userId", "weekStartMs"]),

  // Track monthly re-ups per user to enforce once/month
  usageReups: defineTable({
    userId: v.id("users"),
    monthStartMs: v.number(),
    reupsUsed: v.number(),
  }).index("by_user_month", ["userId", "monthStartMs"]),

  // Per-thread activity to drive global loading spinners in the UI
  threadActivities: defineTable({
    threadId: v.string(),
    userId: v.id("users"),
    activeCount: v.number(),
    isGenerating: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_threadId", ["threadId"]) // used for upsert and .unique()
    .index("by_userId_and_isGenerating", ["userId", "isGenerating"]),
});
