"use client"

import React, { useEffect } from "react"
import { motion } from "framer-motion"
import { FileIcon, X, Download, Loader2 } from "lucide-react"

interface FilePreviewProps {
  file?: File
  url?: string
  fileName?: string
  mimeType?: string
  isUserMessage?: boolean
  onRemove?: () => void
  isUploading?: boolean
}

export const FilePreview = React.forwardRef<HTMLDivElement, FilePreviewProps>(
  (props, ref) => {
    // Handle uploaded files (with URL)
    if (props.url) {
      return <UploadedFilePreview {...props} ref={ref} />
    }
    
    // Handle local files during upload
    if (props.file) {
      if (props.file.type.startsWith("image/")) {
        return <ImageFilePreview {...props} ref={ref} />
      }

      if (
        props.file.type.startsWith("text/") ||
        props.file.name.endsWith(".txt") ||
        props.file.name.endsWith(".md")
      ) {
        return <TextFilePreview {...props} ref={ref} />
      }

      return <GenericFilePreview {...props} ref={ref} />
    }
    
    return null
  }
)
FilePreview.displayName = "FilePreview"

const ImageFilePreview = React.forwardRef<HTMLDivElement, FilePreviewProps>(
  ({ file, onRemove, isUploading }, ref) => {
    const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
    useEffect(() => {
      if (!file) return
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      return () => {
        URL.revokeObjectURL(url)
      }
    }, [file])
    if (!file) return null;
    
    return (
      <motion.div
        ref={ref}
        className="relative flex max-w-[200px] rounded-md border p-1.5 pr-2 text-xs"
        layout
        initial={{ opacity: 0, y: "100%" }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: "100%" }}
      >
        <div className="flex w-full items-center space-x-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {previewUrl ? (
            <img
              alt={`Attachment ${file.name}`}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-sm border bg-muted object-cover"
              src={previewUrl}
            />
          ) : (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-sm border bg-muted" />
          )}
          <span className="w-full truncate text-muted-foreground">
            {file.name}
          </span>
        </div>

        {isUploading ? (
          <div className="absolute inset-0 rounded-md bg-background/60 backdrop-blur-sm grid place-items-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {onRemove ? (
          <button
            className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border bg-background"
            type="button"
            onClick={onRemove}
            aria-label="Remove attachment"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        ) : null}
      </motion.div>
    )
  }
)
ImageFilePreview.displayName = "ImageFilePreview"

const TextFilePreview = React.forwardRef<HTMLDivElement, FilePreviewProps>(
  ({ file, onRemove, isUploading }, ref) => {
    const [preview, setPreview] = React.useState<string>("")

    useEffect(() => {
      if (!file) return;
      
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        setPreview(text.slice(0, 50) + (text.length > 50 ? "..." : ""))
      }
      reader.readAsText(file)
    }, [file])
    
    if (!file) return null;

    return (
      <motion.div
        ref={ref}
        className="relative flex max-w-[200px] rounded-md border p-1.5 pr-2 text-xs"
        layout
        initial={{ opacity: 0, y: "100%" }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: "100%" }}
      >
        <div className="flex w-full items-center space-x-2">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-sm border bg-muted p-0.5">
            <div className="h-full w-full overflow-hidden text-[6px] leading-none text-muted-foreground">
              {preview || "Loading..."}
            </div>
          </div>
          <span className="w-full truncate text-muted-foreground">
            {file.name}
          </span>
        </div>

        {isUploading ? (
          <div className="absolute inset-0 rounded-md bg-background/60 backdrop-blur-sm grid place-items-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {onRemove ? (
          <button
            className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border bg-background"
            type="button"
            onClick={onRemove}
            aria-label="Remove attachment"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        ) : null}
      </motion.div>
    )
  }
)
TextFilePreview.displayName = "TextFilePreview"

const GenericFilePreview = React.forwardRef<HTMLDivElement, FilePreviewProps>(
  ({ file, onRemove, isUploading }, ref) => {
    if (!file) return null;
    
    return (
      <motion.div
        ref={ref}
        className="relative flex max-w-[200px] rounded-md border p-1.5 pr-2 text-xs"
        layout
        initial={{ opacity: 0, y: "100%" }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: "100%" }}
      >
        <div className="flex w-full items-center space-x-2">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-sm border bg-muted">
            <FileIcon className="h-6 w-6 text-foreground" />
          </div>
          <span className="w-full truncate text-muted-foreground">
            {file.name}
          </span>
        </div>

        {isUploading ? (
          <div className="absolute inset-0 rounded-md bg-background/60 backdrop-blur-sm grid place-items-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : null}

        {onRemove ? (
          <button
            className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full border bg-background"
            type="button"
            onClick={onRemove}
            aria-label="Remove attachment"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        ) : null}
      </motion.div>
    )
  }
)
GenericFilePreview.displayName = "GenericFilePreview"

const UploadedFilePreview = React.forwardRef<HTMLDivElement, FilePreviewProps>(
  ({ url, fileName, mimeType, isUserMessage }, ref) => {
    const isImage = mimeType?.startsWith("image/")
    
    if (isImage) {
      return (
        <div ref={ref} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={fileName || "Uploaded image"}
            className="max-w-full max-h-64 rounded-lg border shadow-sm object-contain bg-muted"
            loading="lazy"
          />
          {fileName && (
            <div className="mt-1 text-xs text-muted-foreground truncate">
              {fileName}
            </div>
          )}
        </div>
      )
    }

    // Non-image files
    return (
      <div 
        ref={ref}
        className={`flex items-center space-x-3 p-3 rounded-lg border max-w-sm ${
          isUserMessage 
            ? "bg-primary/10 border-primary/20" 
            : "bg-muted/50 border-border"
        }`}
      >
        <div className="flex-shrink-0">
          <FileIcon className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">
            {fileName || "Attachment"}
          </div>
          {mimeType && (
            <div className="text-xs text-muted-foreground">
              {mimeType}
            </div>
          )}
        </div>
        <a
          href={url}
          download={fileName}
          className="flex-shrink-0 p-1 hover:bg-muted rounded transition-colors"
          aria-label="Download file"
        >
          <Download className="h-4 w-4 text-muted-foreground" />
        </a>
      </div>
    )
  }
)
UploadedFilePreview.displayName = "UploadedFilePreview"