"use client";

import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewChatPage() {
  const router = useRouter();
  const user = useQuery(api.chat.getUser);
  const createThread = useAction(api.chat.createThread);
  const [input, setInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const onStart = async () => {
    const content = input.trim();
    if (!content || isCreating || !user?._id) return;
    setIsCreating(true);
    try {
      const threadId = await createThread({ 
        title: content.slice(0, 80),
        initialPrompt: content 
      });
      router.push(`/chat/${threadId}`);
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
              {isCreating ? "Creating..." : "Start Chat"}
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



