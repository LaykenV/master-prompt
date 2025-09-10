import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
import { createAgentWithModel, ModelId, AVAILABLE_MODELS, MODEL_ID_SCHEMA, summaryAgent } from "./agent";
import { saveMessage, getFile } from "@convex-dev/agent";
import { internalMutation, internalAction } from "./_generated/server";
import { z } from "zod";
import rateLimiter from "./rateLimits";

const RUN_STATUS = v.union(
  v.literal("initial"),
  v.literal("debate"),
  v.literal("complete"),
  v.literal("error"),
);

// Initialize the workflow manager
// Type assertion needed due to API signature mismatch between workflow versions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const workflow = new WorkflowManager(components.workflow as any);

// Define the multi-model generation workflow
export const multiModelGeneration = workflow.define({
  args: {
    masterThreadId: v.string(),
    masterMessageId: v.string(),
    prompt: v.string(),
    masterModelId: MODEL_ID_SCHEMA,
    secondaryModelIds: v.array(MODEL_ID_SCHEMA),
    userId: v.id("users"),
    fileIds: v.optional(v.array(v.string())),
  },
  handler: async (step, args): Promise<void> => {
    const { masterThreadId, masterMessageId, prompt, masterModelId, userId, fileIds } = args;
    const secondaryModelIds = args.secondaryModelIds.slice(0, 2);

    // Step 1: Create sub-threads for ALL models (including master)
    const allModelIds = [masterModelId, ...secondaryModelIds];
    const allThreadCreationTasks = allModelIds.map(modelId => 
      step.runMutation(internal.workflows.createSecondaryThread, {
        modelId,
      })
    );
    const allThreadIds = await Promise.all(allThreadCreationTasks);

    // Step 2: Record the multi-model run
    const allRuns = allModelIds.map((modelId, index) => ({
      modelId,
      threadId: allThreadIds[index],
      isMaster: index === 0, // First one is the master
    }));

    await step.runMutation(internal.workflows.recordMultiModelRun, {
      masterMessageId,
      masterThreadId,
      masterModelId,
      allRuns,
    });

    // --- ROUND 1: INITIAL GENERATION ---
    // Step 3: Generate initial responses from all models in parallel
    const initialGenerationTasks = allModelIds.map((modelId, index) =>
      step.runAction(internal.workflows.generateModelResponse, {
        threadId: allThreadIds[index],
        modelId,
        prompt,
        userId,
        isMaster: index === 0,
        fileIds,
        masterMessageId,
      })
    );
    const initialResponses = await Promise.all(initialGenerationTasks);
    const initialResponsesWithMeta = initialResponses.map((response: string, index: number) => ({
      modelId: allModelIds[index],
      response,
    }));

    // --- ROUND 2: DEBATE ROUND ---
    // Step 4: Each model generates a refined response based on others' initial answers
    const debateGenerationTasks = allModelIds.map((modelId, index) =>
      step.runAction(internal.workflows.generateDebateResponse, {
        threadId: allThreadIds[index],
        modelId,
        // Provide the responses from all OTHER models for peer review
        otherResponses: initialResponsesWithMeta.filter((_, i) => i !== index),
        userId,
        masterMessageId,
      })
    );
    const refinedResponses = await Promise.all(debateGenerationTasks);
    const refinedResponsesWithMeta = refinedResponses.map((response: string, index: number) => ({
      modelId: allModelIds[index],
      response,
    }));
    
    // Step 5: Generate final synthesis and narrative summary in parallel
    const synthesisPromise = step.runAction(internal.workflows.generateSynthesisResponse, {
      masterThreadId,
      originalPrompt: prompt,
      masterModelId,
      // Pass the refined responses to the synthesis step
      allResponses: refinedResponses.map((response: string, index: number) => ({
        modelId: allModelIds[index],
        response,
        isMaster: index === 0,
      })),
      userId,
    });
    const summaryPromise = step.runAction(internal.workflows.generateRunSummary, {
      masterThreadId,
      originalPrompt: prompt,
      initialResponses: initialResponsesWithMeta,
      refinedResponses: refinedResponsesWithMeta,
    });
    await Promise.all([synthesisPromise, summaryPromise]);
  },
});

