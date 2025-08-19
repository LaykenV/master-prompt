# File Upload Documentation

## Overview

This document describes the file upload and display functionality implemented in the Master Prompt chat application. The system allows users to attach files to their messages, which are then stored using Convex Agent's file storage system and displayed appropriately in the chat interface.

## Architecture

The file upload system consists of three main components:

1. **Backend File Storage** (`convex/chat.ts`)
2. **Frontend File Display** (`components/MessageBubble.tsx`, `components/file-preview.tsx`)
3. **Message Integration** (Convex Agent message system)

## Implementation Details

### 1. Backend: File Upload Action

**Location:** `convex/chat.ts`

```typescript
export const uploadFile = action({
    args: {
        fileData: v.bytes(),
        fileName: v.string(),
        mimeType: v.string(),
        sha256: v.optional(v.string()),
    },
    returns: v.object({
        fileId: v.string(),
        url: v.string(),
        storageId: v.string(),
    }),
    handler: async (ctx, { fileData, fileName, mimeType, sha256 }) => {
        // Authentication check
        const userId = await getAuthUserId(ctx);
        if (!userId) throw new Error("Not authenticated");
        
        // Convert ArrayBuffer to Blob and store using Convex Agent
        const blob = new Blob([fileData], { type: mimeType });
        const { file } = await storeFile(
            ctx,
            components.agent,
            blob,
            fileName,
            sha256
        );
        
        return {
            fileId: file.fileId,
            url: file.url,
            storageId: file.storageId,
        };
    },
});
```

**Key Features:**
- Uses `v.bytes()` validator for file data (maps to `ArrayBuffer`)
- Leverages `storeFile` from `@convex-dev/agent` for proper file management
- Includes automatic file deduplication via SHA256 hashing
- Returns file metadata for frontend usage

### 2. Frontend: File Upload Process

**File Upload Flow:**

1. User selects files in the message input component
2. Files are converted to `ArrayBuffer` using `file.arrayBuffer()`
3. Files are uploaded via the `uploadFile` action
4. File IDs are collected and passed to the message sending function
5. Messages are saved with file references using `getFile` and `saveMessage`

**Code Example:**
```typescript
// Upload files and get fileIds
let fileIds: string[] = [];
if (files && files.length > 0) {
  const uploadPromises = files.map(async (file) => {
    const fileData = await file.arrayBuffer();
    const result = await uploadFile({
      fileData,
      fileName: file.name,
      mimeType: file.type,
    });
    return result.fileId;
  });
  fileIds = await Promise.all(uploadPromises);
}
```

### 3. Message Storage with Files

When sending messages with files, the system:

1. Retrieves file parts using `getFile(ctx, components.agent, fileId)`
2. Constructs message content array with both file and text parts
3. Saves the message with file tracking metadata

**Code Example:**
```typescript
if (fileIds && fileIds.length > 0) {
    const messageContent = [];
    
    // Add file content
    for (const fileId of fileIds) {
        const { filePart, imagePart } = await getFile(ctx, components.agent, fileId);
        messageContent.push(imagePart ?? filePart);
    }
    
    // Add text content
    if (prompt.trim()) {
        messageContent.push({ type: "text" as const, text: prompt });
    }
    
    const { messageId } = await saveMessage(ctx, components.agent, {
        threadId,
        userId,
        message: {
            role: "user",
            content: messageContent,
        },
        metadata: { fileIds }, // Track file usage
    });
}
```

### 4. Frontend: File Display

**Component:** `components/MessageBubble.tsx`

The `MessageBubble` component has been enhanced to handle file attachments:

```typescript
// Extract text and non-text parts
const textParts = message.parts.filter(part => part.type === "text");
const fileParts = message.parts.filter(part => part.type === "file");
const hasFiles = fileParts.length > 0;

// Render file attachments
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
          isUserMessage={message.role === "user"}
        />
      );
    })}
  </div>
)}
```

**Component:** `components/file-preview.tsx`

The `FilePreview` component handles both local files (during upload) and uploaded files (in messages):

```typescript
interface FilePreviewProps {
  file?: File          // For local files during upload
  url?: string         // For uploaded files in messages
  fileName?: string    // File name
  mimeType?: string    // MIME type
  isUserMessage?: boolean // Styling context
  onRemove?: () => void   // Remove handler for local files
}
```

**File Type Handling:**
- **Images:** Full-size display with rounded corners and shadow
- **Other Files:** Icon display with filename, MIME type, and download link

## File Type Support

