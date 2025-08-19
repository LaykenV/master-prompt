"use client";

import { useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { MarkdownRenderer } from "./markdown-renderer";
import { FilePreview } from "./file-preview";

interface MessageBubbleProps {
  message: UIMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [visibleText] = useSmoothText(message.content, {
    startStreaming: message.status === "streaming",
  });
  
  // Extract text and non-text parts
  console.log(message);
  const textParts = message.parts.filter(part => part.type === "text");
  const fileParts = message.parts.filter(part => part.type === "file");
  const hasFiles = fileParts.length > 0;
  
  return (
    <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
      <div 
        className={`max-w-[80%] rounded-lg p-4 transition-colors ${
          message.role === "user" 
            ? "bg-primary text-primary-foreground ml-12 hover:bg-primary/90" 
            : "bg-card border border-border mr-12 hover:bg-card/80"
        }`}
      >
        <div className="text-xs opacity-60 mb-1">
          {message.role === "user" ? "You" : "Assistant"}
        </div>
        
        {/* Render file attachments */}
        {hasFiles && (
          <div className="mb-3 space-y-2">
            {fileParts.map((part, index) => {
              console.log(part);
              // Type assertion for file parts that have these properties
              const filePart = part as { data?: string; filename?: string; mimeType?: string };
              return (
                <FilePreview
                  key={`${message.key}-file-${index}`}
                  url={filePart.data}
                  fileName={filePart.filename || ""}
                  mimeType={filePart.mimeType}
                  isUserMessage={message.role === "user"}
                />
              );
            })}
          </div>
        )}
        
        {/* Render text content */}
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
  );
}