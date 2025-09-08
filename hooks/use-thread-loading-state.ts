import { api } from "@/convex/_generated/api";
import { useThreadMessages, toUIMessages } from "@convex-dev/agent/react";
import { useConvexAuth } from "convex/react";
import { useMemo, useState, useEffect } from "react";

const LOADING_TIMEOUT_MS = 350000;

/**
 * Hook to determine if a thread is currently generating/streaming messages
 * Shows loading for threads with pending redirects or if it's the active thread with pending messages
 */
export function useThreadLoadingState(threadId: string, isActive: boolean = false) {
  // Track pending message state reactively
  const [hasPendingFromRedirect, setHasPendingFromRedirect] = useState(false);
  const { isAuthenticated } = useConvexAuth();

  // Check sessionStorage for pending message and listen for storage events
  useEffect(() => {
    const checkPendingMessage = () => {
      try {
        if (typeof window !== "undefined") {
          const raw = window.sessionStorage.getItem(`pendingMessage:${threadId}`);
          setHasPendingFromRedirect(!!raw);
        }
      } catch {
        setHasPendingFromRedirect(false);
      }
    };

    // Initial check
    checkPendingMessage();

    // Listen for custom events (we'll dispatch these when sessionStorage changes)
    const handleStorageChange = (e: CustomEvent) => {
      if (e.detail?.threadId === threadId) {
        checkPendingMessage();
      }
    };

    // Listen for storage events (though sessionStorage doesn't trigger these across same origin)
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === `pendingMessage:${threadId}`) {
        checkPendingMessage();
      }
    };

    window.addEventListener('pendingMessageChange', handleStorageChange as EventListener);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener('pendingMessageChange', handleStorageChange as EventListener);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [threadId]);

  // Only get thread messages for the active thread to avoid too many queries
  const messages = useThreadMessages(
    api.chat.listThreadMessages,
    isAuthenticated && isActive ? { threadId } : "skip",
    { initialNumItems: 10, stream: true }
  );

  const baseIsLoading = useMemo(() => {
    // If there's a pending message from redirect, always show loading
    if (hasPendingFromRedirect) return true;

    // Only check detailed streaming state for active thread
    if (!isActive) return false;

    // If messages are still loading, consider it as loading
    if (messages.isLoading) return true;

    // If no messages yet, not loading
    if (!messages.results || messages.results.length === 0) return false;

    const uiMessages = toUIMessages(messages.results);
    
    // Check if any message is currently streaming
    const isStreaming = uiMessages.some(m => m.status === "streaming");
    if (isStreaming) return true;

    // Check if there should be a pending assistant response
    // (latest message is from user with no assistant response after it)
    const lastUserIndex = (() => {
      for (let i = uiMessages.length - 1; i >= 0; i -= 1) {
        if (uiMessages[i].role === "user") return i;
      }
      return -1;
    })();
    
    const hasAssistantAfterLastUser = lastUserIndex !== -1 && 
      uiMessages.some((m, idx) => idx > lastUserIndex && m.role === "assistant");
    
    const isAssistantStreaming = uiMessages.some(m => m.role === "assistant" && m.status === "streaming");
    
    const shouldShowPendingAssistant = lastUserIndex !== -1 && 
      !hasAssistantAfterLastUser && 
      !isAssistantStreaming;

    return shouldShowPendingAssistant;
  }, [messages.isLoading, messages.results, hasPendingFromRedirect, isActive]);

  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    let timeoutId: number | null = null;
    if (baseIsLoading) {
      setTimedOut(false);
      timeoutId = window.setTimeout(() => {
        setTimedOut(true);
        // Best-effort: clear any stuck pending redirect flag
        try {
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem(`pendingMessage:${threadId}`);
            window.dispatchEvent(
              new CustomEvent("pendingMessageChange", { detail: { threadId } })
            );
          }
        } catch {}
      }, LOADING_TIMEOUT_MS);
    } else {
      setTimedOut(false);
    }
    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [baseIsLoading, threadId]);

  return baseIsLoading && !timedOut;
}
