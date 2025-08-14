"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { toUIMessages, useThreadMessages, optimisticallySendMessage } from "@convex-dev/agent/react";

export default function ThreadPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const threadId = String((params as { threadId: string }).threadId);
  const user = useQuery(api.chat.getUser);
  const sendMessage = useMutation(api.chat.sendMessage).withOptimisticUpdate(
    optimisticallySendMessage(api.chat.listThreadMessages)
  );
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const didSendInitialRef = useRef(false);

  const initial = searchParams.get("initial") ?? undefined;

  useEffect(() => {
    if (!didSendInitialRef.current && initial && user?._id) {
      didSendInitialRef.current = true;
      void handleSend(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, user?._id, threadId]);

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isSending || !user?._id) return;
    setIsSending(true);
    try {
      await sendMessage({ threadId, prompt: content });
      if (!text) setInput("");
    } finally {
      setIsSending(false);
    }
  };

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
  const uiMessages = toUIMessages(messages.results ?? []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflow: "auto", marginBottom: 12 }}>
      {uiMessages.map((m) => (
        <div key={m.key} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", background: "#000000", padding: 8, borderRadius: 6 }}>
          <span style={{ opacity: 0.6, marginRight: 6 }}>{m.role === "user" ? "You" : "Assistant"}:</span>
          {m.content}
        </div>
      ))}
    </div>
  );
}


