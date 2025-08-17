"use client";

import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModelPicker } from "@/components/ModelPicker";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";

export default function NewChatPage() {
  const router = useRouter();
  const user = useQuery(api.chat.getUser);
  const createThread = useAction(api.chat.createThread);
  const startMultiModelGeneration = useAction(api.chat.startMultiModelGeneration);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>("gpt-4o-mini");
  const [isCreating, setIsCreating] = useState(false);
  const [multiModelMode, setMultiModelMode] = useState(false);
  const [multiModelSelection, setMultiModelSelection] = useState<{
    master: string;
    secondary: string[];
  }>({ master: "gpt-4o-mini", secondary: [] });

  const onStart = async () => {
    const content = input.trim();
    if (!content || isCreating || !user?._id) return;
    setIsCreating(true);
    try {
      if (multiModelMode && multiModelSelection.secondary.length > 0) {
        // Multi-model generation: Create thread without initial prompt, then start multi-model workflow
        const threadId = await createThread({ 
          title: content.slice(0, 80),
          modelId: multiModelSelection.master as "gpt-4o-mini" | "gpt-4o" | "gemini-2.5-flash" | "gemini-2.5-pro"
        });
        
        // Start multi-model generation
        await startMultiModelGeneration({
          threadId,
          prompt: content,
          masterModelId: multiModelSelection.master as "gpt-4o-mini" | "gpt-4o" | "gemini-2.5-flash" | "gemini-2.5-pro",
          secondaryModelIds: multiModelSelection.secondary as ("gpt-4o-mini" | "gpt-4o" | "gemini-2.5-flash" | "gemini-2.5-pro")[],
        });
        
        router.push(`/chat/${threadId}`);
      } else {
        // Single model generation (original behavior)
        const threadId = await createThread({ 
          title: content.slice(0, 80),
          initialPrompt: content,
          modelId: selectedModel as "gpt-4o-mini" | "gpt-4o" | "gemini-2.5-flash" | "gemini-2.5-pro"
        });
        router.push(`/chat/${threadId}`);
      }
    } finally {
      setIsCreating(false);
    }
  };



  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Welcome to Master Prompt</h1>
          <p className="text-muted-foreground">
            Start a conversation with our AI assistant. Ask questions, get help, or just chat.
          </p>
        </div>

        {!user && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-center">
            <p className="text-sm text-destructive">
              Please sign in to start a new chat.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {/* Multi-Model Toggle and Model Selector */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant={multiModelMode ? "default" : "outline"}
              size="sm"
              onClick={() => setMultiModelMode(!multiModelMode)}
              className="flex items-center gap-2"
            >
              <Users className="h-4 w-4" />
              Multi-Model
            </Button>
            <ModelPicker 
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              multiModelMode={multiModelMode}
              onMultiModelChange={setMultiModelSelection}
            />
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              type="text"
              placeholder="Start a new chat..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onStart();
              }}
              disabled={isCreating || !user}
            />
            <button
              onClick={() => void onStart()}
              disabled={isCreating || !input.trim() || !user}
              className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {isCreating 
                ? "Creating..." 
                : multiModelMode && multiModelSelection.secondary.length > 0 
                  ? `Start with ${1 + multiModelSelection.secondary.length} Models`
                  : "Start Chat"
              }
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold mb-2">💡 Ask anything</h3>
            <p className="text-muted-foreground">Get help with code, writing, research, or creative projects.</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold mb-2">🚀 Get started quickly</h3>
            <p className="text-muted-foreground">Simple conversations that adapt to your needs and context.</p>
          </div>
        </div>
      </div>
    </div>
  );
}



