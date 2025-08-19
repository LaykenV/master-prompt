import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { v } from "convex/values";
import { createAgentWithModel, ModelId, AVAILABLE_MODELS, MODEL_ID_SCHEMA } from "./agent";
import { saveMessage, getFile } from "@convex-dev/agent";
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
    masterModelId: MODEL_ID_SCHEMA,
    secondaryModelIds: v.array(MODEL_ID_SCHEMA),
    userId: v.id("users"),
    fileIds: v.optional(v.array(v.string())),
  },
  handler: async (step, args): Promise<void> => {
    const { masterThreadId, masterMessageId, prompt, masterModelId, secondaryModelIds, userId, fileIds } = args;

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
        originalPrompt: prompt,
        // Provide the responses from all OTHER models for peer review
        otherResponses: initialResponsesWithMeta.filter((_, i) => i !== index),
        userId,
      })
    );
    const refinedResponses = await Promise.all(debateGenerationTasks);
    
    // Step 5: Generate final synthesis in the master thread using the REFINED responses
    await step.runAction(internal.workflows.generateSynthesisResponse, {
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
      allRuns,
    });
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
  },
  returns: v.string(),
  handler: async (ctx, { threadId, modelId, prompt, userId, fileIds }) => {
    try {
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

// NEW ACTION: Generate a refined response based on peer review (Debate Round)
export const generateDebateResponse = internalAction({
  args: {
    threadId: v.string(),
    modelId: MODEL_ID_SCHEMA,
    originalPrompt: v.string(),
    otherResponses: v.array(v.object({
      modelId: MODEL_ID_SCHEMA,
      response: v.string(),
    })),
    userId: v.id("users"),
  },
  returns: v.string(),
  handler: async (ctx, { threadId, modelId, originalPrompt, otherResponses, userId }) => {
    try {
      // Construct the debate prompt using the research paper's methodology
      const debatePrompt = `
**Original Question:**
${originalPrompt}

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

      // Create an agent instance with the specific model
      const agent = createAgentWithModel(modelId as ModelId);
      const { thread } = await agent.continueThread(ctx, { threadId });
      const result = await thread.streamText({ promptMessageId: messageId }, { saveStreamDeltas: { chunking: "line", throttleMs: 500 } });
      await result.consumeStream();
      
      return result.text;
    } catch (error) {
      console.error(`Error generating DEBATE response for model ${modelId}:`, error);
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
