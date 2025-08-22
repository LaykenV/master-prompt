"use client";

import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { MarkdownRenderer } from "./markdown-renderer";
import { FilePreview } from "./file-preview";
import { CopyButton } from "./copy-button";

interface MessageBubbleProps {
  message: UIMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [visibleText] = useSmoothText(message.content, {
    startStreaming: message.status === "streaming",
  });
  
  // Extract text and non-text parts
  const textParts = message.parts.filter(part => part.type === "text");
  const fileParts = message.parts.filter(part => part.type === "file");
  const hasFiles = fileParts.length > 0;
  const copyContent = message.content;
  
  // Assistant: plain text, no bubble
  if (message.role === "assistant") {
    return (
      <div className="relative pb-8">
        <div className="flex justify-start">
          <div className="assistant-text w-full">
            {/* Assistant attachments (no bubble) */}
            {hasFiles && (
              <div className="mb-3 space-y-2">
                {fileParts.map((part, index) => {
                  const filePart = part as { data?: string; filename?: string; mimeType?: string };
                  return (
                    <FilePreview
                      key={`${message.key}-file-${index}`}
                      url={filePart.data}
                      fileName={filePart.filename || ""}
                      mimeType={filePart.mimeType}
                    />
                  );
                })}
              </div>
            )}
            <MarkdownRenderer>
              {visibleText}
            </MarkdownRenderer>
            {message.status === "streaming" && (
              <div className="mt-2 flex items-center gap-1">
                <div className="h-1 w-1 rounded-full bg-current animate-pulse" />
                <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.2s" }} />
                <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.4s" }} />
              </div>
            )}
          </div>
        </div>
        <div className="absolute bottom-0 left-0">
          <CopyButton content={copyContent} />
        </div>
      </div>
    );
  }

  // User bubble with subtle gradient and centered feel
  return (
    <div className="relative pb-8">
      <div className="flex justify-end">
        <div 
          className="user-bubble ml-12 max-w-[68%] rounded-lg p-3.5 transition-colors leading-relaxed tracking-[0.005em]"
        >
          {hasFiles && (
            <div className="mb-3 space-y-2">
              {fileParts.map((part, index) => {
                const filePart = part as { data?: string; filename?: string; mimeType?: string };
                return (
                  <FilePreview
                    key={`${message.key}-file-${index}`}
                    url={filePart.data}
                    fileName={filePart.filename || ""}
                    mimeType={filePart.mimeType}
                    isUserMessage
                  />
                );
              })}
            </div>
          )}

          {(textParts.length > 0 || !hasFiles) && (
            <MarkdownRenderer>
              {visibleText}
            </MarkdownRenderer>
          )}

          {message.status === "streaming" && (
            <div className="mt-2 flex items-center gap-1">
              <div className="h-1 w-1 rounded-full bg-current animate-pulse" />
              <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.2s" }} />
              <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.4s" }} />
            </div>
          )}
        </div>
      </div>
      <div className="absolute bottom-0 right-0">
        <CopyButton content={copyContent} />
      </div>
    </div>
  );
}