"use client";

import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import React, { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { toUIMessages, useThreadMessages, optimisticallySendMessage, useSmoothText, UIMessage } from "@convex-dev/agent/react";
import { ModelPicker } from "@/components/ModelPicker";
import { MultiResponseMessage } from "@/components/MultiResponseMessage";
import { Button } from "@/components/ui/button";
import { Users, Send } from "lucide-react";

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
  const [multiModelMode, setMultiModelMode] = useState(false);
  const [multiModelSelection, setMultiModelSelection] = useState<{
    master: string;
    secondary: string[];
  }>({ master: "gpt-4o-mini", secondary: [] });

  // Actions and mutations
  const startMultiModelGeneration = useAction(api.chat.startMultiModelGeneration);

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
      if (multiModelMode && multiModelSelection.secondary.length > 0) {
        // Multi-model generation
        await startMultiModelGeneration({
          threadId,
          prompt: content,
          masterModelId: multiModelSelection.master as "gpt-4o-mini" | "gpt-4o" | "gemini-2.5-flash" | "gemini-2.5-pro",
          secondaryModelIds: multiModelSelection.secondary as ("gpt-4o-mini" | "gpt-4o" | "gemini-2.5-flash" | "gemini-2.5-pro")[],
        });
      } else {
        // Single model generation (original behavior)
        await sendMessage({ 
          threadId, 
          prompt: content,
          modelId: selectedModel as "gpt-4o-mini" | "gpt-4o" | "gemini-2.5-flash" | "gemini-2.5-pro" | undefined
        });
      }
      
      if (!text) setInput("");
      // Reset selected model after sending (it's now persisted to thread)
      setSelectedModel(undefined);
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, user?._id, threadId, sendMessage, selectedModel, multiModelMode, multiModelSelection, startMultiModelGeneration]);




  return (
    <div className="flex h-full flex-col">
      {/* Header with model picker */}
      <div className="border-b bg-background p-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Chat</h1>
          </div>
          <div className="flex items-center gap-3">
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
              threadId={threadId} 
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              multiModelMode={multiModelMode}

              onMultiModelChange={setMultiModelSelection}
            />
          </div>
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
          <Button
            onClick={() => void handleSend()}
            disabled={isSending || !input.trim() || !user}
            className="px-6 py-3"
          >
            <Send className="h-4 w-4 mr-2" />
            {isSending 
              ? "Sending..." 
              : multiModelMode && multiModelSelection.secondary.length > 0 
                ? `Send to ${1 + multiModelSelection.secondary.length} Models`
                : "Send"
            }
          </Button>
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
        {uiMessages.map((m, index) => {
          // Check if this is a user message that might be part of a multi-model run
          if (m.role === "user") {
            return (
              <MessageWithMultiModel 
                key={m.key} 
                message={m} 
                messageId={messages.results?.[index]?._id}
              />
            );
          }
          return <MessageBubble key={m.key} message={m} />;
        })}
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

function MessageWithMultiModel({ message, messageId }: { message: UIMessage; messageId?: string }) {
  const multiModelRun = useQuery(
    api.chat.getMultiModelRun, 
    messageId ? { masterMessageId: messageId } : "skip"
  );

  // If this message is part of a multi-model run, show the multi-response component
  if (multiModelRun) {
    return (
      <div className="space-y-4">
        <MultiResponseMessage 
          masterMessageId={messageId!} 
          originalPrompt={message.content}
        />
      </div>
    );
  }

  // Otherwise, show the regular message bubble
  return <MessageBubble message={message} />;
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


