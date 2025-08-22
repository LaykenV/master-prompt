"use client"

import React, { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUp, Paperclip, Square } from "lucide-react"


import { cn } from "@/lib/utils"
import { useAutosizeTextArea } from "@/hooks/use-autosize-textarea"
import { Button } from "@/components/ui/button"
import { FilePreview } from "@/components/file-preview"
import { InterruptPrompt } from "@/components/interrupt-prompt"
import { toast } from "sonner"
import { ModelPicker } from "@/components/ModelPicker"

interface MessageInputBaseProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string
  submitOnEnter?: boolean
  stop?: () => void
  isGenerating: boolean
  enableInterrupt?: boolean
}

interface MessageInputWithoutAttachmentProps extends MessageInputBaseProps {
  allowAttachments?: false
}

interface MessageInputWithAttachmentsProps extends MessageInputBaseProps {
  allowAttachments: true
  files: File[] | null
  setFiles: React.Dispatch<React.SetStateAction<File[] | null>>
  getFileUploadStatus?: (file: File) => { uploading: boolean }
}

type MessageInputProps = (
  | MessageInputWithoutAttachmentProps
  | MessageInputWithAttachmentsProps
) & {
  modelPicker?: ModelPickerBindings
}

type ModelPickerBindings = {
  threadId?: string
  selectedModel?: string
  onModelChange?: (modelId: string) => void
  onMultiModelChange?: (models: { master: string; secondary: string[] }) => void
  latestUserMessageId?: string
}

