import { agent } from "./agent";
import { action } from "./_generated/server";
import { v } from "convex/values";

export const basicChat = action({
    args: {
        message: v.string(),
    },
    returns: v.string(),
    handler: async (ctx, args) => {
        const { thread } = await agent.createThread(ctx);
        const response = await thread.generateText({ prompt: args.message });
        return response.text;
    },
});
