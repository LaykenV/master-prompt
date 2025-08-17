import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
import { createAgentWithModel, ModelId, AVAILABLE_MODELS } from "./agent";
import { saveMessage } from "@convex-dev/agent";
import { internalMutation, internalAction } from "./_generated/server";

// Initialize the workflow manager
// Type assertion needed due to API signature mismatch between workflow versions
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

    // Step 1: Create temporary threads for secondary models
    const secondaryThreadCreationTasks = secondaryModelIds.map(modelId => 
      step.runMutation(internal.workflows.createSecondaryThread, {
        modelId,
        userId,
      })
    );
    const secondaryThreadIds = await Promise.all(secondaryThreadCreationTasks);

    // Step 2: Record the multi-model run
    const secondaryRuns = secondaryModelIds.map((modelId, index) => ({
      modelId,
      threadId: secondaryThreadIds[index],
    }));

    await step.runMutation(internal.workflows.recordMultiModelRun, {
      masterMessageId,
      masterThreadId,
      secondaryRuns,
    });

    // Step 3: Generate responses from all models in parallel (including master)
    const allGenerationTasks = [
      // Master model generation
      step.runAction(internal.workflows.generateModelResponse, {
        threadId: masterThreadId,
        modelId: masterModelId,
        prompt,
        userId,
        isMaster: true,
      }),
      // Secondary model generations
      ...secondaryModelIds.map((modelId, index) =>
        step.runAction(internal.workflows.generateModelResponse, {
          threadId: secondaryThreadIds[index],
          modelId,
          prompt,
          userId,
          isMaster: false,
        })
      ),
    ];

    // Wait for all responses to complete
    const allResponses = await Promise.all(allGenerationTasks);

    // Step 4: Collect all responses for synthesis
    const masterResponse = allResponses[0];
    const secondaryResponses = allResponses.slice(1);

    // Step 5: Generate synthesis prompt and create final response
    await step.runAction(internal.workflows.generateSynthesisResponse, {
      masterThreadId,
      originalPrompt: prompt,
      masterModelId,
      masterResponse,
      secondaryResponses: secondaryResponses.map((response: string, index: number) => ({
        modelId: secondaryModelIds[index],
        response,
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
    userId: v.id("users"),
  },
  returns: v.string(),
  handler: async (ctx, { modelId, userId }) => {
    const { _id: threadId } = await ctx.runMutation(
      components.agent.threads.createThread,
      {
        userId,
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
    secondaryRuns: v.array(v.object({
      modelId: v.union(
        v.literal("gpt-4o-mini"),
        v.literal("gpt-4o"),
        v.literal("gemini-2.5-flash"),
        v.literal("gemini-2.5-pro")
      ),
      threadId: v.string(),
    })),
  },
  returns: v.null(),
  handler: async (ctx, { masterMessageId, masterThreadId, secondaryRuns }) => {
    await ctx.db.insert("multiModelRuns", {
      masterMessageId,
      masterThreadId,
      secondaryRuns,
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
  handler: async (ctx, { threadId, modelId, prompt, userId, isMaster }) => {
    try {
      // For secondary models, save the initial prompt message
      if (!isMaster) {
        await saveMessage(ctx, components.agent, {
          threadId,
          userId,
          prompt,
        });
      }

      // Create an agent instance with the specific model
      const agent = createAgentWithModel(modelId as ModelId);
      
      const { thread } = await agent.continueThread(ctx, { threadId });
      const result = await thread.generateText({ prompt });
      
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
    masterResponse: v.string(),
    secondaryResponses: v.array(v.object({
      modelId: v.union(
        v.literal("gpt-4o-mini"),
        v.literal("gpt-4o"),
        v.literal("gemini-2.5-flash"),
        v.literal("gemini-2.5-pro")
      ),
      response: v.string(),
    })),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { masterThreadId, originalPrompt, masterModelId, masterResponse, secondaryResponses }) => {
    try {
      // Create a synthesis prompt
      const synthesisPrompt = `
You are tasked with creating a comprehensive response by synthesizing insights from multiple AI models. Here is the original question and the responses from different models:

**Original Question:**
${originalPrompt}

**Response from ${AVAILABLE_MODELS[masterModelId as ModelId].displayName} (Primary):**
${masterResponse}

${secondaryResponses.map(({ modelId, response }) => `
**Response from ${AVAILABLE_MODELS[modelId as ModelId].displayName}:**
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

      // Use the master model to generate the synthesis
      const masterAgent = createAgentWithModel(masterModelId as ModelId);
      const { thread } = await masterAgent.continueThread(ctx, { threadId: masterThreadId });
      
      // Generate the synthesis response with streaming
      const result = await thread.streamText(
        { prompt: synthesisPrompt }, 
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
        message: {
          role: "assistant",
          content: `I apologize, but I encountered an error while synthesizing the responses from multiple models. Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      });
      
      return null;
    }
  },
});