### Images
- **Supported formats:** All image MIME types (image/*)
- **Display:** Full image preview with maximum height of 256px
- **Features:** Lazy loading, responsive sizing, filename caption

### Other Files
- **Supported formats:** All file types
- **Display:** File icon with metadata
- **Features:** Download link, MIME type display, filename truncation

## Error Handling

The system includes several error handling mechanisms:

1. **Authentication:** All file uploads require user authentication
2. **File Validation:** MIME type and filename validation
3. **Storage Errors:** Graceful handling of storage failures
4. **Type Safety:** TypeScript type assertions for file parts

## Performance Considerations

### File Storage
- **Deduplication:** Files with the same SHA256 hash are automatically deduplicated
- **Reference Counting:** Files are tracked by usage and can be cleaned up when no longer referenced
- **Blob Storage:** Uses Convex's efficient blob storage system

### Frontend Optimization
- **Lazy Loading:** Images use lazy loading for better performance
- **Responsive Images:** Images are sized responsively within containers
- **Efficient Rendering:** File parts are separated from text for optimized rendering

## Usage Examples

### Basic File Upload

```typescript
// 1. User selects file
const file = event.target.files[0];

// 2. Upload file
const fileData = await file.arrayBuffer();
const result = await uploadFile({
  fileData,
  fileName: file.name,
  mimeType: file.type,
});

// 3. Send message with file
await sendMessage({
  threadId,
  prompt: "Check out this file!",
  fileIds: [result.fileId],
});
```

### Multi-File Upload

```typescript
// Upload multiple files
const uploadPromises = files.map(async (file) => {
  const fileData = await file.arrayBuffer();
  const result = await uploadFile({
    fileData,
    fileName: file.name,
    mimeType: file.type,
  });
  return result.fileId;
});

const fileIds = await Promise.all(uploadPromises);

// Send message with multiple files
await sendMessage({
  threadId,
  prompt: "Here are the files you requested:",
  fileIds,
});
```

## Debugging

### Console Logging
The current implementation includes console logging for debugging:

```typescript
console.log(message);     // Full message object
console.log(part);        // Individual file parts
```

### File Part Structure
File parts in messages have the following structure:
```typescript
{
  type: "file",
  data: string,           // File URL
  filename: string,       // Original filename
  mimeType: string,       // MIME type
}
```

## Security Considerations

1. **Authentication:** All file operations require user authentication
2. **File Validation:** MIME type validation prevents malicious uploads
3. **Access Control:** Files are scoped to authenticated users
4. **Storage Security:** Uses Convex's secure blob storage

## Future Enhancements

Potential improvements for the file upload system:

1. **File Size Limits:** Implement configurable file size restrictions
2. **Progress Indicators:** Add upload progress feedback
3. **File Compression:** Automatic image compression for large files
4. **Thumbnail Generation:** Generate thumbnails for image files
5. **File Search:** Search messages by attached file types or names
6. **Batch Operations:** Bulk file operations and management

## Troubleshooting

### Common Issues

1. **File Not Displaying**
   - Check console logs for file part structure
   - Verify file URL is accessible
   - Ensure MIME type is correctly set

2. **Upload Failures**
   - Check user authentication status
   - Verify file size is within limits
   - Check network connectivity

3. **Type Errors**
   - Ensure proper type assertions for file parts
   - Verify ArrayBuffer vs Uint8Array usage
   - Check parameter types in function calls

### Debug Commands

```typescript
// Check message structure
console.log(message.parts);

// Check file part details
console.log(fileParts.map(p => ({ type: p.type, ...p })));

// Verify file upload response
console.log(await uploadFile({ fileData, fileName, mimeType }));
```

## Dependencies

The file upload system relies on:

- **@convex-dev/agent:** Core agent functionality and file storage
- **Convex:** Backend database and file storage
- **React:** Frontend component system
- **TypeScript:** Type safety and development experience
- **Framer Motion:** Animation for file preview components

## API Reference

### Actions

#### `uploadFile`
Uploads a file to Convex storage.

**Parameters:**
- `fileData: ArrayBuffer` - File content as ArrayBuffer
- `fileName: string` - Original filename
- `mimeType: string` - File MIME type
- `sha256?: string` - Optional SHA256 hash for deduplication

**Returns:**
```typescript
{
  fileId: string,    // Unique file identifier
  url: string,       // Accessible file URL
  storageId: string  // Internal storage ID
}
```

#### `sendMessage`
Sends a message with optional file attachments.

**Parameters:**
- `threadId: string` - Thread identifier
- `prompt: string` - Message text content
- `modelId?: string` - Optional AI model preference
- `fileIds?: string[]` - Array of uploaded file IDs

### Components

#### `FilePreview`
Displays file attachments in messages.

**Props:**
- `file?: File` - Local file object (for uploads)
- `url?: string` - File URL (for messages)
- `fileName?: string` - Display name
- `mimeType?: string` - MIME type for rendering
- `isUserMessage?: boolean` - Styling context
- `onRemove?: () => void` - Remove handler

#### `MessageBubble`
Enhanced message display with file support.

**Props:**
- `message: UIMessage` - Message object from Convex Agent

---

*This documentation covers the current implementation as of the latest update. For the most up-to-date information, refer to the source code and Convex Agent documentation.*
