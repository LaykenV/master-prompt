"use client";

import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ModelPicker } from "@/components/ModelPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users } from "lucide-react";
import { ModelId } from "@/convex/agent";

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
          modelId: multiModelSelection.master as ModelId
        });
        
        // Start multi-model generation
        await startMultiModelGeneration({
          threadId,
          prompt: content,
          masterModelId: multiModelSelection.master as ModelId,
          secondaryModelIds: multiModelSelection.secondary as ModelId[],
        });
        
        router.push(`/chat/${threadId}`);
      } else {
        // Single model generation (original behavior)
        const threadId = await createThread({ 
          title: content.slice(0, 80),
          initialPrompt: content,
          modelId: selectedModel as ModelId
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
            <Input
              className="flex-1 px-4 py-3 text-sm"
              type="text"
              placeholder="Start a new chat..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onStart();
              }}
              disabled={isCreating || !user}
            />
            <Button
              onClick={() => void onStart()}
              disabled={isCreating || !input.trim() || !user}
              className="px-6 py-3 text-sm font-medium transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isCreating 
                ? "Creating..." 
                : multiModelMode && multiModelSelection.secondary.length > 0 
                  ? `Start with ${1 + multiModelSelection.secondary.length} Models`
                  : "Start Chat"
              }
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-card/80">
            <h3 className="font-semibold mb-2 text-card-foreground">💡 Ask anything</h3>
            <p className="text-muted-foreground">Get help with code, writing, research, or creative projects.</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-card/80">
            <h3 className="font-semibold mb-2 text-card-foreground">🚀 Get started quickly</h3>
            <p className="text-muted-foreground">Simple conversations that adapt to your needs and context.</p>
          </div>
        </div>
      </div>
    </div>
  );
}



