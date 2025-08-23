import { masterPromptAgent, createAgentWithModel, AVAILABLE_MODELS, MODEL_ID_SCHEMA, type ModelId, summaryAgent } from "./agent";
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
    storeFile,
    getFile,
} from "@convex-dev/agent";
import { workflow } from "./workflows";

// Generate a short-lived upload URL for uploading large files directly to Convex storage
export const generateUploadUrl = mutation({
    args: {},
    returns: v.string(),
    handler: async (ctx) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        return await ctx.storage.generateUploadUrl();
    },
});

// Register an uploaded file (by storageId) with the Convex Agent file system and return an Agent fileId
export const registerUploadedFile = action({
    args: {
        storageId: v.id("_storage"),
        fileName: v.string(),
        mimeType: v.string(),
        sha256: v.optional(v.string()),
    },
    returns: v.object({ fileId: v.string(), url: v.string(), storageId: v.string() }),
    handler: async (ctx, { storageId, fileName, sha256 }) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        const blob = await ctx.storage.get(storageId);
        if (!blob) throw new Error("Uploaded file blob not found");

        const { file } = await storeFile(
            ctx,
            components.agent,
            blob,
            fileName,
            sha256,
        );

        return { fileId: file.fileId, url: file.url, storageId: file.storageId };
    },
});

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
        modelId: v.optional(MODEL_ID_SCHEMA),
        fileIds: v.optional(v.array(v.string())),
    },
    returns: v.string(),
    handler: async (ctx, args) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        
        // Create thread with model in summary for easy identification
        const modelId = args.modelId || "gpt-5";
        const { _id: threadId } = await ctx.runMutation(
            components.agent.threads.createThread,
            {
                title: args.title ?? "New chat",
                userId: userId,
                summary: `Model: ${AVAILABLE_MODELS[modelId as ModelId].displayName}`,
            }
        );
        
        // If there's an initial prompt, we'll only use it for title generation.
        // Actual message send still happens via subsequent flows (single-model send or multi-model workflow).

        // Schedule async title generation (non-blocking) only if provided
        if (args.initialPrompt && args.initialPrompt.trim().length > 0) {
            console.log("scheduling title generation for prompt", args.initialPrompt);
            await ctx.scheduler.runAfter(0, internal.chat.generateThreadTitle, {
                threadId,
                initialPrompt: args.initialPrompt,
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
    returns: MODEL_ID_SCHEMA,
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
        
        return "gpt-5"; // default
    },
});



// Save the initial message when creating a thread and generate a response
export const saveInitialMessage = internalMutation({
    args: {
        threadId: v.string(),
        userId: v.id("users"),
        prompt: v.string(),
        modelId: MODEL_ID_SCHEMA,
        fileIds: v.optional(v.array(v.string())),
    },
    returns: v.null(),
    handler: async (ctx, { threadId, userId, prompt, modelId, fileIds }) => {
        // Build message content with files if provided
        if (fileIds && fileIds.length > 0) {
            const messageContent = [];
            
            // Add file content
            for (const fileId of fileIds) {
                const { filePart, imagePart } = await getFile(ctx, components.agent, fileId);
                messageContent.push(imagePart ?? filePart);
            }
            
            // Add text content
            if (prompt.trim()) {
                messageContent.push({ type: "text" as const, text: prompt });
            }
            
            const { messageId } = await saveMessage(ctx, components.agent, {
                threadId,
                userId,
                message: {
                    role: "user",
                    content: messageContent,
                },
                metadata: { fileIds }, // Track file usage
            });

            await ctx.scheduler.runAfter(0, internal.chat.generateResponseStreamingAsync, {
                threadId,
                promptMessageId: messageId,
                modelId,
            });
        } else {
            // Regular text-only message
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
        }
        
        return null;
    },
});

