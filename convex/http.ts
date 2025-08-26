import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
    method: "POST",
    path: "/stripe/webhook",
    handler: httpAction(async (ctx, request) => {
        const body = await request.json();
        console.log("Stripe webhook received", body);
        return new Response("Webhook received");
    }),
});

auth.addHttpRoutes(http);

export default http;
