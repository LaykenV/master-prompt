"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toUIMessages, useThreadMessages, type UIMessage } from "@convex-dev/agent/react";
import { useAutoScroll } from "@/hooks/use-auto-scroll";
import { MessageBubble } from "./MessageBubble";
import { MultiResponseMessage } from "./MultiResponseMessage";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { Loader2 } from "lucide-react";
import { ChevronDown } from "lucide-react";

interface ChatMessagesProps {
  messages: ReturnType<typeof useThreadMessages>;
  pendingFromRedirect?: { content: string; hasFiles?: boolean; createdAt?: number } | null;
}

export function ChatMessages({ messages, pendingFromRedirect }: ChatMessagesProps) {
  const uiMessages = messages.results ? toUIMessages(messages.results) : [];
  
  // Track streaming status for better auto-scroll dependency
  const isStreaming = uiMessages.some(m => m.status === "streaming");
  const isAssistantStreaming = uiMessages.some(m => m.role === "assistant" && m.status === "streaming");
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
      <div className="h-full p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          {pendingFromRedirect ? (
            <UserPendingSkeleton hasFiles={!!pendingFromRedirect.hasFiles} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground" role="status" aria-label="Loading messages">Loading messages...</div>
          )}
        </div>
      </div>
    );
  }

  if (!messages.results || messages.results.length === 0) {
    return (
      <div className="h-full p-4">
        <div className="mx-auto max-w-4xl">
          {pendingFromRedirect ? (
            <UserPendingSkeleton hasFiles={!!pendingFromRedirect.hasFiles} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center space-y-2">
                <div className="text-muted-foreground">No messages yet</div>
                <div className="text-sm text-muted-foreground">Start the conversation below</div>
              </div>
            </div>
          )}
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
  const shouldShowPendingAssistant = lastUserIndex !== -1 && !hasAssistantAfterLastUser && !isAssistantStreaming;
  
  return (
    <div className="relative h-full">
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        className="h-full overflow-auto p-4 pt-6 custom-scrollbar"
      >
        <div className="mx-auto max-w-3xl space-y-12 chat-content">
          {/* Show pending user skeleton above real messages if needed (very brief overlap window) */}
          {pendingFromRedirect && (
            <UserPendingSkeleton hasFiles={!!pendingFromRedirect.hasFiles} />
          )}
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
              <div className="mr-12 max-w-[80%]">
                <div className="inline-flex items-center gap-2 rounded-2xl px-4 py-3">
                  <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
                  <div className="h-3 w-3 rounded-full bg-primary/80 animate-pulse" style={{ animationDelay: "0.18s" }} />
                  <div className="h-3 w-3 rounded-full bg-primary/60 animate-pulse" style={{ animationDelay: "0.36s" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {!shouldAutoScroll && (
        <Button
          onClick={scrollToBottom}
          className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 user-bubble rounded-xl px-4 py-2.5 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 flex items-center gap-2 cursor-pointer"
          size="sm"
          variant="ghost"
        >
          <ChevronDown className="h-4 w-4" />
          Scroll to bottom
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
        />
      </div>
    );
  }

  // Otherwise, show the regular message bubble
  return <MessageBubble message={message} />;
}

function UserPendingSkeleton({ hasFiles }: { hasFiles?: boolean }) {
  return (
    <div className="flex justify-end">
      <div className="user-bubble ml-12 max-w-[72%] rounded-xl p-4">
        {hasFiles && (
          <div className="mb-3 space-y-2">
            <Skeleton className="h-24 w-56" />
          </div>
        )}
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="mt-3 flex justify-center opacity-80">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      </div>
    </div>
  );
}