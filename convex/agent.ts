import { Agent } from "@convex-dev/agent";
import { google } from "@ai-sdk/google";
import { components } from "./_generated/api";
import { openai } from "@ai-sdk/openai";
import { v } from "convex/values";

// Available models configuration
export const AVAILABLE_MODELS = {
  "gpt-4o-mini": {
    provider: "openai",
    displayName: "GPT-4o Mini",
    icon: "🤖",
    chatModel: () => openai.chat("gpt-4o-mini"),
  },
  "gpt-4o": {
    provider: "openai", 
    displayName: "GPT-4o",
    icon: "🤖",
    chatModel: () => openai.chat("gpt-4o"),
  },
  "gemini-2.5-flash": {
    provider: "google",
    displayName: "Gemini 2.5 Flash",
    icon: "🔮",
    chatModel: () => google("gemini-2.5-flash"),
  },
  "gemini-2.5-pro": {
    provider: "google",
    displayName: "Gemini 2.5 Pro",
    icon: "🔮",
    chatModel: () => google("gemini-2.5-pro"),
  },
  "gemini-2.0-flash": {
    provider: "google",
    displayName: "Gemini 2.0 Flash",
    icon: "🔮",
    chatModel: () => google("gemini-2.0-flash"),
  },
  "gpt-5": {
    provider: "openai",
    displayName: "GPT-5",
    icon: "🤖",
    chatModel: () => openai.chat("gpt-5"),
  },
  "gpt-5-mini": {
    provider: "openai",
    displayName: "GPT-5 Mini",
    icon: "🤖",
    chatModel: () => openai.chat("gpt-5-mini"),
  },
  "gpt-5-nano": {
    provider: "openai",
    displayName: "GPT-5 Nano",
    icon: "🤖",
    chatModel: () => openai.chat("gpt-5-nano"),
  },
} as const;

export type ModelId = keyof typeof AVAILABLE_MODELS;

// Shared Convex schema for model IDs
export const MODEL_ID_SCHEMA = v.union(
  v.literal("gpt-4o-mini"),
  v.literal("gpt-4o"),
  v.literal("gemini-2.5-flash"),
  v.literal("gemini-2.5-pro"),
  v.literal("gemini-2.0-flash"),
  v.literal("gpt-5"),
  v.literal("gpt-5-mini"),
  v.literal("gpt-5-nano")
);

// Helper function to get chat model by ID
export function getChatModel(modelId: ModelId) {
  return AVAILABLE_MODELS[modelId].chatModel();
}

// Helper function to get model icon by ID
export function getModelIcon(modelId: ModelId) {
  return AVAILABLE_MODELS[modelId].icon;
}

// Helper function to get provider icon by provider name (for backward compatibility)
export function getProviderIcon(provider: string) {
  switch (provider) {
    case "openai":
      return "🤖";
    case "google":
      return "🔮";
    default:
      return "🤖";
  }
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

export const summaryAgent = new Agent(components.agent, {
    name: "Summary Agent",
    chat: getChatModel("gpt-5-nano"),
    instructions: "You are a helpful assistant that can answer questions and help with tasks.",
    usageHandler: async (ctx, { model, usage}) => {
        console.log(`Model: ${model}, Usage:`, usage);
    },
});

