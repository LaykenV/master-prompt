"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import React, { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { toUIMessages, useThreadMessages, optimisticallySendMessage, useSmoothText, UIMessage } from "@convex-dev/agent/react";
import { ModelPicker } from "@/components/ModelPicker";

export default function ThreadPage() {
  const params = useParams();

  const threadId = String((params as { threadId: string }).threadId);
  const user = useQuery(api.chat.getUser);
  const sendMessage = useMutation(api.chat.sendMessage).withOptimisticUpdate(
    optimisticallySendMessage(api.chat.listThreadMessages)
  );
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>();
  const [isSending, setIsSending] = useState(false);

  // Get messages to check if streaming has started
  const messages = useThreadMessages(
    api.chat.listThreadMessages,
    { threadId },
    { initialNumItems: 10, stream: true }
  );

  // No explicit pending state; loader is derived from message list

  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isSending || !user?._id) return;
    setIsSending(true);
    
    try {
      await sendMessage({ 
        threadId, 
        prompt: content,
        modelId: selectedModel as "gpt-4o-mini" | "gpt-4o" | "gemini-2.5-flash" | "gemini-2.5-pro" | undefined
      });
      if (!text) setInput("");
      // Reset selected model after sending (it's now persisted to thread)
      setSelectedModel(undefined);
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, user?._id, threadId, sendMessage, selectedModel]);




  return (
    <div className="flex h-full flex-col">
      {/* Header with model picker */}
      <div className="border-b bg-background p-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Chat</h1>
          </div>
          <ModelPicker 
            threadId={threadId} 
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden">
        <Messages messages={messages} />
      </div>
      <div className="border-t bg-background p-4">
        <div className="mx-auto max-w-4xl flex gap-2">
          <input
            className="flex-1 rounded-lg border border-input bg-background px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            type="text"
            placeholder="Type your message..."
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
            className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}


function Messages({ messages }: { messages: ReturnType<typeof useThreadMessages> }) {
  if (messages.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading messages...</div>
      </div>
    );
  }

  if (!messages.results || messages.results.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-muted-foreground">No messages yet</div>
          <div className="text-sm text-muted-foreground">Start the conversation below</div>
        </div>
      </div>
    );
  }

  const uiMessages = toUIMessages(messages.results ?? []);

  // Show a derived loader bubble if the latest message is from the user
  // and there is no assistant message after it (streaming or complete).
  const lastUserIndex = (() => {
    for (let i = uiMessages.length - 1; i >= 0; i -= 1) {
      if (uiMessages[i].role === "user") return i;
    }
    return -1;
  })();
  const hasAssistantAfterLastUser = lastUserIndex !== -1 && uiMessages.some((m, idx) => idx > lastUserIndex && m.role === "assistant");
  const shouldShowPendingAssistant = lastUserIndex !== -1 && !hasAssistantAfterLastUser;
  
  return (
    <div className="h-full overflow-auto p-4 custom-scrollbar">
      <div className="mx-auto max-w-4xl space-y-4">
        {uiMessages.map((m) => (
          <MessageBubble key={m.key} message={m} />
        ))}
        {shouldShowPendingAssistant && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-lg p-4 bg-card border mr-12">
              <div className="text-xs opacity-60 mb-1">Assistant</div>
              <div className="mt-2 flex items-center gap-1">
                <div className="h-1 w-1 rounded-full bg-current animate-pulse" />
                <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.2s" }} />
                <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.4s" }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
    const [visibleText] = useSmoothText(message.content, {
      startStreaming: message.status === "streaming",
    });
    
    return (
      <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
        <div 
          className={`max-w-[80%] rounded-lg p-4 ${
            message.role === "user" 
              ? "bg-primary text-primary-foreground ml-12" 
              : "bg-card border mr-12"
          }`}
        >
          <div className="text-xs opacity-60 mb-1">
            {message.role === "user" ? "You" : "Assistant"}
          </div>
          <div 
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: visibleText }}
          />
          {message.status === "streaming" && (
            <div className="mt-2 flex items-center gap-1">
              <div className="h-1 w-1 rounded-full bg-current animate-pulse" />
              <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.2s" }} />
              <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.4s" }} />
            </div>
          )}
        </div>
      </div>
    );
  }


