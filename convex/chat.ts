import { agent } from "./agent";
import { action, query } from "./_generated/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getUser = query({
    handler: async (ctx) => {
      const userId = await getAuthUserId(ctx);
      const user = userId === null ? null : await ctx.db.get(userId);
      return user;
    },
  });

export const createThread = action({
    args: {
        userId: v.string(),
        title: v.optional(v.string()),
        summary: v.optional(v.string()),
    },
    returns: v.string(),
    handler: async (ctx, args) => {
        const { _id: threadId } = await ctx.runMutation(
            components.agent.threads.createThread,
            {
                title: args.title,
                userId: args.userId,
                summary: args.summary,
            }
        );
        return threadId;
    },
});

export const basicChat = action({
    args: {
        message: v.string(),
        userId: v.string(),
    },
    returns: v.string(),
    handler: async (ctx, args) => {
        const userIdServer = await getAuthUserId(ctx);
        const matching = args.userId === userIdServer;
        if (!matching) {
            throw new Error("User ID does not match");
        }
        const { thread } = await agent.createThread(ctx, {
            userId: args.userId,
        });
        const response = await thread.generateText({ prompt: args.message });
        return response.text;
    },
});

export const getThreads = query({
    args: {
        userId: v.string(),
        paginationOpts: paginationOptsValidator,
    },
    returns: v.array(v.object({
        _id: v.string(),
        _creationTime: v.number(),
        status: v.union(v.literal("active"), v.literal("archived")),
        summary: v.optional(v.string()),
        title: v.optional(v.string()),
        userId: v.optional(v.string()),
    })),
    handler: async (ctx, args) => {
        const { page } = await ctx.runQuery(
            components.agent.threads.listThreadsByUserId,
            { userId: args.userId, paginationOpts: args.paginationOpts },
          );
        console.log(page);
        return page;
    },
});