// Save a user message, then generate a response asynchronously with streaming deltas.
export const sendMessage = mutation({
    args: {
        threadId: v.string(),
        prompt: v.string(),
        modelId: v.optional(MODEL_ID_SCHEMA),
        fileIds: v.optional(v.array(v.string())),
    },
    returns: v.null(),
    handler: async (ctx, { threadId, prompt, modelId, fileIds }) => {
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
        
        // Build message content with files if provided
        if (fileIds && fileIds.length > 0) {
            const messageContent = [];
            
            // Add file content
            for (const fileId of fileIds) {
                const { filePart, imagePart } = await getFile(ctx, components.agent, fileId);
                messageContent.push(imagePart ?? filePart);
            }
            
            // Add text content
            if (prompt.trim()) {
                messageContent.push({ type: "text" as const, text: prompt });
            }
            
            const { messageId } = await saveMessage(ctx, components.agent, {
                threadId,
                userId,
                message: {
                    role: "user",
                    content: messageContent,
                },
                metadata: { fileIds }, // Track file usage
            });

            await ctx.scheduler.runAfter(0, internal.chat.generateResponseStreamingAsync, {
                threadId,
                promptMessageId: messageId,
                modelId: activeModelId,
            });
        } else {
            // Regular text-only message
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
        }
        
        return null;
    },
});

// Internal query to get thread model (no auth needed for internal calls)
export const getThreadModelInternal = internalQuery({
    args: { threadId: v.string() },
    returns: MODEL_ID_SCHEMA,
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
        
        return "gpt-5"; // default
    },
});

