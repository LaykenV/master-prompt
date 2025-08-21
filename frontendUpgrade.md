## Frontend + Backend Upgrade Plan (Streaming, File Uploads, Stability)

This plan upgrades file uploads to support large files reliably with Convex Storage and Convex Agent, fixes async Markdown rendering, and wires interrupt support. It uses Context7-sourced docs for Convex and @convex-dev/agent to ensure correctness.

### Goals
- Robust file uploads for large files (beyond `v.bytes()` limits).
- Keep Agent file tracking (ref-counting, metadata) so messages reference `fileId`s (not just raw URLs).
- Preserve current send flow (message parts, streaming, optimistic UI).
- Stabilize Markdown highlighting and wire a real interrupt hook.

### Summary of Changes
- Add a two-step upload flow using Convex Storage upload URLs and a follow-up action to register the uploaded blob with the Agent (returns `fileId`).
- Update frontend to call these two steps per file; then pass `fileIds` to existing `sendMessage`/workflows.
- Keep current `uploadFile` action as a small-file fallback (optional), but mark it deprecated.
- Fix client Markdown renderer to avoid async component pattern.
- Optionally wire interrupt (stop) for streaming.

---

## 1) Backend: File Uploads that work with Convex Agent

We’ll use Convex Storage upload URLs for the heavy lifting, then convert the `storageId` to an Agent `fileId` using `storeFile` from `@convex-dev/agent`.

- Generate short-lived upload URL in a mutation.
- Client POSTs file to that URL (any size). Response includes `{ storageId }`.
- Run an action `registerUploadedFile` that:
  - Fetches the blob with `ctx.storage.get(storageId)` (actions can read storage)
  - Calls `storeFile(ctx, components.agent, blob, filename, sha256?)`
  - Returns `{ fileId, url, storageId }`
  - Optionally deletes the temporary `storageId` to avoid duplication

References:
- Convex upload URL flow: [Generate upload URL](`https://docs.convex.dev/file-storage/upload-files`) and [Storage API](`https://docs.convex.dev/file-storage/serve-files`).
- Agent file save utility `storeFile`: [Agent Files docs](`https://docs.convex.dev/agents/files`).

### New server functions

Add to `convex/chat.ts` (or create `convex/files.ts` and import in client):

```ts
import { mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { storeFile } from "@convex-dev/agent";
import { components } from "./_generated/api";

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    // Optional: assert auth before granting upload URLs
    // const userId = await getAuthUserId(ctx);
    // if (!userId) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

export const registerUploadedFile = action({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sha256: v.optional(v.string()),
    // Optional: user-scoping/validation metadata
  },
  returns: v.object({ fileId: v.string(), url: v.string(), storageId: v.string() }),
  handler: async (ctx, { storageId, fileName, mimeType, sha256 }) => {
    const blob = await ctx.storage.get(storageId);
    if (!blob) throw new Error("Uploaded file blob not found");

    // Register with Agent so we get a durable `fileId` with ref-counting
    const { file } = await storeFile(
      ctx,
      components.agent,
      blob,
      fileName,
      sha256,
    );

    // Optional: delete the temporary upload to avoid double storage usage.
    // await ctx.storage.delete(storageId);

    return { fileId: file.fileId, url: file.url, storageId: file.storageId };
  },
});
```

Why this works:
- Upload URLs handle arbitrarily large uploads directly from the browser to Convex Storage.
- Actions can read blobs (via `ctx.storage.get`) and then use `@convex-dev/agent`’s `storeFile` to create an Agent-managed `fileId` with ref tracking.
- We keep the rest of the message flow unchanged (existing code already expects `fileIds`).

Context7 docs used:
- Upload URL mutation: “Generate Upload URL” and client POST example in [Convex File Storage](`https://docs.convex.dev/file-storage/upload-files`).
- Storage read in actions: `StorageActionWriter.get` in [API reference](`https://docs.convex.dev/api/modules/server`).
- Agent storeFile: [Agent Files](`https://github.com/get-convex/agent/blob/main/docs/files.mdx`).

Notes:
- If you prefer to avoid a temporary double-store, keep the delete commented in place until you validate; then enable it to free the original `storageId` once re-registered by Agent.

---

## 2) Frontend: Integrate new upload flow

Replace the direct `uploadFile` action call with 2-step upload per file:

1) Request upload URL via `generateUploadUrl()`
2) `fetch(postUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file })`
3) Parse `{ storageId }` from the response JSON
4) Call `registerUploadedFile({ storageId, fileName: file.name, mimeType: file.type })` to get `{ fileId }`
5) Collect all `fileId`s and pass to `sendMessage` or `startMultiModelGeneration`

Example drop-in helper:

