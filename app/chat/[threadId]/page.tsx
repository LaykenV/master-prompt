"use client";

import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import React, { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { useThreadMessages, optimisticallySendMessage } from "@convex-dev/agent/react";
import { ModelPicker } from "@/components/ModelPicker";
import { ChatMessages } from "@/components/ChatMessages";
import { Button } from "@/components/ui/button";
import { MessageInput } from "@/components/message-input";
import { Users, Send } from "lucide-react";
import { ModelId } from "@/convex/agent";

export default function ThreadPage() {
  const params = useParams();

  const threadId = String((params as { threadId: string }).threadId);
  const user = useQuery(api.chat.getUser);
  const sendMessage = useMutation(api.chat.sendMessage).withOptimisticUpdate(
    optimisticallySendMessage(api.chat.listThreadMessages)
  );
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[] | null>(null);
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

  const handleSend = useCallback(async (text?: string, e?: React.FormEvent) => {
    e?.preventDefault();
    const content = (text ?? input).trim();
    if (!content || isSending || !user?._id) return;
    setIsSending(true);
    
    // Log files for now (TODO: integrate with API)
    if (files && files.length > 0) {
      console.log('Files to upload:', files);
    }
    
    try {
      if (multiModelMode && multiModelSelection.secondary.length > 0) {
        // Multi-model generation
        await startMultiModelGeneration({
          threadId,
          prompt: content,
          masterModelId: multiModelSelection.master as ModelId,
          secondaryModelIds: multiModelSelection.secondary as ModelId[],
        });
      } else {
        // Single model generation (original behavior)
        await sendMessage({ 
          threadId, 
          prompt: content,
          modelId: selectedModel as ModelId
        });
      }
      
      if (!text) {
        setInput("");
        setFiles(null);
      }
      // Reset selected model after sending (it's now persisted to thread)
      setSelectedModel(undefined);
    } finally {
      setIsSending(false);
    }
  }, [input, isSending, user?._id, threadId, sendMessage, selectedModel, multiModelMode, multiModelSelection, startMultiModelGeneration]);




  return (
    <div className="flex h-full flex-col">
      {/* Header with model picker */}
      <div className="border-b border-border bg-background p-4">
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
        <ChatMessages messages={messages} />
      </div>
      <div className="border-t border-border bg-background p-4">
        <div className="mx-auto max-w-4xl">
          <form onSubmit={(e) => handleSend(undefined, e)} className="space-y-4">
            <MessageInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              allowAttachments={true}
              files={files}
              setFiles={setFiles}
              isGenerating={isSending}
              disabled={!user}
              className="min-h-[60px]"
            />
            <div className="flex justify-end">
              <Button
                type="submit"
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
          </form>
        </div>
      </div>
    </div>
  );
}




