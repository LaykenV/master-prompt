import { Agent } from "@convex-dev/agent";
import { google } from "@ai-sdk/google";
import { components } from "./_generated/api";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { v } from "convex/values";
import { groq } from "@ai-sdk/groq";
import { xai } from "@ai-sdk/xai";

// Available models configuration
export const AVAILABLE_MODELS = {
  "gemini-2.5-flash": {
    provider: "google",
    displayName: "Gemini 2.5 Flash",
    fileSupport: true,
    reasoning: true,
    chatModel: () => google("gemini-2.5-flash"),
  },
  "gemini-2.5-pro": {
    provider: "google",
    displayName: "Gemini 2.5 Pro",
    fileSupport: true,
    reasoning: true,
    chatModel: () => google("gemini-2.5-pro"),
  },
  "gpt-5": {
    provider: "openai",
    displayName: "GPT-5",
    fileSupport: true,
    reasoning: true,
    chatModel: () => openai.chat("gpt-5"),
  },
  "gpt-5-mini": {
    provider: "openai",
    displayName: "GPT-5 Mini",
    fileSupport: true,
    reasoning: true,
    chatModel: () => openai.chat("gpt-5-mini"),
  },
  "gpt-5-nano": {
    provider: "openai",
    displayName: "GPT-5 Nano",
    fileSupport: true,
    reasoning: true,
    chatModel: () => openai.chat("gpt-5-nano"),
  },
  "claude-4-sonnet": {
    provider: "anthropic",
    displayName: "Claude 4 Sonnet",
    fileSupport: true,
    reasoning: true,
    chatModel: () => anthropic("claude-sonnet-4-20250514"),
  },
  "gpt-oss-120b": {
    provider: "Open Source",
    displayName: "GPT OSS 120B",
    fileSupport: false,
    reasoning: false,
    chatModel: () => groq("openai/gpt-oss-120b"),
  },
  "gpt-oss-20b": {
    provider: "Open Source",
    displayName: "GPT OSS 20B",
    fileSupport: false,
    reasoning: false,
    chatModel: () => groq("openai/gpt-oss-20b"),
  },
  "llama-3.3-70b": {
    provider: "Open Source",
    displayName: "Llama 3.3 70B",
    fileSupport: false,
    reasoning: false,
    chatModel: () => groq("llama-3.3-70b-versatile"),
  },
  "Grok-4": {
    provider: "xAI",
    displayName: "Grok-4",
    fileSupport: false,
    reasoning: true,
    chatModel: () => xai("grok-4"),
  },
} as const;

export type ModelId = keyof typeof AVAILABLE_MODELS;

// Shared Convex schema for model IDs
export const MODEL_ID_SCHEMA = v.union(
  v.literal("gemini-2.5-flash"),
  v.literal("gemini-2.5-pro"),
  v.literal("gpt-5"),
  v.literal("gpt-5-mini"),
  v.literal("gpt-5-nano"),
  v.literal("claude-4-sonnet"),
  v.literal("gpt-oss-120b"),
  v.literal("gpt-oss-20b"),
  v.literal("llama-3.3-70b"),
  v.literal("Grok-4")
);

// Helper function to get chat model by ID
export function getChatModel(modelId: ModelId) {
  return AVAILABLE_MODELS[modelId].chatModel();
}

// Themed logos for providers served from the public/ directory
export type ThemedLogo = { light: string; dark: string; alt: string };

const PROVIDER_LOGOS: Record<string, ThemedLogo> = {
  openai: {
    light: "/OpenAI-black-monoblossom.svg",
    dark: "/OpenAI-white-monoblossom.svg",
    alt: "OpenAI",
  },
  google: {
    // No dark variant provided for Gemini; use the same asset
    light: "/32px-Google-gemini-icon.svg.png",
    dark: "/32px-Google-gemini-icon.svg.png",
    alt: "Google Gemini",
  },
  anthropic: {
    light: "/Anthropic_Symbol_0.svg",
    dark: "/Anthropic_Symbol_0_white.svg",
    alt: "Anthropic",
  },
  "Open Source": {
    light: "/icons8-meta.svg",
    dark: "/icons8-meta.svg",
    alt: "Open Source",
  },
  xAI: {
    light: "/xai.svg",
    dark: "/xai.webp",
    alt: "xAI",
  },
};

export function getProviderLogo(provider: string): ThemedLogo {
  const logo = PROVIDER_LOGOS[provider];
  if (!logo) return { light: "/convex.svg", dark: "/convex.svg", alt: provider || "Model" };
  return logo;
}

export function getModelLogo(modelId: ModelId): ThemedLogo {
  const provider = AVAILABLE_MODELS[modelId].provider;
  if (provider === "Open Source") {
    // Choose logo based on the underlying model family
    if (modelId.startsWith("llama")) {
      // Meta for Llama family
      return {
        light: "/icons8-meta.svg",
        dark: "/icons8-meta.svg",
        alt: "Meta Llama",
      };
    }
    if (modelId.startsWith("gpt-oss")) {
      // OSS GPT variants -> use OpenAI mark
      return {
        light: "/OpenAI-black-monoblossom.svg",
        dark: "/OpenAI-white-monoblossom.svg",
        alt: "OpenAI GPT-OSS",
      };
    }
    return getProviderLogo(provider);
  }
  return getProviderLogo(provider);
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
export const masterPromptAgent = createAgentWithModel("gpt-5-mini");

export const summaryAgent = new Agent(components.agent, {
    name: "Summary Agent",
    chat: getChatModel("gpt-oss-120b"),
    instructions: "You are a helpful assistant that can answer questions and help with tasks.",
    usageHandler: async (ctx, { model, usage}) => {
        console.log(`Model: ${model}, Usage:`, usage);
    },
});
