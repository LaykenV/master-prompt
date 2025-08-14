import { agent } from "./agent";
import { action, query, internalAction, mutation } from "./_generated/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
    listMessages,
    vPaginationResult,
    vMessageDoc,
    vStreamArgs,
    syncStreams,
} from "@convex-dev/agent";

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
    },
    returns: v.string(),
    handler: async (ctx, args) => {
        const { _id: threadId } = await ctx.runMutation(
            components.agent.threads.createThread,
            {
                title: args.title,
                userId: args.userId,
            }
        );
        return threadId;
    },
});

export const basicChat = action({
    args: {
        message: v.string(),
        userId: v.string(),
        threadId: v.string(),
    },
    returns: v.string(),
    handler: async (ctx, args) => {
        console.log("basicChat", args);
        const userIdServer = await getAuthUserId(ctx);
        const matching = args.userId === userIdServer;
        if (!matching) {
            throw new Error("User ID does not match");
        }
        const { thread } = await agent.continueThread(ctx, { threadId: args.threadId });
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

export const deleteThread = action({
    args: {
        threadId: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await agent.deleteThreadAsync(ctx, { threadId: args.threadId });
        return null;
    },
});

export const getMessagesForThread = query({
    args: {
        threadId: v.string(),
    },
    returns: vPaginationResult(vMessageDoc),
    handler: async (ctx, args) => {
        const messages = await listMessages(ctx, components.agent, {
            threadId: args.threadId,
            paginationOpts: {
                numItems: 10,
                cursor: null,
            },
        });
        return messages;
    },
});

// Save a user message, then generate a response asynchronously with streaming deltas.
export const sendMessage = mutation({
    args: {
        threadId: v.string(),
        prompt: v.string(),
    },
    handler: async (ctx, { threadId, prompt }) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const { messageId } = await agent.saveMessage(ctx, {
            threadId,
            userId,
            prompt,
            skipEmbeddings: true,
        });
        await ctx.scheduler.runAfter(0, internal.chat.generateResponseStreamingAsync, {
            threadId,
            promptMessageId: messageId,
        });
    },
});

// Internal action to stream the agent's response and save deltas.
export const generateResponseStreamingAsync = internalAction({
    args: { threadId: v.string(), promptMessageId: v.string() },
    handler: async (ctx, { threadId, promptMessageId }) => {
        const { thread } = await agent.continueThread(ctx, { threadId });
        const result = await thread.streamText({ promptMessageId }, { saveStreamDeltas: true });
        await result.consumeStream();
    },
});

// Streaming-aware list that also returns synced stream deltas for live updates.
export const listThreadMessages = query({
    args: {
        threadId: v.string(),
        paginationOpts: paginationOptsValidator,
        streamArgs: vStreamArgs,
    },
    handler: async (ctx, { threadId, paginationOpts, streamArgs }) => {
        const paginated = await listMessages(ctx, components.agent, {
            threadId,
            paginationOpts,
        });
        const streams = await syncStreams(ctx, components.agent, {
            threadId,
            streamArgs,
        });
        return { ...paginated, streams };
    },
});