```ts
import { useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useUploadFilesToAgent() {
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);
  const registerUploadedFile = useAction(api.chat.registerUploadedFile);

  return async function uploadFiles(files: File[]): Promise<string[]> {
    const fileIds: string[] = [];
    for (const file of files) {
      const postUrl = await generateUploadUrl({});
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();
      const { fileId } = await registerUploadedFile({
        storageId,
        fileName: file.name,
        mimeType: file.type,
      });
      fileIds.push(fileId);
    }
    return fileIds;
  };
}
```

Update both `app/chat/page.tsx` and `app/chat/[threadId]/page.tsx` to use `uploadFilesToAgent(files)` in place of current `uploadFile(fileData: v.bytes())` loop.

Benefits:
- Works for large files (upload goes directly to storage).
- Preserves Agent `fileId`-based message construction (current server code already uses `getFile(...fileId)` and metadata tracking).

References:
- Upload via URL (browser): [Convex docs](`https://docs.convex.dev/file-storage/upload-files`).
- Agent message with files: [Agent docs](`https://github.com/get-convex/agent/blob/main/docs/files.mdx`).

---

## 3) Keep existing `uploadFile` (optional, mark as deprecated)

Your current action:
- `uploadFile(fileData: v.bytes(), fileName, mimeType)` works for small files.
- Mark it deprecated and prefer the new upload flow; keep it only as fallback or for tests.

---

## 4) Markdown Renderer (fix async client component)

Problem: `HighlightedPre` is an `async` React component in a client file. Client components can’t be async; Suspense fallback won’t run that promise. Convert to a non-async component that loads Shiki in `useEffect` and renders a loading `<pre>` first.

Sketch:
```ts
function HighlightedPre({ children, language, ...props }: { children: string; language: string }) {
  const [tokens, setTokens] = useState<ReturnType<typeof codeToTokens>["tokens"] | null>(null);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { codeToTokens, bundledLanguages } = await import("shiki");
      if (!(language in bundledLanguages)) return; 
      const result = await codeToTokens(children, { lang: language as any, defaultColor: false, themes: { light: "github-light", dark: "github-dark" } });
      if (mounted) setTokens(result.tokens);
    })();
    return () => { mounted = false; };
  }, [children, language]);
  if (!tokens) return <pre {...props}>{children}</pre>;
  return (
    <pre {...props}><code>{tokens.map((line, li) => (<span key={li}>{line.map((t, ti) => (<span key={ti} style={typeof t.htmlStyle === "string" ? undefined : t.htmlStyle as any}>{t.content}</span>))}{li !== tokens.length - 1 && "\n"}</span>))}</code></pre>
  );
}
```

---

## 5) Interrupt support (optional but recommended)

Today, `MessageInput` supports `stop` + Enter-to-interrupt but the pages don’t pass a `stop` handler nor track real streaming. Options:
- Expose a cancel token from your streaming action (`generateResponseStreamingAsync`) using a per-thread cancel flag, or a “stop” mutation that flips a server-side flag checked during streaming save (if your stream loop is cooperative). Then pass `stop` to `MessageInput`.
- Alternatively, buffer streams client-side and stop consuming on interrupt; server keeps streaming but UI stops.

Reference: streaming deltas API and `syncStreams` in [Agent messages](`https://github.com/get-convex/agent/blob/main/docs/messages.mdx`).

---

## 6) Other stability improvements

- Revoke object URLs in `FilePreview` when unmounted to prevent leaks.
- Add basic client-side file validation (size/type) before upload.
- Add error toasts/logging around upload + send flows.
- Remove `console.log` from `MessageBubble`.
- Keys: ensure mapped token elements have keys (see Markdown fix above).

---

## 7) End-to-end flow after upgrade

1) User selects files; client validates and for each file:
   - `postUrl = await generateUploadUrl()`
   - `fetch(postUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file })`
   - `{ storageId } = await res.json()`
   - `{ fileId } = await registerUploadedFile({ storageId, fileName, mimeType })`
2) Client calls `sendMessage({ threadId, prompt, fileIds, modelId? })` (unchanged)
3) Server uses `getFile` to embed file parts and streams assistant reply
4) UI displays files via `MessageBubble` and streams text with `useSmoothText`

---

## 8) Testing Checklist

- Upload a large image (>5MB) end-to-end.
- Multi-file upload (images + text) attached to one message.
- New chat with initial prompt + files.
- Thread page send with files and without files.
- Verify file previews (image vs non-image) and downloads.
- Verify files appear in Convex dashboard and that temporary upload cleanup works if enabled.

---

## 9) References (Context7)

- Convex Storage – Upload files via upload URLs: `https://docs.convex.dev/file-storage/upload-files`
- Storage API (serve/get/store/delete): `https://docs.convex.dev/file-storage/serve-files`
- Convex Agent – Files: `https://github.com/get-convex/agent/blob/main/docs/files.mdx`
- List/stream messages (`vStreamArgs`, `syncStreams`): `https://github.com/get-convex/agent/blob/main/docs/messages.mdx`


