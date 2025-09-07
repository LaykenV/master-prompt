"use client";

import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import React, { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useThreadMessages, optimisticallySendMessage, toUIMessages } from "@convex-dev/agent/react";
import { ChatMessages, type ChatMessagesHandle } from "@/components/ChatMessages";
import { MessageInput } from "@/components/message-input";
import { ModelId } from "@/convex/agent";
import { toast } from "sonner";
import { useConvexAuth } from "convex/react";
import { useSelfStatus } from "@/hooks/use-self-status";

export default function ThreadPage() {
  const params = useParams();
  const { isAuthenticated } = useConvexAuth();
  const threadId = String((params as { threadId: string }).threadId);
  const user = useQuery(api.chat.getUser);
  const selfStatus = useSelfStatus();
  const threadModel = useQuery(api.chat.getThreadModel, isAuthenticated ? { threadId } : "skip");
  const availableModels = useQuery(api.chat.getAvailableModels);
  const sendMessage = useMutation(api.chat.sendMessage).withOptimisticUpdate(
    optimisticallySendMessage(api.chat.listThreadMessages)
  );
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[] | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>();
  const [isSending, setIsSending] = useState(false);
  const [multiModelSelection, setMultiModelSelection] = useState<{
    master: string;
    secondary: string[];
  }>({ master: "gpt-5", secondary: [] });

  const messagesRef = React.useRef<ChatMessagesHandle | null>(null);

  // Actions and mutations
  const startMultiModelGeneration = useAction(api.chat.startMultiModelGeneration);
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);
  const registerUploadedFile = useAction(api.chat.registerUploadedFile);
  const uploadFileSmall = useAction(api.chat.uploadFile);


  // Get messages to check if streaming has started
  const messages = useThreadMessages(
    api.chat.listThreadMessages,
    isAuthenticated && threadId ? { threadId } : "skip",
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
          // Dispatch custom event to notify other components
          window.dispatchEvent(new CustomEvent('pendingMessageChange', { 
            detail: { threadId } 
          }));
        }
      } catch {}
      setPendingFromRedirect(null);
    }
  }, [messages.results, pendingFromRedirect, threadId]);

  // -------- Pre-upload files to minimize send-time latency --------
  const SMALL_FILE_LIMIT = 800 * 1024; // ~0.8MB safe under Convex v.bytes limits
  const uploadTasksRef = React.useRef(new Map<string, Promise<string>>());
  const completedUploadsRef = React.useRef(new Map<string, string>());
  const [uploadingMap, setUploadingMap] = React.useState<Record<string, boolean>>({});

  const fileKey = React.useCallback((file: File) => `${file.name}:${file.size}:${file.lastModified}`, []);

  const ensureUploadTask = React.useCallback((file: File): Promise<string> => {
    const key = fileKey(file);
    // If this file has already been uploaded, return the cached id
    const completed = completedUploadsRef.current.get(key);
    if (completed) return Promise.resolve(completed);
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
          modelId: (multiModelSelection.secondary.length > 0
            ? multiModelSelection.master
            : (selectedModel || threadModel || "gpt-5")) as ModelId,
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
        modelId: (multiModelSelection.secondary.length > 0
          ? multiModelSelection.master
          : (selectedModel || threadModel || "gpt-5")) as ModelId,
      });
      return fileId;
    })();

    uploadTasksRef.current.set(key, task);
    // cache completion and clear uploading indicator when done
    task
      .then((fileId) => {
        try {
          completedUploadsRef.current.set(key, fileId);
        } catch {}
      })
      .finally(() => {
        setUploadingMap((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        // optional: free the ref entry
        uploadTasksRef.current.delete(key);
      });
    return task;
  }, [fileKey, uploadFileSmall, generateUploadUrl, registerUploadedFile, SMALL_FILE_LIMIT, selectedModel, threadModel, multiModelSelection.master, multiModelSelection.secondary.length]);
  const fileSupportById = React.useMemo(() => {
    const map = new Map<string, boolean>();
    for (const m of availableModels ?? []) map.set(m.id, m.fileSupport);
    return map;
  }, [availableModels]);

  const modelSupportsFiles = React.useCallback((modelId: string | undefined) => {
    if (!modelId) return true;
    const v = fileSupportById.get(modelId);
    return v === undefined ? true : v;
  }, [fileSupportById]);

  // Deduplicate rapid toasts when clearing attachments
  const clearToastGuardRef = React.useRef(0);

  const clearFilesWithToastOnce = React.useCallback((message: string) => {
    if (!files || files.length === 0) return;
    const now = Date.now();
    if (now - clearToastGuardRef.current > 500) {
      clearToastGuardRef.current = now;
      toast.warning(message);
    }
    setFiles(null);
  }, [files]);

  const allSelectedModelsSupportFiles = React.useCallback((models: { master: string; secondary: string[] }) => {
    if (!modelSupportsFiles(models.master)) return false;
    for (const id of models.secondary) {
      if (!modelSupportsFiles(id)) return false;
    }
    return true;
  }, [modelSupportsFiles]);

  const onModelChangeWrapped = React.useCallback((modelId: string) => {
    setSelectedModel(modelId);
    // Only enforce for single-model mode; multi-model logic handled in onMultiModelChange
    if (multiModelSelection.secondary.length === 0 && !modelSupportsFiles(modelId)) {
      clearFilesWithToastOnce("Attachments removed: selected model does not support files.");
    }
  }, [modelSupportsFiles, multiModelSelection.secondary.length, clearFilesWithToastOnce]);

  const onMultiModelChangeWrapped = React.useCallback((models: { master: string; secondary: string[] }) => {
    setMultiModelSelection(models);
    if (!allSelectedModelsSupportFiles(models)) {
      clearFilesWithToastOnce("Attachments removed: one or more selected models do not support files.");
    }
  }, [allSelectedModelsSupportFiles, clearFilesWithToastOnce]);

  const attachmentsEnabled = React.useMemo(() => {
    if (multiModelSelection.secondary.length > 0) {
      return allSelectedModelsSupportFiles(multiModelSelection);
    }
    const active = (selectedModel || threadModel);
    return modelSupportsFiles(active);
  }, [multiModelSelection, selectedModel, threadModel, modelSupportsFiles, allSelectedModelsSupportFiles]);

  const getFileUploadStatus = React.useCallback((file: File) => {
    const key = fileKey(file);
    return { uploading: !!uploadingMap[key] };
  }, [fileKey, uploadingMap]);

  const attachmentsProps = React.useMemo(() => {
    return {
      allowAttachments: true as const,
      attachmentsEnabled,
      files,
      setFiles,
      getFileUploadStatus,
    };
  }, [attachmentsEnabled, files, setFiles, getFileUploadStatus]);


  // Kick off uploads as soon as files are attached
  React.useEffect(() => {
    if (!files || files.length === 0) return;
    for (const file of files) {
      void ensureUploadTask(file);
    }
  }, [files, ensureUploadTask]);

  

  // Determine the latest user message id in this thread to drive model picker hydration logic
  const latestUserMessageId = React.useMemo(() => {
    if (!messages.results || messages.results.length === 0) return undefined;
    const ui = toUIMessages(messages.results);
    for (let i = ui.length - 1; i >= 0; i -= 1) {
      if (ui[i].role === "user") {
        return messages.results[i]?._id as string | undefined;
      }
    }
    return undefined;
  }, [messages.results]);

  const handleSend = useCallback(async (text?: string, e?: React.FormEvent) => {
    e?.preventDefault();
    const content = (text ?? input).trim();
    if (!content || isSending || !user?._id) return;

    // Check budget status before proceeding
    if (!selfStatus?.canSend) {
      toast.error("Weekly limit reached. Upgrade or try again next week.");
      return;
    }
    setIsSending(true);
    // Ensure view is pinned to bottom when sending
    try { messagesRef.current?.scrollToBottomNow(); } catch {}
    
    try {
      // Ensure uploads finish (most should be pre-uploaded already)
      let fileIds: string[] = [];
      if (files && files.length > 0) {
        const uploadPromises = files.map((file) => ensureUploadTask(file));
        fileIds = await Promise.all(uploadPromises);
      }
      
      if (multiModelSelection.secondary.length > 0) {
        // Multi-model generation
        await startMultiModelGeneration({
          threadId,
          prompt: content,
          masterModelId: multiModelSelection.master as ModelId,
          secondaryModelIds: (multiModelSelection.secondary as ModelId[]).slice(0, 2),
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
  }, [input, isSending, user?._id, threadId, sendMessage, selectedModel, multiModelSelection, startMultiModelGeneration, files, ensureUploadTask, selfStatus]);




  return (
    <div className="flex h-full flex-col relative">
      <div className="flex-1 overflow-hidden">
        <ChatMessages ref={messagesRef} messages={messages} pendingFromRedirect={pendingFromRedirect} />
      </div>
      {/* Floating weekly limit banner (overlay, does not consume layout space) */}
      {user && selfStatus && !selfStatus.canSend && (
        <div
          className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-3"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)" }}
        >
          <div className="pointer-events-auto w-full max-w-4xl">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 backdrop-blur-md p-3 text-center shadow-md">
              <p className="text-sm text-destructive">
                Weekly limit reached. {selfStatus.subscription ? (
                  <Link href={`/account/usage?returnChat=${threadId}`} className="underline font-medium">View Usage</Link>
                ) : (
                  <Link href={`/account/subscription?returnChat=${threadId}`} className="underline font-medium text-destructive">
                    Upgrade
                  </Link>
                )} to continue.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="p-4">
        <div className="mx-auto max-w-4xl">
          <form onSubmit={(e) => handleSend(undefined, e)} className="space-y-4">
            <MessageInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              {...attachmentsProps}
              isGenerating={isSending}
              disabled={!user || (selfStatus && !selfStatus.canSend)}
              className="min-h-[60px]"
              modelPicker={{
                threadId,
                selectedModel,
                onModelChange: onModelChangeWrapped,
                onMultiModelChange: onMultiModelChangeWrapped,
                latestUserMessageId,
              }}
            />
          </form>
        </div>
      </div>
    </div>
  );
}