// Internal action to stream the agent's response and save deltas.
export const generateResponseStreamingAsync = internalAction({
    args: { 
        threadId: v.string(), 
        promptMessageId: v.string(),
        modelId: MODEL_ID_SCHEMA,
    },
    returns: v.null(),
    handler: async (ctx, { threadId, promptMessageId, modelId }) => {
        try {
            // Create an agent instance with the specific model for this thread
            const threadAgent = createAgentWithModel(modelId as ModelId);
            
            const { thread } = await threadAgent.continueThread(ctx, { threadId });
            const result = await thread.streamText({ promptMessageId }, { saveStreamDeltas: {chunking: "line", throttleMs: 20 } });
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
        masterModelId: MODEL_ID_SCHEMA,
        secondaryModelIds: v.array(MODEL_ID_SCHEMA),
        fileIds: v.optional(v.array(v.string())),
    },
    returns: v.string(), // Returns the workflow ID
    handler: async (ctx, { threadId, prompt, masterModelId, secondaryModelIds, fileIds }): Promise<string> => {
        await authorizeThreadAccess(ctx, threadId);
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");

        // Save the user's initial message to the master thread with files if provided
        let messageId: string;
        if (fileIds && fileIds.length > 0) {
            const messageContent = [];
            
            // Add file content
            for (const fileId of fileIds) {
                const { filePart, imagePart } = await getFile(ctx, components.agent, fileId);
                messageContent.push(imagePart ?? filePart);
            }
            
            // Add text content
            if (prompt.trim()) {
                messageContent.push({ type: "text" as const, text: prompt });
            }
            
            const result = await saveMessage(ctx, components.agent, {
                threadId,
                userId,
                message: {
                    role: "user",
                    content: messageContent,
                },
                metadata: { fileIds }, // Track file usage
            });
            messageId = result.messageId;
        } else {
            // Regular text-only message
            const result = await saveMessage(ctx, components.agent, {
                threadId,
                userId,
                prompt,
            });
            messageId = result.messageId;
        }

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
                fileIds,
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
            masterModelId: MODEL_ID_SCHEMA,
            runSummary: v.optional(v.string()),
            runSummaryStructured: v.optional(
                v.object({
                    originalPrompt: v.string(),
                    overview: v.string(),
                    crossModel: v.object({
                        agreements: v.array(v.string()),
                        disagreements: v.array(v.string()),
                        convergenceSummary: v.string(),
                    }),
                    perModel: v.array(
                        v.object({
                            modelId: MODEL_ID_SCHEMA,
                            modelName: v.string(),
                            initialSummary: v.string(),
                            refinedSummary: v.string(),
                            changedPosition: v.boolean(),
                            keyPoints: v.array(v.string()),
                        })
                    ),
                })
            ),
            allRuns: v.array(v.object({
                modelId: MODEL_ID_SCHEMA,
                threadId: v.string(),
                isMaster: v.boolean(),
                status: v.union(v.literal("initial"), v.literal("debate"), v.literal("complete"), v.literal("error")),
                initialPromptMessageId: v.optional(v.string()),
                debatePromptMessageId: v.optional(v.string()),
                errorMessage: v.optional(v.string()),
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

// Get the latest multi-model run for a given master thread id
export const getLatestMultiModelRunForThread = query({
    args: {
        threadId: v.string(),
    },
    returns: v.union(
        v.null(),
        v.object({
            _id: v.id("multiModelRuns"),
            _creationTime: v.number(),
            masterMessageId: v.string(),
            masterThreadId: v.string(),
            masterModelId: MODEL_ID_SCHEMA,
            runSummary: v.optional(v.string()),
            runSummaryStructured: v.optional(
                v.object({
                    originalPrompt: v.string(),
                    overview: v.string(),
                    crossModel: v.object({
                        agreements: v.array(v.string()),
                        disagreements: v.array(v.string()),
                        convergenceSummary: v.string(),
                    }),
                    perModel: v.array(
                        v.object({
                            modelId: MODEL_ID_SCHEMA,
                            modelName: v.string(),
                            initialSummary: v.string(),
                            refinedSummary: v.string(),
                            changedPosition: v.boolean(),
                            keyPoints: v.array(v.string()),
                        })
                    ),
                })
            ),
            allRuns: v.array(v.object({
                modelId: MODEL_ID_SCHEMA,
                threadId: v.string(),
                isMaster: v.boolean(),
                status: v.union(v.literal("initial"), v.literal("debate"), v.literal("complete"), v.literal("error")),
                initialPromptMessageId: v.optional(v.string()),
                debatePromptMessageId: v.optional(v.string()),
                errorMessage: v.optional(v.string()),
            })),
        })
    ),
    handler: async (ctx, { threadId }) => {
        await authorizeThreadAccess(ctx, threadId);

        const page = await ctx.db
            .query("multiModelRuns")
            .withIndex("by_master_thread", (q) => q.eq("masterThreadId", threadId))
            .order("desc")
            .take(1);

        return page[0] ?? null;
    },
});

// Helper: get exact run step info for modal anchoring
export const getRunStepInfo = query({
    args: {
        masterMessageId: v.string(),
        threadId: v.string(),
        stage: v.union(v.literal("initial"), v.literal("debate")),
    },
    returns: v.union(
        v.null(),
        v.object({ threadId: v.string(), promptMessageId: v.string() })
    ),
    handler: async (ctx, { masterMessageId, threadId, stage }) => {
        const run = await ctx.db
            .query("multiModelRuns")
            .withIndex("by_master_message", (q) => q.eq("masterMessageId", masterMessageId))
            .unique();
        if (!run) return null;
        const r = run.allRuns.find((x) => x.threadId === threadId);
        if (!r) return null;
        const promptMessageId = stage === "initial" ? r.initialPromptMessageId : r.debatePromptMessageId;
        if (!promptMessageId) return null;
        return { threadId, promptMessageId };
    },
});

// Upload file action
export const uploadFile = action({
    args: {
        fileData: v.bytes(),
        fileName: v.string(),
        mimeType: v.string(),
        sha256: v.optional(v.string()),
    },
    returns: v.object({
        fileId: v.string(),
        url: v.string(),
        storageId: v.string(),
    }),
    handler: async (ctx, { fileData, fileName, mimeType, sha256 }) => {
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        
        // fileData is already an ArrayBuffer (v.bytes() maps to ArrayBuffer in Convex)
        const blob = new Blob([fileData], { type: mimeType });
        const { file } = await storeFile(
            ctx,
            components.agent,
            blob,
            fileName,
            sha256
        );
        
        return {
            fileId: file.fileId,
            url: file.url,
            storageId: file.storageId,
        };
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

// Internal action: generate a concise title for a thread asynchronously
export const generateThreadTitle = internalAction({
    args: {
        threadId: v.string(),
        initialPrompt: v.optional(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, { threadId, initialPrompt }) => {
        try {
            const agent = summaryAgent;
            const { thread } = await agent.continueThread(ctx, { threadId });
            const prompt = `Generate a concise, descriptive conversation title (max 20 characters). Use Title Case. Do not include quotes. Here is the initial prompt: "${initialPrompt}". Respond with only the title.`;

            const result = await thread.generateText({ prompt }, { storageOptions: { saveMessages: "none" } });
            let title = (result.text ?? "").trim();
            title = title.slice(0, 20);
            console.log("title", title);

            await ctx.runMutation(components.agent.threads.updateThread, {
                threadId,
                patch: { title },
            });
        } catch (err) {
            console.error("Error in generateThreadTitle", err);
            const fallback = (initialPrompt?.trim() || "New chat").slice(0, 20);
            try {
                await ctx.runMutation(components.agent.threads.updateThread, {
                    threadId,
                    patch: { title: fallback },
                });
            } catch {}
        }
        return null;
    },
});