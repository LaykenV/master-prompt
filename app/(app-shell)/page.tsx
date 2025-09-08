"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MessageInput } from "@/components/message-input";
import { ModelId } from "@/convex/agent";
import { toast } from "sonner";
import { useSelfStatus } from "@/hooks/use-self-status";
import { AgentSquadPreview } from "@/components/AgentSquadPreview";
import AuthDialog from "@/components/AuthDialog";
import { useAuthGate } from "@/hooks/use-auth-gate";

export default function HomeChatPage() {
  const router = useRouter();
  const selfStatus = useSelfStatus();
  const availableModels = useQuery(api.chat.getAvailableModels);
  const createThread = useAction(api.chat.createThread);
  const startMultiModelGeneration = useAction(api.chat.startMultiModelGeneration);
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);
  const registerUploadedFile = useAction(api.chat.registerUploadedFile);
  const uploadFileSmall = useAction(api.chat.uploadFile);
  const sendMessageMutation = useMutation(api.chat.sendMessage);

  const { isAuthenticated, authOpen, setAuthOpen } = useAuthGate();

  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[] | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("gpt-5");
  const [isCreating, setIsCreating] = useState(false);
  const [multiModelSelection, setMultiModelSelection] = useState<{
    master: string;
    secondary: string[];
  }>({ master: "gpt-5", secondary: [] });

  // -------- Pre-upload files to minimize send-time latency --------
  const SMALL_FILE_LIMIT = 800 * 1024; // ~0.8MB safe under Convex v.bytes limits
  const uploadTasksRef = React.useRef(new Map<string, Promise<string>>());
  const completedUploadsRef = React.useRef(new Map<string, string>());
  const [uploadingMap, setUploadingMap] = React.useState<Record<string, boolean>>({});
  const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

  const ensureUploadTask = React.useCallback((file: File): Promise<string> => {
    const key = fileKey(file);
    // If this file has already been uploaded, avoid re-upload and loading states
    const completed = completedUploadsRef.current.get(key);
    if (completed) return Promise.resolve(completed);
    const existing = uploadTasksRef.current.get(key);
    if (existing) return existing;

    const task = (async () => {
      setUploadingMap((prev) => ({ ...prev, [key]: true }));
      if (file.size <= SMALL_FILE_LIMIT) {
        const fileData = await file.arrayBuffer();
        const result = await uploadFileSmall({
          fileData,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          modelId: (multiModelSelection.secondary.length > 0
            ? multiModelSelection.master
            : (selectedModel as string)) as ModelId,
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
          : (selectedModel as string)) as ModelId,
      });
      return fileId;
    })();

    uploadTasksRef.current.set(key, task);
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
        uploadTasksRef.current.delete(key);
      });
    return task;
  }, [uploadFileSmall, generateUploadUrl, registerUploadedFile, SMALL_FILE_LIMIT, multiModelSelection.master, multiModelSelection.secondary.length, selectedModel]);
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

  const handleModelChange = React.useCallback((modelId: string) => {
    setSelectedModel(modelId);
    // Only enforce for single-model mode; multi-model logic handled in onMultiModelChange
    if (multiModelSelection.secondary.length === 0 && !modelSupportsFiles(modelId)) {
      clearFilesWithToastOnce("Attachments removed: selected model does not support files.");
    }
  }, [modelSupportsFiles, multiModelSelection.secondary.length, clearFilesWithToastOnce]);

  const allSelectedModelsSupportFiles = React.useCallback((models: { master: string; secondary: string[] }) => {
    if (!modelSupportsFiles(models.master)) return false;
    for (const id of models.secondary) {
      if (!modelSupportsFiles(id)) return false;
    }
    return true;
  }, [modelSupportsFiles]);

  const handleMultiModelChange = React.useCallback((models: { master: string; secondary: string[] }) => {
    setMultiModelSelection(models);
    if (!allSelectedModelsSupportFiles(models)) {
      clearFilesWithToastOnce("Attachments removed: one or more selected models do not support files.");
    }
  }, [allSelectedModelsSupportFiles, clearFilesWithToastOnce]);

  const attachmentsEnabled = React.useMemo(() => {
    if (multiModelSelection.secondary.length > 0) {
      return allSelectedModelsSupportFiles(multiModelSelection);
    }
    const active = selectedModel;
    return modelSupportsFiles(active);
  }, [multiModelSelection, selectedModel, modelSupportsFiles, allSelectedModelsSupportFiles]);

  const getFileUploadStatus = React.useCallback((file: File) => {
    const key = fileKey(file);
    return { uploading: !!uploadingMap[key] };
  }, [uploadingMap]);

  const attachmentsProps = React.useMemo(() => {
    return {
      allowAttachments: true as const,
      attachmentsEnabled,
      files,
      setFiles,
      getFileUploadStatus,
    };
  }, [attachmentsEnabled, files, setFiles, getFileUploadStatus]);

  // Kick off uploads as soon as files are attached, but gate on auth
  React.useEffect(() => {
    if (!files || files.length === 0) return;
    if (!isAuthenticated) {
      setAuthOpen(true);
      toast.warning("Sign in to upload attachments. Please reattach after signing in.");
      setFiles(null);
      return;
    }
    for (const file of files) {
      void ensureUploadTask(file);
    }
  }, [files, ensureUploadTask, isAuthenticated, setAuthOpen]);

  const scrollToInput = React.useCallback(() => {
    try {
      const form = document.getElementById("new-chat-input-form");
      if (form) {
        form.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          const el = form.querySelector("textarea, input") as HTMLTextAreaElement | HTMLInputElement | null;
          el?.focus();
        }, 250);
      }
    } catch {}
  }, []);

  const onStart = React.useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = input.trim();
    if (!content || isCreating) return;

    // Require auth before proceeding
    if (!isAuthenticated) {
      try {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            "preAuthDraft",
            JSON.stringify({
              content,
              selectedModel,
              multiModelSelection,
              hasFiles: !!(files && files.length > 0),
            })
          );
        }
      } catch {}
      setAuthOpen(true);
      return;
    }

    // Check budget status before proceeding when authenticated
    if (!selfStatus?.canSend) {
      toast.error("Weekly limit reached. Upgrade or try again next week.");
      return;
    }
    setIsCreating(true);
    
    try {
      if (multiModelSelection.secondary.length > 0) {
        // Create thread immediately and navigate, then run uploads + generation in background
        const threadId = await createThread({ 
          initialPrompt: content,
          modelId: multiModelSelection.master as ModelId
        });
        // Stash a pending message so the thread page can render a skeleton immediately
        try {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(
              `pendingMessage:${threadId}`,
              JSON.stringify({ content, hasFiles: !!(files && files.length > 0), createdAt: Date.now() })
            );
          }
        } catch {}
        router.push(`/chat/${threadId}`);

        void (async () => {
          let fileIds: string[] = [];
          if (files && files.length > 0) {
            const uploadPromises = files.map((file) => ensureUploadTask(file));
            fileIds = await Promise.all(uploadPromises);
          }
          await startMultiModelGeneration({
            threadId,
            prompt: content,
            masterModelId: multiModelSelection.master as ModelId,
            secondaryModelIds: (multiModelSelection.secondary as ModelId[]).slice(0, 2),
            fileIds: fileIds.length > 0 ? fileIds : undefined,
          });
        })();
      } else {
        // Single model: create thread and navigate immediately; send message in background
        const threadId = await createThread({ 
          initialPrompt: content,
          modelId: selectedModel as ModelId,
        });
        // Stash a pending message so the thread page can render a skeleton immediately
        try {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(
              `pendingMessage:${threadId}`,
              JSON.stringify({ content, hasFiles: !!(files && files.length > 0), createdAt: Date.now() })
            );
          }
        } catch {}
        router.push(`/chat/${threadId}`);

        void (async () => {
          let fileIds: string[] = [];
          if (files && files.length > 0) {
            const uploadPromises = files.map((file) => ensureUploadTask(file));
            fileIds = await Promise.all(uploadPromises);
          }
          await sendMessageMutation({
            threadId,
            prompt: content,
            modelId: selectedModel as ModelId,
            fileIds: fileIds.length > 0 ? fileIds : undefined,
          });
        })();
      }
    } finally {
      setIsCreating(false);
      setInput("");
      setFiles(null);
    }
  }, [
    input,
    isCreating,
    isAuthenticated,
    selfStatus?.canSend,
    files,
    selectedModel,
    multiModelSelection,
    createThread,
    startMultiModelGeneration,
    sendMessageMutation,
    ensureUploadTask,
    router,
    setAuthOpen,
    setIsCreating,
    setInput,
    setFiles,
  ]);

  const onStartRef = React.useRef(onStart);
  React.useEffect(() => {
    onStartRef.current = onStart;
  }, [onStart]);

  // Resume pre-auth draft after sign-in
  React.useEffect(() => {
    try {
      if (!isAuthenticated) return;
      if (input.trim().length > 0) return;
      const draftRaw = typeof window !== "undefined" ? window.sessionStorage.getItem("preAuthDraft") : null;
      if (!draftRaw) return;
      const draft = JSON.parse(draftRaw);
      if (draft.selectedModel) setSelectedModel(draft.selectedModel);
      if (draft.multiModelSelection) setMultiModelSelection(draft.multiModelSelection);
      if (draft.content) setInput(draft.content);
      window.sessionStorage.removeItem("preAuthDraft");
      // Auto-send after resume
      setTimeout(() => {
        const f = onStartRef.current;
        if (f) void f();
      }, 50);
    } catch {}
  }, [isAuthenticated, input]);


  return (
    <div className="flex h-full flex-col relative">
      <div className="flex-1 overflow-auto flex items-center justify-center">
        <div className="w-full max-w-5xl sm:max-w-5xl lg:max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="max-h-[60vh] overflow-y-auto pr-1 lg:max-h-[58vh] lg:pr-2">
              <AgentSquadPreview
                models={multiModelSelection.secondary.length > 0 ? multiModelSelection : { master: selectedModel, secondary: [] }}
                availableModels={availableModels || []}
                onChooseModels={scrollToInput}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Floating weekly limit banner (overlay, does not consume layout space) */}
      {selfStatus?.isAuthenticated && selfStatus && !selfStatus.canSend && (
        <div
          className="pointer-events-none absolute inset-x-0 z-40 flex justify-center px-3"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)" }}
        >
          <div className="pointer-events-auto w-full max-w-4xl">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 backdrop-blur-md p-3 text-center shadow-md">
              <p className="text-sm text-destructive">
                Weekly limit reached. <Link href="/account/usage" className="underline font-medium">View Usage</Link> to continue.
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="p-4">
        <div className="mx-auto max-w-4xl">
          <form id="new-chat-input-form" onSubmit={onStart} className="space-y-4">
            <MessageInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Start a new chat..."
              {...attachmentsProps}
              isGenerating={isCreating}
              disabled={selfStatus?.isAuthenticated ? !selfStatus.canSend : false}
              className="min-h-[60px]"
              modelPicker={{
                selectedModel,
                onModelChange: handleModelChange,
                onMultiModelChange: handleMultiModelChange,
              }}
            />
          </form>
        </div>
      </div>
      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  );
}


