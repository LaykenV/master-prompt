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
import { Users } from "lucide-react";
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
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);
  const registerUploadedFile = useAction(api.chat.registerUploadedFile);
  const uploadFileSmall = useAction(api.chat.uploadFile);

  // Get messages to check if streaming has started
  const messages = useThreadMessages(
    api.chat.listThreadMessages,
    { threadId },
    { initialNumItems: 10, stream: true }
  );

  // No explicit pending state; loader is derived from message list

  // Pending message from redirect (saved in sessionStorage by /chat page)
  const [pendingFromRedirect, setPendingFromRedirect] = React.useState<
    { content: string; hasFiles?: boolean; createdAt?: number } | null
  >(null);

  React.useEffect(() => {
    try {
      if (typeof window !== "undefined" && threadId) {
        const raw = window.sessionStorage.getItem(`pendingMessage:${threadId}`);
        if (raw) {
          setPendingFromRedirect(JSON.parse(raw));
        }
      }
    } catch {
      // ignore
    }
  }, [threadId]);

  // Clear pending once real messages arrive
  React.useEffect(() => {
    if (messages.results && messages.results.length > 0 && pendingFromRedirect) {
      try {
        if (typeof window !== "undefined") {
          window.sessionStorage.removeItem(`pendingMessage:${threadId}`);
        }
      } catch {}
      setPendingFromRedirect(null);
    }
  }, [messages.results, pendingFromRedirect, threadId]);

  // -------- Pre-upload files to minimize send-time latency --------
  const SMALL_FILE_LIMIT = 800 * 1024; // ~0.8MB safe under Convex v.bytes limits
  const uploadTasksRef = React.useRef(new Map<string, Promise<string>>());
  const [uploadingMap, setUploadingMap] = React.useState<Record<string, boolean>>({});

  const fileKey = React.useCallback((file: File) => `${file.name}:${file.size}:${file.lastModified}`, []);

  const ensureUploadTask = React.useCallback((file: File): Promise<string> => {
    const key = fileKey(file);
    const existing = uploadTasksRef.current.get(key);
    if (existing) return existing;

    const task = (async () => {
      // mark uploading true
      setUploadingMap((prev) => ({ ...prev, [key]: true }));
      // Use small-file path for tiny attachments; upload URLs for larger files
      if (file.size <= SMALL_FILE_LIMIT) {
        const fileData = await file.arrayBuffer();
        const result = await uploadFileSmall({
          fileData,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        });
        return result.fileId;
      }

      const postUrl = await generateUploadUrl({});
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const { storageId } = await res.json();
      const { fileId } = await registerUploadedFile({
        storageId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
      });
      return fileId;
    })();

    uploadTasksRef.current.set(key, task);
    // clear uploading indicator when done
    task.finally(() => {
      setUploadingMap((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      // optional: free the ref entry
      uploadTasksRef.current.delete(key);
    });
    return task;
  }, [fileKey, uploadFileSmall, generateUploadUrl, registerUploadedFile, SMALL_FILE_LIMIT]);

  // Kick off uploads as soon as files are attached
  React.useEffect(() => {
    if (!files || files.length === 0) return;
    for (const file of files) {
      void ensureUploadTask(file);
    }
  }, [files, ensureUploadTask]);

  const getFileUploadStatus = React.useCallback((file: File) => {
    const key = fileKey(file);
    return { uploading: !!uploadingMap[key] };
  }, [fileKey, uploadingMap]);

  const handleSend = useCallback(async (text?: string, e?: React.FormEvent) => {
    e?.preventDefault();
    const content = (text ?? input).trim();
    if (!content || isSending || !user?._id) return;
    setIsSending(true);
    
    try {
      // Ensure uploads finish (most should be pre-uploaded already)
      let fileIds: string[] = [];
      if (files && files.length > 0) {
        const uploadPromises = files.map((file) => ensureUploadTask(file));
        fileIds = await Promise.all(uploadPromises);
      }
      
      if (multiModelMode && multiModelSelection.secondary.length > 0) {
        // Multi-model generation
        await startMultiModelGeneration({
          threadId,
          prompt: content,
          masterModelId: multiModelSelection.master as ModelId,
          secondaryModelIds: multiModelSelection.secondary as ModelId[],
          fileIds: fileIds.length > 0 ? fileIds : undefined,
        });
      } else {
        // Single model generation (original behavior)
        await sendMessage({ 
          threadId, 
          prompt: content,
          modelId: selectedModel as ModelId,
          fileIds: fileIds.length > 0 ? fileIds : undefined,
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
  }, [input, isSending, user?._id, threadId, sendMessage, selectedModel, multiModelMode, multiModelSelection, startMultiModelGeneration, files, ensureUploadTask]);




  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-hidden">
        <ChatMessages messages={messages} pendingFromRedirect={pendingFromRedirect} />
      </div>
      <div className="p-4">
        <div className="mx-auto max-w-4xl">
          <form onSubmit={(e) => handleSend(undefined, e)} className="space-y-4">
            <div className="flex items-center gap-3 mb-4">
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
            <MessageInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              allowAttachments={true}
              files={files}
              setFiles={setFiles}
              getFileUploadStatus={getFileUploadStatus}
              isGenerating={isSending}
              disabled={!user}
              className="min-h-[60px]"
            />
          </form>
        </div>
      </div>
    </div>
  );
}