// Supporting mutations and actions for the workflow

// Create a temporary thread for a secondary model
export const createSecondaryThread = internalMutation({
  args: {
    modelId: MODEL_ID_SCHEMA,
  },
  returns: v.string(),
  handler: async (ctx, { modelId }) => {
    const { _id: threadId } = await ctx.runMutation(
      components.agent.threads.createThread,
      {
        title: `Multi-model response: ${AVAILABLE_MODELS[modelId as ModelId].displayName}`,
        summary: `Temporary thread for multi-model generation using ${AVAILABLE_MODELS[modelId as ModelId].displayName}`,
      }
    );
    return threadId;
  },
});

// Record a multi-model run in the database
export const recordMultiModelRun = internalMutation({
  args: {
    masterMessageId: v.string(),
    masterThreadId: v.string(),
    masterModelId: MODEL_ID_SCHEMA,
    allRuns: v.array(v.object({
      modelId: MODEL_ID_SCHEMA,
      threadId: v.string(),
      isMaster: v.boolean(),
    })),
  },
  returns: v.null(),
  handler: async (ctx, { masterMessageId, masterThreadId, masterModelId, allRuns }) => {
    await ctx.db.insert("multiModelRuns", {
      masterMessageId,
      masterThreadId,
      masterModelId,
      allRuns: allRuns.map((r) => ({
        ...r,
        status: "initial" as const,
      })),
    });
    return null;
  },
});

// Update per-run status and stage prompt ids
export const updateRunStatus = internalMutation({
  args: {
    masterMessageId: v.string(),
    threadId: v.string(),
    status: RUN_STATUS,
    promptMessageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { masterMessageId, threadId, status, promptMessageId, errorMessage }) => {
    const run = await ctx.db
      .query("multiModelRuns")
      .withIndex("by_master_message", (q) => q.eq("masterMessageId", masterMessageId))
      .unique();
    if (!run) return null;
    const updatedRuns = run.allRuns.map((r) => {
      if (r.threadId !== threadId) return r;
      const patch: Record<string, unknown> = { ...r, status };
      if (typeof promptMessageId === "string") {
        if (status === "initial") {
          patch.initialPromptMessageId = promptMessageId;
        } else if (status === "debate") {
          patch.debatePromptMessageId = promptMessageId;
        }
      }
      if (status === "error" && errorMessage) {
        patch.errorMessage = errorMessage;
      }
      return patch as typeof r;
    });
    await ctx.db.patch(run._id, { allRuns: updatedRuns });
    return null;
  },
});