export function MessageInput({
  placeholder = "Ask AI...",
  className,
  onKeyDown: onKeyDownProp,
  submitOnEnter = true,
  stop,
  isGenerating,
  enableInterrupt = true,
  modelPicker,
  ...props
}: MessageInputProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [showInterruptPrompt, setShowInterruptPrompt] = useState(false)

  useEffect(() => {
    if (!isGenerating) {
      setShowInterruptPrompt(false)
    }
  }, [isGenerating])

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB client-side cap
  // Strict allow/deny lists to avoid wildcard matches like text/xml or image/heic
  const ALLOWED_MIME_TYPES: Array<string> = [
    "application/pdf",
    "application/json",
    "text/plain",
    "text/markdown",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
  ];
  const ALLOWED_EXTENSIONS: Array<string> = [
    "pdf",
    "json",
    "txt",
    "md",
    "markdown",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
  ];
  const BLOCKED_MIME_TYPES: Array<string> = [
    "application/xml",
    "text/xml",
    "image/heic",
    "image/heif",
  ];

  function isFileTypeAllowed(file: File): boolean {
    const type = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    const ext = name.includes(".") ? (name.split(".").pop() as string) : "";
    if (BLOCKED_MIME_TYPES.includes(type)) return false;
    if (ALLOWED_MIME_TYPES.includes(type)) return true;
    if (ext && ALLOWED_EXTENSIONS.includes(ext)) return true;
    return false;
  }

  const addFiles = (files: File[] | null) => {
    if (props.allowAttachments) {
      const incoming = files ?? []
      const validated: Array<File> = []
      for (const f of incoming) {
        const okSize = f.size <= MAX_FILE_SIZE
        const okType = isFileTypeAllowed(f)
        if (!okSize) {
          toast.error(`"${f.name}" is too large (max 25MB)`) 
          continue
        }
        if (!okType) {
          toast.error(`"${f.name}" is not a supported file type`)
          continue
        }
        validated.push(f)
      }
      props.setFiles((currentFiles) => {
        if (currentFiles === null) {
          return validated
        }

        if (files === null) {
          return currentFiles
        }

        return [...currentFiles, ...validated]
      })
    }
  }

  const onDragOver = (event: React.DragEvent) => {
    if (props.allowAttachments !== true) return
    event.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = (event: React.DragEvent) => {
    if (props.allowAttachments !== true) return
    event.preventDefault()
    setIsDragging(false)
  }

  const onDrop = (event: React.DragEvent) => {
    setIsDragging(false)
    if (props.allowAttachments !== true) return
    event.preventDefault()
    const dataTransfer = event.dataTransfer
    if (dataTransfer.files.length) {
      addFiles(Array.from(dataTransfer.files))
    }
  }

  const onPaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return

    const text = event.clipboardData.getData("text")
    if (text && text.length > 500 && props.allowAttachments) {
      event.preventDefault()
      const blob = new Blob([text], { type: "text/plain" })
      const file = new File([blob], "Pasted text", {
        type: "text/plain",
        lastModified: Date.now(),
      })
      addFiles([file])
      return
    }

    const files = Array.from(items)
      .map((item) => item.getAsFile())
      .filter((file) => file !== null)

    if (props.allowAttachments && files.length > 0) {
      addFiles(files)
    }
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (submitOnEnter && event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()

      if (isGenerating && stop && enableInterrupt) {
        if (showInterruptPrompt) {
          stop()
          setShowInterruptPrompt(false)
          event.currentTarget.form?.requestSubmit()
        } else if (
          props.value ||
          (props.allowAttachments && props.files?.length)
        ) {
          setShowInterruptPrompt(true)
          return
        }
      }

      event.currentTarget.form?.requestSubmit()
    }

    onKeyDownProp?.(event)
  }

  const textAreaRef = useRef<HTMLTextAreaElement>(null)

  const showFileList =
    props.allowAttachments && props.files && props.files.length > 0

  useAutosizeTextArea({
    ref: textAreaRef as React.RefObject<HTMLTextAreaElement>,
    maxHeight: 240,
    borderWidth: 1,
    dependencies: [props.value, showFileList],
  })

  return (
    <div
      className="relative flex w-full"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {enableInterrupt && (
        <InterruptPrompt
          isOpen={showInterruptPrompt}
          close={() => setShowInterruptPrompt(false)}
        />
      )}



      <div className="relative flex w-full items-center">
        <div className="relative flex-1">
          <textarea
            aria-label="Write your prompt here"
            placeholder={placeholder}
            ref={textAreaRef}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            className={cn(
              "z-10 w-full grow resize-none rounded-xl border border-input p-3 text-sm ring-offset-background transition-[border] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 surface-input",
              // extra bottom padding to accommodate floating controls and previews
              showFileList ? "pb-28 pr-3" : "pb-16 pr-3",
              className
            )}
            {...(props.allowAttachments
              ? (() => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { allowAttachments, files, setFiles, getFileUploadStatus, ...rest } = props
                  return rest
                })()
              : (() => {
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const { allowAttachments, ...rest } = props
                  return rest
                })())}
          />
          {props.allowAttachments && (
            <div className="absolute inset-x-3 bottom-12 z-20 overflow-x-scroll py-2">
              <div className="flex space-x-3">
                <AnimatePresence mode="popLayout">
                  {props.files?.map((file) => {
                    const uploading = props.allowAttachments && props.getFileUploadStatus ? props.getFileUploadStatus(file).uploading : false
                    return (
                      <FilePreview
                        key={file.name + String(file.lastModified)}
                        file={file}
                        isUploading={uploading}
                        onRemove={() => {
                          props.setFiles((files) => {
                            if (!files) return null
                            const filtered = Array.from(files).filter((f) => f !== file)
                            if (filtered.length === 0) return null
                            return filtered
                          })
                        }}
                      />
                    )
                  })}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating bottom controls */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-30 flex items-center justify-between">
        <div className="pointer-events-auto">
          {(() => {
            const bindings = (modelPicker as ModelPickerBindings | undefined)
            if (!bindings) return null
            return (
              <ModelPicker
                threadId={bindings.threadId}
                selectedModel={bindings.selectedModel}
                onModelChange={bindings.onModelChange}
                onMultiModelChange={bindings.onMultiModelChange}
                latestUserMessageId={bindings.latestUserMessageId}
              />
            )
          })()}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {props.allowAttachments && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8 cursor-pointer"
              aria-label="Attach a file"
              onClick={async () => {
                const files = await showFileUploadDialog()
                addFiles(files)
              }}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          )}
          {isGenerating && stop ? (
            <Button
              type="button"
              size="icon"
              className="h-9 w-9 btn-new-chat-compact"
              aria-label="Stop generating"
              onClick={stop}
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className={cn(
                "h-9 w-9 transition-opacity",
                "btn-new-chat-compact"
              )}
              aria-label="Send message"
              disabled={props.value === "" || isGenerating}
            >
              <ArrowUp className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {props.allowAttachments && <FileUploadOverlay isDragging={isDragging} />}


    </div>
  )
}
MessageInput.displayName = "MessageInput"

interface FileUploadOverlayProps {
  isDragging: boolean
}

function FileUploadOverlay({ isDragging }: FileUploadOverlayProps) {
  return (
    <AnimatePresence>
      {isDragging && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center space-x-2 rounded-xl border border-dashed border-border bg-background text-sm text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          aria-hidden
        >
          <Paperclip className="h-4 w-4" />
          <span>Drop your files here to attach them.</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function showFileUploadDialog() {
  const input = document.createElement("input")

  input.type = "file"
  input.multiple = true
  input.accept = "*/*"
  input.click()

  return new Promise<File[] | null>((resolve) => {
    input.onchange = (e) => {
      const files = (e.currentTarget as HTMLInputElement).files

      if (files) {
        resolve(Array.from(files))
        return
      }

      resolve(null)
    }
  })
}

