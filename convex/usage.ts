import { internalMutation, mutation, query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { MODEL_ID_SCHEMA, MODEL_PRICING_USD_PER_MTOKEN, ModelId } from "./agent";

function startOfIsoWeekMs(dateMs: number): number {
  const d = new Date(dateMs);
  const day = d.getUTCDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day; // 0=Sun -> -6
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonthMs(dateMs: number): number {
  const d = new Date(dateMs);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function computeCostCents(
  modelId: ModelId,
  promptTokens: number,
  completionTokens: number,
  reasoningTokens: number,
): { inputCents: bigint; outputCents: bigint; totalCents: bigint } {
  const rates = MODEL_PRICING_USD_PER_MTOKEN[modelId];
  if (!rates) return { inputCents: 0n, outputCents: 0n, totalCents: 0n };
  const outputTokens = completionTokens + (Number.isFinite(reasoningTokens) ? reasoningTokens : 0);
  const inputUSD = (promptTokens / 1_000_000) * rates.input;
  const outputUSD = (outputTokens / 1_000_000) * rates.output;
  const inputCents = BigInt(Math.round(inputUSD * 100));
  const outputCents = BigInt(Math.ceil(outputUSD * 100));
  return { inputCents, outputCents, totalCents: inputCents + outputCents };
}

export const recordEvent = internalMutation({
  args: {
    userId: v.id("users"),
    modelId: MODEL_ID_SCHEMA,
    promptTokens: v.number(),
    completionTokens: v.number(),
    reasoningTokens: v.number(),
    provider: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const nowMs = Date.now();
    const weekStartMs = startOfIsoWeekMs(nowMs);
    const monthStartMs = startOfMonthMs(nowMs);

    const { inputCents, outputCents, totalCents } = computeCostCents(
      args.modelId as ModelId,
      args.promptTokens,
      args.completionTokens,
      args.reasoningTokens,
    );

    await ctx.db.insert("usageEvents", {
      userId: args.userId,
      modelId: args.modelId,
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      reasoningTokens: args.reasoningTokens,
      totalTokens: args.promptTokens + args.completionTokens + args.reasoningTokens,
      inputCents,
      outputCents,
      totalCents,
      provider: args.provider,
      createdAtMs: nowMs,
      weekStartMs,
      monthStartMs,
    });

    // Upsert / increment weekly aggregate
    const existing = await ctx.db
      .query("weeklyUsage")
      .withIndex("by_user_week", (q) => q.eq("userId", args.userId).eq("weekStartMs", weekStartMs))
      .unique();

    if (!existing) {
      await ctx.db.insert("weeklyUsage", {
        userId: args.userId,
        weekStartMs,
        totalCents,
        promptTokens: args.promptTokens,
        completionTokens: args.completionTokens,
        reasoningTokens: args.reasoningTokens,
        requests: 1,
        lastEventAtMs: nowMs,
      });
    } else {
      await ctx.db.patch(existing._id, {
        totalCents: (existing.totalCents as unknown as bigint) + totalCents,
        promptTokens: existing.promptTokens + args.promptTokens,
        completionTokens: existing.completionTokens + args.completionTokens,
        reasoningTokens: existing.reasoningTokens + args.reasoningTokens,
        requests: existing.requests + 1,
        lastEventAtMs: nowMs,
      });
    }

    return null;
  },
});

export const getCurrentWeekForSelf = query({
  args: {},
  returns: v.object({
    weekStartMs: v.number(),
    totalCents: v.int64(),
    limitCents: v.int64(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    reasoningTokens: v.number(),
    requests: v.number(),
    planName: v.union(v.literal("Free"), v.literal("Lite"), v.literal("Pro")),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }
    const nowMs = Date.now();
    const weekStartMs = startOfIsoWeekMs(nowMs);

    const weekly = await ctx.db
      .query("weeklyUsage")
      .withIndex("by_user_week", (q) => q.eq("userId", userId).eq("weekStartMs", weekStartMs))
      .unique();

    // Determine plan limit from subscription -> plans
    let limitCents: bigint = 0n;
    let planName: "Free" | "Lite" | "Pro" = "Free";
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (sub && sub.priceId && sub.status === "active") {
      const plan = await ctx.db
        .query("plans")
        .withIndex("by_price", (q) => q.eq("priceId", sub.priceId))
        .unique();
      if (plan) {
        limitCents = plan.weeklyBudgetCents as unknown as bigint;
        planName = plan.name as "Free" | "Lite" | "Pro";
      }
    } else { // free plan
      limitCents = 30n;
    }

    return {
      weekStartMs,
      totalCents: weekly ? (weekly.totalCents as unknown as bigint) : 0n,
      limitCents,
      promptTokens: weekly ? weekly.promptTokens : 0,
      completionTokens: weekly ? weekly.completionTokens : 0,
      reasoningTokens: weekly ? weekly.reasoningTokens : 0,
      requests: weekly ? weekly.requests : 0,
      planName,
    };
  },
});

export const reUpCurrentWeekForSelf = mutation({
  args: {},
  returns: v.object({ ok: v.boolean(), message: v.string() }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return { ok: false, message: "Not authenticated" };
    const nowMs = Date.now();
    const weekStartMs = startOfIsoWeekMs(nowMs);
    const monthStartMs = startOfMonthMs(nowMs);

    const reup = await ctx.db
      .query("usageReups")
      .withIndex("by_user_month", (q) => q.eq("userId", userId).eq("monthStartMs", monthStartMs))
      .unique();
    if (reup && reup.reupsUsed >= 1) {
      return { ok: false, message: "Re-up already used this month" };
    }

    const weekly = await ctx.db
      .query("weeklyUsage")
      .withIndex("by_user_week", (q) => q.eq("userId", userId).eq("weekStartMs", weekStartMs))
      .unique();

    if (!weekly || (weekly.totalCents as unknown as bigint) === 0n) {
      // Nothing to reset; still consume the monthly re-up to prevent abuse?
      if (!reup) {
        await ctx.db.insert("usageReups", { userId, monthStartMs, reupsUsed: 1 });
      } else {
        await ctx.db.patch(reup._id, { reupsUsed: reup.reupsUsed + 1 });
      }
      return { ok: true, message: "Nothing to reset" };
    }

    const negateCents = -(weekly.totalCents as unknown as bigint);
    await ctx.db.insert("usageEvents", {
      userId,
      modelId: "gpt-5" as ModelId, // placeholder label for adjustment events
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      inputCents: 0n,
      outputCents: negateCents,
      totalCents: negateCents,
      provider: "adjustment",
      createdAtMs: nowMs,
      weekStartMs,
      monthStartMs,
    });

    await ctx.db.patch(weekly._id, {
      totalCents: 0n,
      promptTokens: 0,
      completionTokens: 0,
      reasoningTokens: 0,
      requests: 0,
      lastEventAtMs: nowMs,
    });

    if (!reup) {
      await ctx.db.insert("usageReups", { userId, monthStartMs, reupsUsed: 1 });
    } else {
      await ctx.db.patch(reup._id, { reupsUsed: reup.reupsUsed + 1 });
    }

    return { ok: true, message: "Re-up successful" };
  },
});

export const getSelfStatus = query({
  args: {},
  returns: v.object({
    isAuthenticated: v.boolean(),
    user: v.union(
      v.null(),
      v.object({
        _id: v.id("users"),
        email: v.optional(v.string()),
      })
    ),
    subscription: v.union(
      v.null(),
      v.object({
        status: v.string(),
        priceId: v.string(),
        cancelAtPeriodEnd: v.boolean(),
        currentPeriodEndMs: v.number(),
        paymentBrand: v.optional(v.string()),
        paymentLast4: v.optional(v.string()),
        updatedAtMs: v.number(),
      })
    ),
    usage: v.object({
      weekStartMs: v.number(),
      totalCents: v.int64(),
      limitCents: v.int64(),
      remainingCents: v.int64(),
    }),
    canSend: v.boolean(),
    planName: v.union(v.literal("Free"), v.literal("Lite"), v.literal("Pro")),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return {
        isAuthenticated: false,
        user: null,
        subscription: null,
        usage: {
          weekStartMs: 0,
          totalCents: 0n,
          limitCents: 0n,
          remainingCents: 0n,
        },
        canSend: false,
        planName: "Free" as const,
      };
    }

    const user = await ctx.db.get(userId);
    const nowMs = Date.now();
    const weekStartMs = startOfIsoWeekMs(nowMs);

    const weekly = await ctx.db
      .query("weeklyUsage")
      .withIndex("by_user_week", (q) => q.eq("userId", userId).eq("weekStartMs", weekStartMs))
      .unique();

    // Determine plan limit from subscription -> plans
    let limitCents: bigint = 0n;
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    
    let subscription = null;
    let planName: "Free" | "Lite" | "Pro" = "Free";
    if (sub && sub.priceId && sub.status === "active" && sub.currentPeriodEndMs > nowMs) {
      subscription = {
        status: sub.status,
        priceId: sub.priceId,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        currentPeriodEndMs: sub.currentPeriodEndMs,
        paymentBrand: sub.paymentBrand,
        paymentLast4: sub.paymentLast4,
        updatedAtMs: sub.updatedAtMs,
      };
      const plan = await ctx.db
        .query("plans")
        .withIndex("by_price", (q) => q.eq("priceId", sub.priceId))
        .unique();
      if (plan) {
        limitCents = plan.weeklyBudgetCents as unknown as bigint;
        planName = plan.name as "Free" | "Lite" | "Pro";
      }
    } else { // free plan
      limitCents = 30n;
    }

    const totalCents = weekly ? (weekly.totalCents as unknown as bigint) : 0n;
    const remainingCents = limitCents - totalCents;
    const canSend = totalCents < limitCents;

    return {
      isAuthenticated: true,
      user: user ? { _id: user._id, email: user.email } : null,
      subscription,
      usage: {
        weekStartMs,
        totalCents,
        limitCents,
        remainingCents,
      },
      canSend,
      planName: planName,
    };
  },
});

export const getBudgetStatusInternal = internalQuery({
  args: {},
  returns: v.object({
    canSend: v.boolean(),
    totalCents: v.int64(),
    limitCents: v.int64(),
    remainingCents: v.int64(),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return {
        canSend: false,
        totalCents: 0n,
        limitCents: 0n,
        remainingCents: 0n,
      };
    }

    const nowMs = Date.now();
    const weekStartMs = startOfIsoWeekMs(nowMs);

    const weekly = await ctx.db
      .query("weeklyUsage")
      .withIndex("by_user_week", (q) => q.eq("userId", userId).eq("weekStartMs", weekStartMs))
      .unique();

    // Determine plan limit from subscription -> plans
    let limitCents: bigint = 0n;
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (sub && sub.priceId && sub.status === "active" && sub.currentPeriodEndMs > nowMs) {
      const plan = await ctx.db
        .query("plans")
        .withIndex("by_price", (q) => q.eq("priceId", sub.priceId))
        .unique();
      if (plan) {
        limitCents = plan.weeklyBudgetCents as unknown as bigint;
      }
    } else { // free plan
      limitCents = 30n;
    }

    const totalCents = weekly ? (weekly.totalCents as unknown as bigint) : 0n;
    const remainingCents = limitCents - totalCents;
    const canSend = totalCents < limitCents;

    return {
      canSend,
      totalCents,
      limitCents,
      remainingCents,
    };
  },
});


