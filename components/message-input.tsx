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
import { useIsMobile } from "@/hooks/use-mobile"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

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
  attachmentsEnabled?: boolean
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
  const isMobile = useIsMobile()

  // Measure bottom controls area to reserve padding in the textarea dynamically
  const bottomRef = useRef<HTMLDivElement>(null)
  const [bottomHeight, setBottomHeight] = useState<number>(0)

  useEffect(() => {
    if (!bottomRef.current) return
    const element = bottomRef.current
    const update = () => setBottomHeight(element.getBoundingClientRect().height)
    update()
    const ro = new ResizeObserver(() => update())
    ro.observe(element)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [])

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
    "text/markdown",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
  ];
  const ALLOWED_EXTENSIONS: Array<string> = [
    "pdf",
    "json",
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
      if ("attachmentsEnabled" in props && props.attachmentsEnabled === false) {
        return
      }
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
    if (props.allowAttachments !== true || ("attachmentsEnabled" in props && props.attachmentsEnabled === false)) return
    event.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = (event: React.DragEvent) => {
    if (props.allowAttachments !== true || ("attachmentsEnabled" in props && props.attachmentsEnabled === false)) return
    event.preventDefault()
    setIsDragging(false)
  }

  const onDrop = (event: React.DragEvent) => {
    setIsDragging(false)
    if (props.allowAttachments !== true || ("attachmentsEnabled" in props && props.attachmentsEnabled === false)) return
    event.preventDefault()
    const dataTransfer = event.dataTransfer
    if (dataTransfer.files.length) {
      addFiles(Array.from(dataTransfer.files))
    }
  }

  const onPaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData?.items
    if (!items) return

    const files = Array.from(items)
      .map((item) => item.getAsFile())
      .filter((file) => file !== null)

    if (props.allowAttachments && files.length > 0 && (!("attachmentsEnabled" in props) || props.attachmentsEnabled !== false)) {
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
    dependencies: [props.value, showFileList, bottomHeight],
  })

  // Extract textarea props cleanly so we can merge styles (for dynamic padding)
  const textareaExtraProps: React.TextareaHTMLAttributes<HTMLTextAreaElement> =
    props.allowAttachments
      ? (() => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { allowAttachments, files, setFiles, getFileUploadStatus, attachmentsEnabled, ...rest } = props
          return rest
        })()
      : (() => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { allowAttachments, ...rest } = props
          return rest
        })()

  // Determine how many file previews to show inline and how many to compact into a +N chip
  const previewLimit = isMobile ? 1 : 3
  const filesToShow = props.allowAttachments && props.files ? props.files.slice(0, previewLimit) : []
  const remainingFileCount = props.allowAttachments && props.files ? Math.max(0, props.files.length - filesToShow.length) : 0

  const getShortName = (name: string) => {
    const limit = 5
    if (name.length <= limit) return name
    return name.slice(0, limit) + "…"
  }

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
              // Right padding for icons, bottom padding is added dynamically via style
              "pr-3",
              className
            )}
            {...textareaExtraProps}
            style={{ ...(textareaExtraProps.style || {}), paddingBottom: bottomHeight + 16 }}
          />
        </div>
      </div>

      {/* Unified floating bottom section: model picker, inline file previews, and actions */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30">
        <div ref={bottomRef} className="pointer-events-auto border-t surface-input px-2 py-2 sm:px-3 sm:py-2">
          <div className="flex items-center gap-2">
            <div className="shrink-0">
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

            {props.allowAttachments && (
              isMobile ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="min-w-0 flex-1 overflow-hidden cursor-pointer">
                      <div className="flex items-center gap-2">
                        <AnimatePresence mode="popLayout">
                          {filesToShow?.map((file) => {
                            const uploading = props.allowAttachments && props.getFileUploadStatus ? props.getFileUploadStatus(file).uploading : false
                            return (
                              <FilePreview
                                key={file.name + String(file.lastModified)}
                                file={file}
                                isUploading={uploading}
                                compact={true}
                                hideRemove={true}
                                displayNameOverride={getShortName(file.name)}
                              />
                            )
                          })}
                        </AnimatePresence>
                        {remainingFileCount > 0 && (
                          <span
                            className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground bg-card"
                            aria-label={`Plus ${remainingFileCount} more file${remainingFileCount === 1 ? "" : "s"}`}
                          >
                            +{remainingFileCount}
                          </span>
                        )}
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[92vw] max-w-sm border-border p-2 rounded-xl surface-menu">
                    <div className="max-h-[50vh] overflow-auto pr-1 flex flex-col gap-2">
                      {props.files?.map((file) => {
                        const uploading = props.allowAttachments && props.getFileUploadStatus ? props.getFileUploadStatus(file).uploading : false
                        return (
                          <FilePreview
                            key={file.name + String(file.lastModified) + "-menu"}
                            file={file}
                            isUploading={uploading}
                            compact={false}
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
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    <AnimatePresence mode="popLayout">
                      {filesToShow?.map((file) => {
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
                            compact={false}
                          />
                        )
                      })}
                    </AnimatePresence>
                    {remainingFileCount > 0 && (
                      <span
                        className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground bg-card"
                        aria-label={`Plus ${remainingFileCount} more file${remainingFileCount === 1 ? "" : "s"}`}
                      >
                        +{remainingFileCount}
                      </span>
                    )}
                  </div>
                </div>
              )
            )}

            <div className="shrink-0 flex items-center gap-2">
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
                  disabled={("attachmentsEnabled" in props) && props.attachmentsEnabled === false}
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

