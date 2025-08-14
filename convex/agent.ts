import { Agent } from "@convex-dev/agent";
import { google } from "@ai-sdk/google";
import { components } from "./_generated/api";

export const agent = new Agent(components.agent, {
    name: "Master Prompt",
    chat: google("gemini-2.5-flash"),
    instructions: "You are a helpful assistant that can answer questions and help with tasks.",
    usageHandler: async (ctx, { model, usage}) => {
        console.log(`Model: ${model}, Usage: ${usage}`);
    },
});

