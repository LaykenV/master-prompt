"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toUIMessages, useThreadMessages, type UIMessage } from "@convex-dev/agent/react";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { MessageBubble } from "./MessageBubble";
import { MultiResponseMessage } from "./MultiResponseMessage";
import { Button } from "./ui/button";
import { ChevronDown } from "lucide-react";

interface ChatMessagesProps {
  messages: ReturnType<typeof useThreadMessages>;
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  const uiMessages = messages.results ? toUIMessages(messages.results) : [];
  
  // Track streaming status for better auto-scroll dependency
  const isStreaming = uiMessages.some(m => m.status === "streaming");
  const messageCount = uiMessages.length;
  
  const {
    containerRef,
    scrollToBottom,
    shouldAutoScroll,
    handleScroll,
    handleTouchStart,
  } = useAutoScroll([uiMessages, isStreaming, messageCount]);

  if (messages.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground" role="status" aria-label="Loading messages">Loading messages...</div>
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
    <div className="relative h-full">
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        className="h-full overflow-auto p-4 custom-scrollbar"
      >
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
              <div className="max-w-[80%] rounded-lg p-4 bg-card border border-border mr-12">
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
      
      {!shouldAutoScroll && (
        <Button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200"
          size="sm"
          variant="secondary"
        >
          <ChevronDown className="h-4 w-4" />
          Scroll to Bottom
        </Button>
      )}
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
        <MessageBubble message={message} />
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