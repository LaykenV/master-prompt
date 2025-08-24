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

// USD price per 1M tokens for input (prompt) and output (completion + reasoning)
export const MODEL_PRICING_USD_PER_MTOKEN: Record<
  ModelId,
  { input: number; output: number }
> = {
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "claude-4-sonnet": { input: 3, output: 15 },
  "gpt-oss-120b": { input: 0.15, output: 0.6 },
  "gpt-oss-20b": { input: 0.05, output: 0.2 },
  "llama-3.3-70b": { input: 0.58, output: 0.62 },
  "Grok-4": { input: 3, output: 15 },
} as const;

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

// Safely extract and sum any "reasoningTokens" reported by providers in providerMetadata
function getReasoningTokenCount(providerMetadata: unknown): number {
  if (!providerMetadata || typeof providerMetadata !== "object") return 0;
  let totalReasoningTokens = 0;
  try {
    const metadataAsRecord = providerMetadata as Record<string, unknown>;
    for (const providerKey of Object.keys(metadataAsRecord)) {
      const providerData = metadataAsRecord[providerKey];
      if (providerData && typeof providerData === "object") {
        const maybeReasoning = (providerData as { reasoningTokens?: unknown }).reasoningTokens;
        if (typeof maybeReasoning === "number" && Number.isFinite(maybeReasoning)) {
          totalReasoningTokens += maybeReasoning;
        }
      }
    }
  } catch {
    // Best-effort parsing; ignore malformed metadata
    return 0;
  }
  return totalReasoningTokens;
}

type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

function getCostBreakdownUSD(
  modelId: ModelId,
  usage: TokenUsage,
  providerMetadata: unknown,
):
  | {
      inputUSD: number;
      outputUSD: number;
      totalUSD: number;
      reasoningTokens: number;
      outputTokens: number;
      rates: { input: number; output: number };
    }
  | null {
  const rates = MODEL_PRICING_USD_PER_MTOKEN[modelId];
  if (!rates) return null;
  const reasoningTokens = getReasoningTokenCount(providerMetadata);
  const outputTokens = usage.completionTokens + reasoningTokens;
  const inputUSD = (usage.promptTokens / 1_000_000) * rates.input;
  const outputUSD = (outputTokens / 1_000_000) * rates.output;
  const totalUSD = inputUSD + outputUSD;
  return { inputUSD, outputUSD, totalUSD, reasoningTokens, outputTokens, rates };
}

// Helper function to create an agent with a specific model
export function createAgentWithModel(modelId: ModelId) {
    return new Agent(components.agent, {
        name: "Master Prompt",
        chat: getChatModel(modelId),
        instructions: "You are a helpful assistant that can answer questions and help with tasks.",
        usageHandler: async (ctx, { model, usage, providerMetadata }) => {
            console.log(`Model: ${model}, Usage:`, usage, "Provider Metadata:", providerMetadata);
            console.log("Usage:", usage.completionTokens, usage.promptTokens, usage.totalTokens);
            const reasoningTokens = getReasoningTokenCount(providerMetadata);
            const totalWithReasoningTokens = usage.totalTokens + reasoningTokens;
            console.log("Total tokens incl. reasoning:", totalWithReasoningTokens, {
              baseTotal: usage.totalTokens,
              reasoningTokens,
            });
            const cost = getCostBreakdownUSD(modelId, usage, providerMetadata);
            if (cost) {
              console.log(
                "Estimated cost (USD):",
                Number.isFinite(cost.totalUSD) ? cost.totalUSD.toFixed(6) : cost.totalUSD,
                {
                  modelId,
                  inputUSD: cost.inputUSD,
                  outputUSD: cost.outputUSD,
                  rates: cost.rates,
                  tokens: {
                    promptTokens: usage.promptTokens,
                    completionTokens: usage.completionTokens,
                    reasoningTokens: cost.reasoningTokens,
                    outputTokens: cost.outputTokens,
                    totalTokensInclReasoning: totalWithReasoningTokens,
                  },
                },
              );
            } else {
              console.log("No pricing data found for model:", modelId);
            }
        },
    });
}

// Default agent instance for saving messages and other operations
export const masterPromptAgent = createAgentWithModel("gpt-5");

export const summaryAgent = new Agent(components.agent, {
    name: "Summary Agent",
    chat: getChatModel("gpt-oss-120b"),
    instructions: "You are a helpful assistant that can answer questions and help with tasks.",
    usageHandler: async (ctx, { model, usage, providerMetadata}) => {
        console.log(`Model: ${model}, Usage:`, usage);
        const reasoningTokens = getReasoningTokenCount(providerMetadata);
        const totalWithReasoningTokens = usage.totalTokens + reasoningTokens;
        console.log("Total tokens incl. reasoning:", totalWithReasoningTokens, {
            baseTotal: usage.totalTokens,
            reasoningTokens,
        });
        const modelId: ModelId = "gpt-oss-120b";
        const cost = getCostBreakdownUSD(modelId, usage, providerMetadata);
        if (cost) {
          console.log(
            "Estimated cost (USD):",
            Number.isFinite(cost.totalUSD) ? cost.totalUSD.toFixed(6) : cost.totalUSD,
            {
              modelId,
              inputUSD: cost.inputUSD,
              outputUSD: cost.outputUSD,
              rates: cost.rates,
              tokens: {
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                reasoningTokens: cost.reasoningTokens,
                outputTokens: cost.outputTokens,
                totalTokensInclReasoning: totalWithReasoningTokens,
              },
            },
          );
        } else {
          console.log("No pricing data found for model:", modelId);
        }
    },

});
