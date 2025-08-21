"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ModelPicker } from "@/components/ModelPicker";
import { Button } from "@/components/ui/button";
import { MessageInput } from "@/components/message-input";
import { Users } from "lucide-react";
import { ModelId } from "@/convex/agent";

export default function NewChatPage() {
  const router = useRouter();
  const user = useQuery(api.chat.getUser);
  const createThread = useAction(api.chat.createThread);
  const startMultiModelGeneration = useAction(api.chat.startMultiModelGeneration);
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);
  const registerUploadedFile = useAction(api.chat.registerUploadedFile);
  const uploadFileSmall = useAction(api.chat.uploadFile);
  const sendMessageMutation = useMutation(api.chat.sendMessage);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[] | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("gpt-4o-mini");
  const [isCreating, setIsCreating] = useState(false);
  const [multiModelMode, setMultiModelMode] = useState(false);
  const [multiModelSelection, setMultiModelSelection] = useState<{
    master: string;
    secondary: string[];
  }>({ master: "gpt-4o-mini", secondary: [] });

  // -------- Pre-upload files to minimize send-time latency --------
  const SMALL_FILE_LIMIT = 800 * 1024; // ~0.8MB safe under Convex v.bytes limits
  const uploadTasksRef = React.useRef(new Map<string, Promise<string>>());
  const [uploadingMap, setUploadingMap] = React.useState<Record<string, boolean>>({});
  const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

  const ensureUploadTask = React.useCallback((file: File): Promise<string> => {
    const key = fileKey(file);
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
    task.finally(() => {
      setUploadingMap((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      uploadTasksRef.current.delete(key);
    });
    return task;
  }, [uploadFileSmall, generateUploadUrl, registerUploadedFile, SMALL_FILE_LIMIT]);

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
  }, [uploadingMap]);

  const onStart = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = input.trim();
    if (!content || isCreating || !user?._id) return;
    setIsCreating(true);
    
    try {
      if (multiModelMode && multiModelSelection.secondary.length > 0) {
        // Create thread immediately and navigate, then run uploads + generation in background
        const threadId = await createThread({ 
          title: content.slice(0, 80),
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
            secondaryModelIds: multiModelSelection.secondary as ModelId[],
            fileIds: fileIds.length > 0 ? fileIds : undefined,
          });
        })();
      } else {
        // Single model: create thread and navigate immediately; send message in background
        const threadId = await createThread({ 
          title: content.slice(0, 80),
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
  };



  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Welcome to Master Prompt</h1>
          <p className="text-muted-foreground">
            Start a conversation with our AI assistant. Ask questions, get help, or just chat.
          </p>
        </div>

        {!user && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-center">
            <p className="text-sm text-destructive">
              Please sign in to start a new chat.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {/* Multi-Model Toggle and Model Selector */}
          <div className="flex items-center justify-center gap-4">
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
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              multiModelMode={multiModelMode}
              onMultiModelChange={setMultiModelSelection}
            />
          </div>

          <form onSubmit={onStart} className="space-y-4">
            <MessageInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Start a new chat..."
              allowAttachments={true}
              files={files}
              setFiles={setFiles}
              getFileUploadStatus={getFileUploadStatus}
              isGenerating={isCreating}
              disabled={!user}
              className="min-h-[60px]"
            />
          </form>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-card/80">
            <h3 className="font-semibold mb-2 text-card-foreground">💡 Ask anything</h3>
            <p className="text-muted-foreground">Get help with code, writing, research, or creative projects.</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-card/80">
            <h3 className="font-semibold mb-2 text-card-foreground">🚀 Get started quickly</h3>
            <p className="text-muted-foreground">Simple conversations that adapt to your needs and context.</p>
          </div>
        </div>
      </div>
    </div>
  );
}



