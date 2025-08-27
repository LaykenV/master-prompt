"use node";

import Stripe from "stripe";
import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Id } from "./_generated/dataModel";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-06-20",
});

export const ensureCustomerForUser = internalAction({
  args: { userId: v.id("users"), email: v.optional(v.string()) },
  returns: v.object({ stripeCustomerId: v.string() }),
  handler: async (ctx, args): Promise<{ stripeCustomerId: string }> => {
    type BillingCustomer = {
      _id: Id<"billingCustomers">;
      _creationTime: number;
      userId: Id<"users">;
      stripeCustomerId: string;
      email?: string;
      createdAtMs: number;
    };
    const mapping: BillingCustomer | null = await ctx.runQuery(
      internal.stripeHelpers.getCustomerMappingByUser,
      {
        userId: args.userId,
      },
    );
    if (mapping) return { stripeCustomerId: mapping.stripeCustomerId };

    const customer = await stripe.customers.create({
      email: args.email,
      metadata: { userId: args.userId },
    });
    const writeResult: { stripeCustomerId: string } = await ctx.runMutation(
      internal.stripeHelpers.writeCustomerMapping,
      {
        userId: args.userId,
        stripeCustomerId: customer.id,
        email: args.email,
      },
    );
    return { stripeCustomerId: writeResult.stripeCustomerId };
  },
});

export const syncStripeCustomer = internalAction({
  args: { stripeCustomerId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Find user mapping
    const billingRows = await ctx.runQuery(internal.stripeHelpers.getCustomerByStripeId, {
      stripeCustomerId: args.stripeCustomerId,
    });
    const mapping = billingRows;
    if (!mapping) return null;
    const userId = mapping.userId;

    const subs = await stripe.subscriptions.list({
      customer: args.stripeCustomerId,
      limit: 1,
      status: "all",
      expand: ["data.default_payment_method"],
    });
    const sub = subs.data[0];
    if (!sub) return null;

    const pm = sub.default_payment_method;
    const card = pm && typeof pm !== "string" ? (pm.card ?? null) : null;
    await ctx.runMutation(internal.stripeHelpers.writeSubscription, {
      userId,
      stripeCustomerId: args.stripeCustomerId,
      subscriptionId: sub.id,
      status: sub.status,
      priceId: sub.items.data[0]?.price.id ?? "",
      currentPeriodStartMs: sub.current_period_start * 1000,
      currentPeriodEndMs: sub.current_period_end * 1000,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      paymentBrand: card?.brand ?? undefined,
      paymentLast4: card?.last4 ?? undefined,
    });
    return null;
  },
});

export const createCheckoutSession = action({
  args: { tier: v.union(v.literal("lite"), v.literal("pro")) },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    type BillingCustomer = {
      _id: Id<"billingCustomers">;
      _creationTime: number;
      userId: Id<"users">;
      stripeCustomerId: string;
      email?: string;
      createdAtMs: number;
    };
    const mapping: BillingCustomer | null = await ctx.runQuery(
      internal.stripeHelpers.getCustomerMappingByUser,
      { userId },
    );
    let stripeCustomerId: string | undefined = mapping?.stripeCustomerId;
    if (!stripeCustomerId) {
      const ensured: { stripeCustomerId: string } = await ctx.runAction(
        internal.stripeActions.ensureCustomerForUser,
        { userId },
      );
      stripeCustomerId = ensured.stripeCustomerId;
    }
    if (!stripeCustomerId) throw new Error("Failed to ensure Stripe customer");
    const envLitePriceId = process.env.STRIPE_LITE_TIER_PRICE_ID;
    if (!envLitePriceId) throw new Error("STRIPE_LITE_TIER_PRICE_ID is not set");
    const envProPriceId = process.env.STRIPE_PRO_TIER_PRICE_ID;
    if (!envProPriceId) throw new Error("STRIPE_PRO_TIER_PRICE_ID is not set");
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) throw new Error("NEXT_PUBLIC_BASE_URL is not set");

    // Select the correct price ID based on the tier
    const priceId = args.tier === "lite" ? envLitePriceId : envProPriceId;

    const session: Stripe.Checkout.Session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `https://www.meshmind.chat/account/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://www.meshmind.chat`,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { url: session.url };
  },
});

export const syncAfterSuccessForSelf = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const mapping = await ctx.runQuery(internal.stripeHelpers.getCustomerMappingByUser, { userId });
    let stripeCustomerId = mapping?.stripeCustomerId;
    if (!stripeCustomerId) {
      const ensured = await ctx.runAction(internal.stripeActions.ensureCustomerForUser, { userId });
      stripeCustomerId = ensured.stripeCustomerId;
    }
    if (!stripeCustomerId) {
      throw new Error("Failed to get or create Stripe customer ID");
    }
    await ctx.runAction(internal.stripeActions.syncStripeCustomer, { stripeCustomerId });
    return null;
  },
});

export const createCustomerPortalSession = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");

    type BillingCustomer = {
      _id: Id<"billingCustomers">;
      _creationTime: number;
      userId: Id<"users">;
      stripeCustomerId: string;
      email?: string;
      createdAtMs: number;
    };
    const mapping: BillingCustomer | null = await ctx.runQuery(
      internal.stripeHelpers.getCustomerMappingByUser,
      { userId },
    );
    let stripeCustomerId: string | undefined = mapping?.stripeCustomerId;
    if (!stripeCustomerId) {
      const ensured: { stripeCustomerId: string } = await ctx.runAction(
        internal.stripeActions.ensureCustomerForUser,
        { userId },
      );
      stripeCustomerId = ensured.stripeCustomerId;
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `https://www.meshmind.chat/account`,
    });
    if (!session.url) throw new Error("Stripe did not return a customer portal URL");
    return { url: session.url };
  },
});
