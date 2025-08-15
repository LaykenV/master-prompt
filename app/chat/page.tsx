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
    <main style={{ padding: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          type="text"
          placeholder="Start a new chat"
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
          style={{ padding: "8px 12px", borderRadius: 6 }}
        >
          {isCreating ? "Creating…" : "New Chat"}
        </button>
      </div>
    </main>
  );
}



