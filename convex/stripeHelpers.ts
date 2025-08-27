import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getCustomerMappingByUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("billingCustomers"),
      userId: v.id("users"),
      stripeCustomerId: v.string(),
      email: v.optional(v.string()),
      createdAtMs: v.number(),
      _creationTime: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("billingCustomers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const writeCustomerMapping = internalMutation({
  args: {
    userId: v.id("users"),
    stripeCustomerId: v.string(),
    email: v.optional(v.string()),
  },
  returns: v.object({ stripeCustomerId: v.string() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingCustomers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    if (!existing) {
      await ctx.db.insert("billingCustomers", {
        userId: args.userId,
        stripeCustomerId: args.stripeCustomerId,
        email: args.email,
        createdAtMs: Date.now(),
      });
    } else {
      await ctx.db.patch(existing._id, {
        stripeCustomerId: args.stripeCustomerId,
        email: args.email ?? existing.email,
      });
    }
    return { stripeCustomerId: args.stripeCustomerId };
  },
});

export const writeSubscription = internalMutation({
  args: {
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_subscription", (q) => q.eq("subscriptionId", args.subscriptionId))
      .unique();
    const doc = {
      userId: args.userId,
      stripeCustomerId: args.stripeCustomerId,
      subscriptionId: args.subscriptionId,
      status: args.status,
      priceId: args.priceId,
      currentPeriodStartMs: args.currentPeriodStartMs,
      currentPeriodEndMs: args.currentPeriodEndMs,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      paymentBrand: args.paymentBrand,
      paymentLast4: args.paymentLast4,
      updatedAtMs: Date.now(),
    } as const;
    if (!existing) {
      await ctx.db.insert("subscriptions", doc);
    } else {
      await ctx.db.patch(existing._id, doc);
    }
    return null;
  },
});



export const getCustomerByStripeId = internalQuery({
  args: { stripeCustomerId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("billingCustomers"),
      userId: v.id("users"),
      stripeCustomerId: v.string(),
      email: v.optional(v.string()),
      createdAtMs: v.number(),
      _creationTime: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("billingCustomers")
      .withIndex("by_customer", (q) => q.eq("stripeCustomerId", args.stripeCustomerId))
      .unique();
  },
});



export const seedPlans = mutation({
  args: {
    plans: v.array(
      v.object({ priceId: v.string(), name: v.string(), weeklyBudgetCents: v.int64() }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    let upserts = 0;
    for (const p of args.plans) {
      const existing = await ctx.db
        .query("plans")
        .withIndex("by_price", (q) => q.eq("priceId", p.priceId))
        .unique();
      if (!existing) {
        await ctx.db.insert("plans", p);
      } else {
        await ctx.db.patch(existing._id, { name: p.name, weeklyBudgetCents: p.weeklyBudgetCents });
      }
      upserts++;
    }
    return upserts;
  },
});

export const getMySubscription = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("subscriptions"),
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
      _creationTime: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
  },
});