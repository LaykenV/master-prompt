import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
import { createAgentWithModel, ModelId, AVAILABLE_MODELS } from "./agent";
import { saveMessage } from "@convex-dev/agent";
import { internalMutation, internalAction } from "./_generated/server";

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
    userId: v.id("users"),
  },
  handler: async (step, args): Promise<void> => {
    const { masterThreadId, masterMessageId, prompt, masterModelId, secondaryModelIds, userId } = args;

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

    // Step 3: Generate responses from all models in parallel (all in sub-threads)
    const allGenerationTasks = allModelIds.map((modelId, index) =>
      step.runAction(internal.workflows.generateModelResponse, {
        threadId: allThreadIds[index],
        modelId,
        prompt,
        userId,
        isMaster: index === 0,
      })
    );

    // Wait for all responses to complete
    const allResponses = await Promise.all(allGenerationTasks);

    // Step 4: Generate synthesis in the master thread
    await step.runAction(internal.workflows.generateSynthesisResponse, {
      masterThreadId,
      originalPrompt: prompt,
      masterModelId,
      allResponses: allResponses.map((response: string, index: number) => ({
        modelId: allModelIds[index],
        response,
        isMaster: index === 0,
      })),
      userId,
    });
  },
});

// Supporting mutations and actions for the workflow

// Create a temporary thread for a secondary model
export const createSecondaryThread = internalMutation({
  args: {
    modelId: v.union(
      v.literal("gpt-4o-mini"),
      v.literal("gpt-4o"),
      v.literal("gemini-2.5-flash"),
      v.literal("gemini-2.5-pro")
    ),
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
  },
  returns: v.null(),
  handler: async (ctx, { masterMessageId, masterThreadId, masterModelId, allRuns }) => {
    await ctx.db.insert("multiModelRuns", {
      masterMessageId,
      masterThreadId,
      masterModelId,
      allRuns,
    });
    return null;
  },
});

// Generate a response from a specific model
export const generateModelResponse = internalAction({
  args: {
    threadId: v.string(),
    modelId: v.union(
      v.literal("gpt-4o-mini"),
      v.literal("gpt-4o"),
      v.literal("gemini-2.5-flash"),
      v.literal("gemini-2.5-pro")
    ),
    prompt: v.string(),
    userId: v.id("users"),
    isMaster: v.boolean(),
  },
  returns: v.string(),
  handler: async (ctx, { threadId, modelId, prompt, userId }) => {
    try {
      // For ALL models (including master), save the initial prompt message to their sub-thread
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId,
        userId,
        prompt,
      });

      // Create an agent instance with the specific model
      const agent = createAgentWithModel(modelId as ModelId);
      
      const { thread } = await agent.continueThread(ctx, { threadId });
      const result = await thread.streamText({ promptMessageId: messageId }, { saveStreamDeltas: { chunking: "line", throttleMs: 500 } });
      await result.consumeStream();
      
      return result.text;
    } catch (error) {
      console.error(`Error generating response for model ${modelId}:`, error);
      return `Error generating response from ${AVAILABLE_MODELS[modelId as ModelId].displayName}: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});

// Generate the final synthesis response
export const generateSynthesisResponse = internalAction({
  args: {
    masterThreadId: v.string(),
    originalPrompt: v.string(),
    masterModelId: v.union(
      v.literal("gpt-4o-mini"),
      v.literal("gpt-4o"),
      v.literal("gemini-2.5-flash"),
      v.literal("gemini-2.5-pro")
    ),
    allResponses: v.array(v.object({
      modelId: v.union(
        v.literal("gpt-4o-mini"),
        v.literal("gpt-4o"),
        v.literal("gemini-2.5-flash"),
        v.literal("gemini-2.5-pro")
      ),
      response: v.string(),
      isMaster: v.boolean(),
    })),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { masterThreadId, originalPrompt, masterModelId, allResponses, userId }) => {
    try {
      const HIDDEN_PROMPT_PREFIX = "[HIDDEN_SYNTHESIS_PROMPT]::";
      // Create a synthesis prompt
      const synthesisPrompt = `
You are tasked with creating a comprehensive response by synthesizing insights from multiple AI models. Here is the original question and the responses from different models:

**Original Question:**
${originalPrompt}

${allResponses.map(({ modelId, response, isMaster }) => `
**Response from ${AVAILABLE_MODELS[modelId as ModelId].displayName}${isMaster ? " (Primary)" : ""}:**
${response}
`).join('\n')}

**Instructions:**
Please provide a comprehensive, synthesized response that:
1. Incorporates the best insights from all models
2. Highlights areas of agreement and disagreement
3. Provides a balanced perspective
4. Is clear, coherent, and well-structured
5. Gives credit to different perspectives when appropriate

Create a response that is better than any individual model's response by combining their strengths.
`;

      // First, save the synthesis prompt message  
      const { messageId } = await saveMessage(ctx, components.agent, {
        threadId: masterThreadId,
        userId,
        prompt: HIDDEN_PROMPT_PREFIX + synthesisPrompt,
      });

      // Use the master model to generate the synthesis
      const masterAgent = createAgentWithModel(masterModelId as ModelId);
      const { thread } = await masterAgent.continueThread(ctx, { threadId: masterThreadId });
      
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
    }
  },
});
