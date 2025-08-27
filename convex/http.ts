import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";
import Stripe from "stripe";
import { internal } from "./_generated/api";

const http = httpRouter();

http.route({
    method: "POST",
    path: "/stripe/webhook",
    handler: httpAction(async (ctx, request) => {
        const signature = request.headers.get("stripe-signature");
        if (!signature) return new Response("Missing signature", { status: 400 });
        const rawBody = await request.text();
        try {
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2024-06-20" });
            const event = stripe.webhooks.constructEvent(
                rawBody,
                signature,
                process.env.STRIPE_WEBHOOK_SECRET as string,
            );
            // Allowed events from Theo's list (subset focusing on subscription updates)
            const allowed: Set<string> = new Set([
                "checkout.session.completed",
                "customer.subscription.created",
                "customer.subscription.updated",
                "customer.subscription.deleted",
                "customer.subscription.paused",
                "customer.subscription.resumed",
                "customer.subscription.pending_update_applied",
                "customer.subscription.pending_update_expired",
                "invoice.paid",
                "invoice.payment_failed",
                "invoice.payment_action_required",
                "invoice.upcoming",
                "invoice.marked_uncollectible",
                "invoice.payment_succeeded",
                "payment_intent.succeeded",
                "payment_intent.payment_failed",
                "payment_intent.canceled",
            ]);
            if (!allowed.has(event.type)) {
                return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "content-type": "application/json" } });
            }
            const obj = event.data.object as { customer?: string };
            const customerId = obj?.customer;
            if (typeof customerId === "string" && customerId.length > 0) {
                await ctx.runAction(internal.stripeActions.syncStripeCustomer, { stripeCustomerId: customerId });
            }
        } catch (err) {
            console.error("Stripe webhook error", err);
            return new Response("Webhook error", { status: 200 });
        }
        return new Response(JSON.stringify({ received: true }), { status: 200, headers: { "content-type": "application/json" } });
    }),
});

auth.addHttpRoutes(http);

export default http;
