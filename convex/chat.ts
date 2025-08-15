import { agent } from "./agent";
import { action, query, internalAction, mutation, internalMutation, QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { paginationOptsValidator } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
    listMessages,
    vStreamArgs,
    syncStreams,
    saveMessage,
    getThreadMetadata,
} from "@convex-dev/agent";

export const getUser = query({
    args: {},
    handler: async (ctx) => {
      const userId = await getAuthUserId(ctx);
      const user = userId === null ? null : await ctx.db.get(userId);
      return user;
    },
  });

export const createThread = action({
    args: {
        title: v.optional(v.string()),
        initialPrompt: v.optional(v.string()),
    },
    returns: v.string(),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const { _id: threadId } = await ctx.runMutation(
            components.agent.threads.createThread,
            {
                title: args.title,
                userId: userId,
            }
        );
        
        // If there's an initial prompt, save it and generate a response
        if (args.initialPrompt) {
            await ctx.runMutation(internal.chat.saveInitialMessage, {
                threadId,
                userId: userId,
                prompt: args.initialPrompt,
            });
        }
        
        return threadId;
    },
});

export const getThreads = query({
    args: {
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
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const { page } = await ctx.runQuery(
            components.agent.threads.listThreadsByUserId,
            { userId: userId, paginationOpts: args.paginationOpts },
          );
        return page;
    },
});

export const deleteThread = action({
    args: {
        threadId: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        await authorizeThreadAccess(ctx, args.threadId);
        await agent.deleteThreadAsync(ctx, { threadId: args.threadId });
        return null;
    },
});

// Save the initial message when creating a thread and generate a response
export const saveInitialMessage = internalMutation({
    args: {
        threadId: v.string(),
        userId: v.id("users"),
        prompt: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, { threadId, userId, prompt }) => {
        const { messageId } = await saveMessage(ctx, components.agent, {
            threadId,
            userId,
            prompt,

        });
        await ctx.scheduler.runAfter(0, internal.chat.generateResponseStreamingAsync, {
            threadId,
            promptMessageId: messageId,
        });
        return null;
    },
});

// Save a user message, then generate a response asynchronously with streaming deltas.
export const sendMessage = mutation({
    args: {
        threadId: v.string(),
        prompt: v.string(),
    },
    returns: v.null(),
    handler: async (ctx, { threadId, prompt }) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        const { messageId } = await saveMessage(ctx, components.agent, {
            threadId,
            userId,
            prompt,

        });

        await ctx.scheduler.runAfter(0, internal.chat.generateResponseStreamingAsync, {
            threadId,
            promptMessageId: messageId,
        });
        return null;
    },
});

// Internal action to stream the agent's response and save deltas.
export const generateResponseStreamingAsync = internalAction({
    args: { threadId: v.string(), promptMessageId: v.string() },
    returns: v.null(),
    handler: async (ctx, { threadId, promptMessageId }) => {
        try {
            const { thread } = await agent.continueThread(ctx, { threadId });
            const result = await thread.streamText({ promptMessageId }, { saveStreamDeltas: {chunking: "line", throttleMs: 500 } });
            await result.consumeStream();
            return null;
        } catch (error) {
            console.error("Error in generateResponseStreamingAsync", error);
        }
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
        await authorizeThreadAccess(ctx, threadId);
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

export async function authorizeThreadAccess(
    ctx: QueryCtx | MutationCtx | ActionCtx,
    threadId: string,
  ) {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized: user is required");
    }
    const { userId: threadUserId } = await getThreadMetadata(
      ctx,
      components.agent,
      { threadId },
    );
    if (threadUserId !== userId) {
      throw new Error("Unauthorized: user does not match thread user");
    }
  }