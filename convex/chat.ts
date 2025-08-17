import { masterPromptAgent, createAgentWithModel, AVAILABLE_MODELS, type ModelId } from "./agent";
import { action, query, internalAction, mutation, internalMutation, internalQuery, QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
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
    extractText,
} from "@convex-dev/agent";
import { workflow } from "./workflows";

export const getUser = query({
    args: {},
    handler: async (ctx) => {
      const userId = await getAuthUserId(ctx);
      const user = userId === null ? null : await ctx.db.get(userId);
      return user;
    },
  });

// Get available models for the UI
export const getAvailableModels = query({
    args: {},
    returns: v.array(v.object({
        id: v.string(),
        displayName: v.string(),
        provider: v.string(),
    })),
    handler: async () => {
        return Object.entries(AVAILABLE_MODELS).map(([id, config]) => ({
            id,
            displayName: config.displayName,
            provider: config.provider,
        }));
    },
});

export const createThread = action({
    args: {
        title: v.optional(v.string()),
        initialPrompt: v.optional(v.string()),
        modelId: v.optional(v.union(
            v.literal("gpt-4o-mini"),
            v.literal("gpt-4o"),
            v.literal("gemini-2.5-flash"),
            v.literal("gemini-2.5-pro")
        )),
    },
    returns: v.string(),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        
        // Create thread with model in summary for easy identification
        const modelId = args.modelId || "gpt-4o-mini";
        const { _id: threadId } = await ctx.runMutation(
            components.agent.threads.createThread,
            {
                title: args.title,
                userId: userId,
                summary: `Model: ${AVAILABLE_MODELS[modelId as ModelId].displayName}`,
            }
        );
        
        // If there's an initial prompt, save it and generate a response
        if (args.initialPrompt) {
            await ctx.runMutation(internal.chat.saveInitialMessage, {
                threadId,
                userId: userId,
                prompt: args.initialPrompt,
                modelId: modelId as ModelId,
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
        await masterPromptAgent.deleteThreadAsync(ctx, { threadId: args.threadId });
        return null;
    },
});



// Function to get thread model preference
export const getThreadModel = query({
    args: { threadId: v.string() },
    returns: v.union(
        v.literal("gpt-4o-mini"),
        v.literal("gpt-4o"),
        v.literal("gemini-2.5-flash"),
        v.literal("gemini-2.5-pro")
    ),
    handler: async (ctx, { threadId }) => {
        await authorizeThreadAccess(ctx, threadId);
        const thread = await getThreadMetadata(ctx, components.agent, { threadId });
        const summary = thread.summary;
        
        // Extract model from summary or default to gpt-4o-mini
        if (summary?.includes("Model: ")) {
            const modelName = summary.split("Model: ")[1];
            // Find the model ID by display name
            for (const [modelId, config] of Object.entries(AVAILABLE_MODELS)) {
                if (config.displayName === modelName) {
                    return modelId as ModelId;
                }
            }
        }
        
        return "gpt-4o-mini"; // default
    },
});



// Save the initial message when creating a thread and generate a response
export const saveInitialMessage = internalMutation({
    args: {
        threadId: v.string(),
        userId: v.id("users"),
        prompt: v.string(),
        modelId: v.union(
            v.literal("gpt-4o-mini"),
            v.literal("gpt-4o"),
            v.literal("gemini-2.5-flash"),
            v.literal("gemini-2.5-pro")
        ),
    },
    returns: v.null(),
    handler: async (ctx, { threadId, userId, prompt, modelId }) => {
        const { messageId } = await saveMessage(ctx, components.agent, {
            threadId,
            userId,
            prompt,
        });
        await ctx.scheduler.runAfter(0, internal.chat.generateResponseStreamingAsync, {
            threadId,
            promptMessageId: messageId,
            modelId,
        });
        return null;
    },
});

// Save a user message, then generate a response asynchronously with streaming deltas.
export const sendMessage = mutation({
    args: {
        threadId: v.string(),
        prompt: v.string(),
        modelId: v.optional(v.union(
            v.literal("gpt-4o-mini"),
            v.literal("gpt-4o"),
            v.literal("gemini-2.5-flash"),
            v.literal("gemini-2.5-pro")
        )),
    },
    returns: v.null(),
    handler: async (ctx, { threadId, prompt, modelId }) => {
        await authorizeThreadAccess(ctx, threadId);
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        
        // If a new model is specified, update the thread's model preference
        if (modelId) {
            await ctx.runMutation(components.agent.threads.updateThread, {
                threadId,
                patch: {
                    summary: `Model: ${AVAILABLE_MODELS[modelId as ModelId].displayName}`,
                }
            });
        }
        
        // Get the model to use (provided or current thread model)
        const activeModelId = modelId || await ctx.runQuery(internal.chat.getThreadModelInternal, { threadId });
        
        const { messageId } = await saveMessage(ctx, components.agent, {
            threadId,
            userId,
            prompt,
        });

        await ctx.scheduler.runAfter(0, internal.chat.generateResponseStreamingAsync, {
            threadId,
            promptMessageId: messageId,
            modelId: activeModelId,
        });
        return null;
    },
});

// Internal query to get thread model (no auth needed for internal calls)
export const getThreadModelInternal = internalQuery({
    args: { threadId: v.string() },
    returns: v.union(
        v.literal("gpt-4o-mini"),
        v.literal("gpt-4o"),
        v.literal("gemini-2.5-flash"),
        v.literal("gemini-2.5-pro")
    ),
    handler: async (ctx, { threadId }) => {
        const thread = await getThreadMetadata(ctx, components.agent, { threadId });
        const summary = thread.summary;
        
        // Extract model from summary or default to gpt-4o-mini
        if (summary?.includes("Model: ")) {
            const modelName = summary.split("Model: ")[1];
            // Find the model ID by display name
            for (const [modelId, config] of Object.entries(AVAILABLE_MODELS)) {
                if (config.displayName === modelName) {
                    return modelId as ModelId;
                }
            }
        }
        
        return "gpt-4o-mini"; // default
    },
});

// Internal action to stream the agent's response and save deltas.
export const generateResponseStreamingAsync = internalAction({
    args: { 
        threadId: v.string(), 
        promptMessageId: v.string(),
        modelId: v.union(
            v.literal("gpt-4o-mini"),
            v.literal("gpt-4o"),
            v.literal("gemini-2.5-flash"),
            v.literal("gemini-2.5-pro")
        ),
    },
    returns: v.null(),
    handler: async (ctx, { threadId, promptMessageId, modelId }) => {
        try {
            // Create an agent instance with the specific model for this thread
            const threadAgent = createAgentWithModel(modelId as ModelId);
            
            const { thread } = await threadAgent.continueThread(ctx, { threadId });
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

        const hiddenPromptPrefix = "[HIDDEN_SYNTHESIS_PROMPT]::";

               // Filter out messages where the content starts with our magic string.
        const filteredResults = paginated.page.filter((message) => {
            // extractText is a utility from @convex-dev/agent
            // It safely gets the text content from a message.
            if (!message.message) return true; // Keep messages without content
            const textContent = extractText(message.message);
            return !textContent || !textContent.startsWith(hiddenPromptPrefix);
        });
        
        const streams = await syncStreams(ctx, components.agent, {
            threadId,
            streamArgs,
        });
        return { ...paginated, page: filteredResults, streams };
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

// Multi-model generation functions

// Start multi-model generation workflow
export const startMultiModelGeneration = action({
    args: {
        threadId: v.string(),
        prompt: v.string(),
        masterModelId: v.union(
            v.literal("gpt-4o-mini"),
            v.literal("gpt-4o"),
            v.literal("gemini-2.5-flash"),
            v.literal("gemini-2.5-pro")
        ),
        secondaryModelIds: v.array(v.union(
            v.literal("gpt-4o-mini"),
            v.literal("gpt-4o"),
            v.literal("gemini-2.5-flash"),
            v.literal("gemini-2.5-pro")
        )),
    },
    returns: v.string(), // Returns the workflow ID
    handler: async (ctx, { threadId, prompt, masterModelId, secondaryModelIds }): Promise<string> => {
        await authorizeThreadAccess(ctx, threadId);
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        // Save the user's initial message to the master thread
        const { messageId } = await saveMessage(ctx, components.agent, {
            threadId,
            userId,
            prompt,
        });

        // Start the multi-model generation workflow
        const workflowId: string = await workflow.start(
            ctx,
            internal.workflows.multiModelGeneration,
            {
                masterThreadId: threadId,
                masterMessageId: messageId,
                prompt,
                masterModelId,
                secondaryModelIds,
                userId,
            }
        );

        return workflowId;
    },
});

// Get multi-model run by master message ID
export const getMultiModelRun = query({
    args: {
        masterMessageId: v.string(),
    },
    returns: v.union(
        v.null(),
        v.object({
            _id: v.id("multiModelRuns"),
            _creationTime: v.number(),
            masterMessageId: v.string(),
            masterThreadId: v.string(),
            masterModelId: v.union(
                v.literal("gpt-4o-mini"),
                v.literal("gpt-4o"),
                v.literal("gemini-2.5-flash"),
                v.literal("gemini-2.5-pro")
            ),
            allRuns: v.array(v.object({
                modelId: v.union(
                    v.literal("gpt-4o-mini"),
                    v.literal("gpt-4o"),
                    v.literal("gemini-2.5-flash"),
                    v.literal("gemini-2.5-pro")
                ),
                threadId: v.string(),
                isMaster: v.boolean(),
            })),
        })
    ),
    handler: async (ctx, { masterMessageId }) => {
        const run = await ctx.db
            .query("multiModelRuns")
            .withIndex("by_master_message", (q) => 
                q.eq("masterMessageId", masterMessageId)
            )
            .unique();
        
        return run;
    },
});

// List messages for a secondary thread (for multi-model display)
export const listSecondaryThreadMessages = query({
    args: {
        threadId: v.string(),
        paginationOpts: paginationOptsValidator,
        streamArgs: vStreamArgs,
    },
    handler: async (ctx, { threadId, paginationOpts, streamArgs }) => {
        // Note: We don't authorize access to secondary threads since they're temporary
        // and used only for multi-model generation display
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