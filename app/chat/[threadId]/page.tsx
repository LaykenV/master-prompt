"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { toUIMessages, useThreadMessages, optimisticallySendMessage, useSmoothText, UIMessage } from "@convex-dev/agent/react";

export default function ThreadPage() {
  const params = useParams();

  const threadId = String((params as { threadId: string }).threadId);
  const user = useQuery(api.chat.getUser);
  const sendMessage = useMutation(api.chat.sendMessage).withOptimisticUpdate(
    optimisticallySendMessage(api.chat.listThreadMessages)
  );
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isSending || !user?._id) return;
    setIsSending(true);
    try {
      await sendMessage({ threadId, prompt: content });
      if (!text) setInput("");
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, user?._id, threadId, sendMessage]);




  return (
    <div style={{ padding: 16 }}>
      <Messages threadId={threadId} />
      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ flex: 1, padding: 8, border: "1px solid #ddd", borderRadius: 6 }}
          type="text"
          placeholder="Message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSend();
          }}
          disabled={isSending || !user}
        />
        <button
          onClick={() => void handleSend()}
          disabled={isSending || !input.trim() || !user}
          style={{ padding: "8px 12px", borderRadius: 6 }}
        >
          {isSending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
}


function Messages({ threadId }: { threadId: string }) {
  const messages = useThreadMessages(
    api.chat.listThreadMessages,
    { threadId },
    { initialNumItems: 10, stream: true }
  );

  if (messages.isLoading) {
    return <div>Loading...</div>;
  }

  if (!messages.results || messages.results.length === 0) {
    return <div>No messages yet</div>;
  }

  const uiMessages = toUIMessages(messages.results ?? []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflow: "auto", marginBottom: 12 }}>
      {uiMessages.map((m) => (
        <MessageBubble key={m.key} message={m} />
      ))}
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
    const [visibleText] = useSmoothText(message.content, {
      startStreaming: message.status === "streaming",
    });
    
    return (
      <div style={{ 
        alignSelf: message.role === "user" ? "flex-end" : "flex-start", 
        background: message.role === "user" ? "#007bff" : "#f1f1f1", 
        color: message.role === "user" ? "white" : "black",
        padding: 8, 
        borderRadius: 6 
      }}>
        <span style={{ opacity: 0.6, marginRight: 6 }}>
          {message.role === "user" ? "You" : "Assistant"}:
        </span>
        {visibleText}
      </div>
    );
  }