// Generate a response from a specific model
export const generateModelResponse = internalAction({
  args: {
    threadId: v.string(),
    modelId: MODEL_ID_SCHEMA,
    prompt: v.string(),
    userId: v.id("users"),
    isMaster: v.boolean(),
    fileIds: v.optional(v.array(v.string())),
    masterMessageId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, { threadId, modelId, prompt, userId, fileIds, masterMessageId }) => {
    try {
      // Apply global rate limiting for LLM requests
      await rateLimiter.limit(ctx, "globalLLMRequests", { throws: true });
      // Enforce file support for this model
      if (fileIds && fileIds.length > 0) {
        if (!AVAILABLE_MODELS[modelId as ModelId].fileSupport) {
          throw new Error("Selected model does not support file attachments");
        }
      }
      // For ALL models (including master), save the initial prompt message to their sub-thread
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

      // Update status to initial with prompt id
      await ctx.runMutation(internal.workflows.updateRunStatus, {
        masterMessageId,
        threadId,
        status: "initial",
        promptMessageId: messageId,
      });

      // Create an agent instance with the specific model
      const agent = createAgentWithModel(modelId as ModelId);
      
      const { thread } = await agent.continueThread(ctx, { threadId, userId });
      const result = await thread.streamText({ promptMessageId: messageId }, { saveStreamDeltas: { chunking: "line", throttleMs: 500 } });
      await result.consumeStream();
      
      // After streaming completes, advance status to debate
      await ctx.runMutation(internal.workflows.updateRunStatus, {
        masterMessageId,
        threadId,
        status: "debate",
      });

      return result.text;
    } catch (error) {
      console.error(`Error generating response for model ${modelId}:`, error);
      await ctx.runMutation(internal.workflows.updateRunStatus, {
        masterMessageId,
        threadId,
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return `Error generating response from ${AVAILABLE_MODELS[modelId as ModelId].displayName}: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

// NEW ACTION: Generate a refined response based on peer review (Debate Round)
export const generateDebateResponse = internalAction({
  args: {
    threadId: v.string(),
    modelId: MODEL_ID_SCHEMA,
    otherResponses: v.array(v.object({
      modelId: MODEL_ID_SCHEMA,
      response: v.string(),
    })),
    userId: v.id("users"),
    masterMessageId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, { threadId, modelId, otherResponses, userId, masterMessageId }) => {
    try {
      // Apply global rate limiting for LLM requests
      await rateLimiter.limit(ctx, "globalLLMRequests", { throws: true });
      // Construct the debate prompt using the research paper's methodology
      const debatePrompt = `
**Remember the original question:**
---
Here are the solutions to the problem from other agents. Your task is to critically re-evaluate your own initial answer in light of these other perspectives.

${otherResponses.map(({ modelId: otherModelId, response }) => `
**Response from ${AVAILABLE_MODELS[otherModelId as ModelId].displayName}:**
${response}
`).join('\n')}

---
**Your Instructions:**
Using the reasoning from these other agents as additional advice, provide an updated and improved final response to the original question. If the other agents' reasoning has convinced you to change your mind, explain why. If you maintain your original position, justify it against the alternatives.
`;

      // Save the debate prompt message
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId,
        userId,
        prompt: debatePrompt,
      });

      // Update status remains debate, attach debate prompt id
      await ctx.runMutation(internal.workflows.updateRunStatus, {
        masterMessageId,
        threadId,
        status: "debate",
        promptMessageId: messageId,
      });

      // Create an agent instance with the specific model
      const agent = createAgentWithModel(modelId as ModelId);
      const { thread } = await agent.continueThread(ctx, { threadId, userId });
      const result = await thread.streamText({ promptMessageId: messageId }, { saveStreamDeltas: { chunking: "line", throttleMs: 500 } });
      await result.consumeStream();
      
      // After streaming completes, mark run as complete
      await ctx.runMutation(internal.workflows.updateRunStatus, {
        masterMessageId,
        threadId,
        status: "complete",
      });

      return result.text;
    } catch (error) {
      console.error(`Error generating DEBATE response for model ${modelId}:`, error);
      await ctx.runMutation(internal.workflows.updateRunStatus, {
        masterMessageId,
        threadId,
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return `Error generating debate response from ${AVAILABLE_MODELS[modelId as ModelId].displayName}: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

// Generate the final synthesis response
export const generateSynthesisResponse = internalAction({
  args: {
    masterThreadId: v.string(),
    originalPrompt: v.string(),
    masterModelId: MODEL_ID_SCHEMA,
    allResponses: v.array(v.object({
      modelId: MODEL_ID_SCHEMA,
      response: v.string(),
      isMaster: v.boolean(),
    })),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { masterThreadId, originalPrompt, masterModelId, allResponses, userId }) => {
    try {
      // Apply global rate limiting for LLM requests
      await rateLimiter.limit(ctx, "globalLLMRequests", { throws: true });
      const HIDDEN_PROMPT_PREFIX = "[HIDDEN_SYNTHESIS_PROMPT]::";
      // Update the synthesis prompt to reflect it's operating on refined answers
      const synthesisPrompt = `
You are a lead AI expert tasked with creating a final, definitive response. Multiple expert AI models have already engaged in a round of debate to refine their initial answers. Your job is to synthesize their refined conclusions.

**Original Question:**
${originalPrompt}

${allResponses.map(({ modelId, response, isMaster }) => `
**Refined Conclusion from ${AVAILABLE_MODELS[modelId as ModelId].displayName}${isMaster ? " (Primary)" : ""}:**
${response}
`).join('\n')}

**Final Instructions:**
Synthesize these peer-reviewed conclusions into a single, comprehensive, and authoritative response. Structure the answer clearly, integrate the strongest points from each model, and deliver a final product that is superior to any single refined response.
`;

      // First, save the synthesis prompt message  
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId: masterThreadId,
        userId,
        prompt: HIDDEN_PROMPT_PREFIX + synthesisPrompt,
      });

      // Use the master model to generate the synthesis
      const masterAgent = createAgentWithModel(masterModelId as ModelId);
      const { thread } = await masterAgent.continueThread(ctx, { threadId: masterThreadId, userId });
      
      // Generate the synthesis response with streaming, using the saved message ID
      const result = await thread.streamText(
        { promptMessageId: messageId }, 
        { saveStreamDeltas: { chunking: "line", throttleMs: 500 } }
      );
      
      // Consume the stream to ensure it's fully processed
      await result.consumeStream();
      
      return null;
    } catch (error) {
      console.error("Error generating synthesis response:", error);
      
      // Fallback: save an error message
      await saveMessage(ctx, components.agent, {
        threadId: masterThreadId,
        userId,
        message: {
          role: "assistant",
          content: `I apologize, but I encountered an error while synthesizing the responses from multiple models. Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      });
      
      return null;
    } finally {
      try {
        await ctx.runMutation(internal.chat.updateThreadActivity, { threadId: masterThreadId, userId, delta: -1 });
      } catch {}
    }
  },
});

// Generate a concise narrative summary of the run dynamics
export const generateRunSummary = internalAction({
  args: {
    masterThreadId: v.string(),
    originalPrompt: v.string(),
    initialResponses: v.array(v.object({ modelId: MODEL_ID_SCHEMA, response: v.string() })),
    refinedResponses: v.array(v.object({ modelId: MODEL_ID_SCHEMA, response: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, { masterThreadId, originalPrompt, initialResponses, refinedResponses }) => {
    let summaryThreadId: string | null = null;
    try {
      const agent = summaryAgent;
      // Use a fresh, ephemeral thread for summary generation to avoid
      // inheriting any non-string content (e.g., file parts) from the master thread.
      const { _id: createdSummaryThreadId } = await ctx.runMutation(
        components.agent.threads.createThread,
        {
          title: "Multi-model run summary",
          summary: "Ephemeral thread for run summarization",
        },
      );
      summaryThreadId = createdSummaryThreadId;
      const { thread } = await agent.continueThread(ctx, { threadId: summaryThreadId });
      const allowedIds = Array.from(new Set([
        ...initialResponses.map(({ modelId }) => modelId as string),
        ...refinedResponses.map(({ modelId }) => modelId as string),
      ]));
      const allowedIdsEnum = z.enum(allowedIds as [string, ...string[]]);

      const summarySchema = z.object({
        originalPrompt: z.string(),
        overview: z.string(),
        crossModel: z.object({
          agreements: z.array(z.string()),
          disagreements: z.array(z.string()),
          convergenceSummary: z.string(),
        }),
        perModel: z.array(z.object({
          modelId: allowedIdsEnum,
          modelName: z.string(),
          initialSummary: z.string(),
          refinedSummary: z.string(),
          changedPosition: z.boolean(),
          keyPoints: z.array(z.string()),
        })).length(allowedIds.length),
      });

      const prompt = `You are analyzing a multi-model debate. Build a concise, factual structured summary that matches the provided schema exactly. Do not include markdown—return pure JSON. Use short sentences for table display.\n\nOriginal prompt:\n${originalPrompt}\n\nInitial responses:\n${initialResponses.map(({ modelId, response }) => `- ${AVAILABLE_MODELS[modelId as ModelId].displayName}: ${response}`).join("\n")}\n\nRefined (debate) responses:\n${refinedResponses.map(({ modelId, response }) => `- ${AVAILABLE_MODELS[modelId as ModelId].displayName}: ${response}`).join("\n")}\n\nFor perModel, include entries for exactly these modelIds and no others: ${allowedIds.join(", ")}. Use the corresponding display names for modelName. Set overview to a one-sentence high-level takeaway.`;

      // Generate the structured object summary
      const { object: finalObject } = await thread.generateObject({
        prompt,
        schema: summarySchema,
      }, { storageOptions: { saveMessages: "none" } });

      // Persist the structured result
      const structured = finalObject as {
        originalPrompt: string;
        overview?: string;
        crossModel: { agreements: string[]; disagreements: string[]; convergenceSummary: string };
        perModel: Array<{
          modelId: ModelId;
          modelName: string;
          initialSummary: string;
          refinedSummary: string;
          changedPosition: boolean;
          keyPoints: string[];
        }>;
      };
      const ensured = { ...structured, overview: structured.overview ?? structured.crossModel.convergenceSummary } as {
        originalPrompt: string;
        overview: string;
        crossModel: { agreements: string[]; disagreements: string[]; convergenceSummary: string };
        perModel: Array<{
          modelId: ModelId;
          modelName: string;
          initialSummary: string;
          refinedSummary: string;
          changedPosition: boolean;
          keyPoints: string[];
        }>;
      };
      await ctx.runMutation(internal.workflows.setRunSummaryStructured, {
        masterThreadId,
        summary: ensured,
      });

      return null;
    } catch (error) {
      console.error("Error generating run summary:", error);
      return null;
    } finally {
      // Best-effort cleanup of the ephemeral summary thread
      if (summaryThreadId) {
        try {
          await summaryAgent.deleteThreadAsync(ctx, { threadId: summaryThreadId });
        } catch {}
      }
    }
  },
});

// Save the narrative summary to the run document
export const setRunSummary = internalMutation({
  args: {
    masterMessageId: v.string(),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { masterMessageId, summary }) => {
    const run = await ctx.db
      .query("multiModelRuns")
      .withIndex("by_master_message", (q) => q.eq("masterMessageId", masterMessageId))
      .unique();
    if (!run) return null;
    await ctx.db.patch(run._id, { runSummary: summary });
    return null;
  },
});

// Save the structured run summary to the run document
export const setRunSummaryStructured = internalMutation({
  args: {
    masterThreadId: v.string(),
    summary: v.object({
      originalPrompt: v.string(),
      overview: v.string(),
      crossModel: v.object({
        agreements: v.array(v.string()),
        disagreements: v.array(v.string()),
        convergenceSummary: v.string(),
      }),
      perModel: v.array(v.object({
        modelId: MODEL_ID_SCHEMA,
        modelName: v.string(),
        initialSummary: v.string(),
        refinedSummary: v.string(),
        changedPosition: v.boolean(),
        keyPoints: v.array(v.string()),
      })),
    }),
  },
  returns: v.null(),
  handler: async (ctx, { masterThreadId, summary }) => {
    const run = await ctx.db
      .query("multiModelRuns")
      .withIndex("by_master_thread", (q) => q.eq("masterThreadId", masterThreadId))
      .order("desc")
      .take(1);
    const latest = run[0];
    if (!latest) return null;
    await ctx.db.patch(latest._id, { runSummaryStructured: summary });
    return null;
  },
});
