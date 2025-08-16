import { Agent } from "@convex-dev/agent";
import { google } from "@ai-sdk/google";
import { components } from "./_generated/api";
import { openai } from "@ai-sdk/openai";

// Available models configuration
export const AVAILABLE_MODELS = {
  "gpt-4o-mini": {
    provider: "openai",
    displayName: "GPT-4o Mini",
    chatModel: () => openai.chat("gpt-4o-mini"),
  },
  "gpt-4o": {
    provider: "openai", 
    displayName: "GPT-4o",
    chatModel: () => openai.chat("gpt-4o"),
  },
  "gemini-2.5-flash": {
    provider: "google",
    displayName: "Gemini 2.5 Flash",
    chatModel: () => google("gemini-2.5-flash"),
  },
  "gemini-2.5-pro": {
    provider: "google",
    displayName: "Gemini 2.5 Pro", 
    chatModel: () => google("gemini-2.5-pro"),
  },
} as const;

export type ModelId = keyof typeof AVAILABLE_MODELS;

// Helper function to get chat model by ID
export function getChatModel(modelId: ModelId) {
  return AVAILABLE_MODELS[modelId].chatModel();
}

// Helper function to create an agent with a specific model
export function createAgentWithModel(modelId: ModelId) {
    return new Agent(components.agent, {
        name: "Master Prompt",
        chat: getChatModel(modelId),
        instructions: "You are a helpful assistant that can answer questions and help with tasks.",
        usageHandler: async (ctx, { model, usage}) => {
            console.log(`Model: ${model}, Usage:`, usage);
        },
    });
}

// Default agent instance for saving messages and other operations
export const masterPromptAgent = createAgentWithModel("gpt-4o-mini");

