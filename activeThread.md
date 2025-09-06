## Plan: Show loading spinners on all generating threads (even when inactive)

### Current behavior and goal
- **Active thread spinner**: The UI determines loading state with `useThreadLoadingState(threadId, isActive)`. For performance, it only streams/fetches messages for the active thread. Inactive threads therefore don’t show a spinner unless there’s a client-side pending flag (sessionStorage from redirect).
- **Goal**: If any thread is generating (single-model or multi-model), show a spinner on that thread in the sidebar even when it is not the active thread.

### Key insight and constraint
- During both single-model and multi-model flows, there is always a corresponding “regular chat message” wait on the master chat thread. However, there can be long periods where the assistant message hasn’t started streaming yet (e.g., during multi-model initial/debate phases). Therefore relying only on per-thread message streaming for inactive threads would be heavy and fragile.
- Optimal approach: expose a small, reactive per-thread “isGenerating” signal from the backend so the sidebar can show spinners for all generating threads without querying messages for every thread.

## Proposed design

### Data model: `threadActivities` table
- Store per-thread generation activity, keyed by threadId and userId.
- Fields:
  - `threadId: v.string()`
  - `userId: v.id("users")`
  - `activeCount: v.number()` (number of in-flight generation operations)
  - `isGenerating: v.boolean()` (derived from `activeCount > 0`)
  - `updatedAt: v.number()` (epoch ms)
- Indexes:
  - `by_threadId` → `["threadId"]` (unique)
  - `by_userId_and_isGenerating` → `["userId", "isGenerating"]`

### Backend API surface
- Internal mutation helper:
  - `internal.chat.updateThreadActivity({ threadId, userId, delta })`
    - Upsert on (threadId). Update `activeCount += delta` with clamp at 0. Set `isGenerating = activeCount > 0`. Update `updatedAt = Date.now()`.
- Public query for sidebar:
  - `chat.getGeneratingThreadIds()` → returns `string[]` of current user’s threads with `isGenerating === true`.

### Where to toggle the activity flag
- Single-model flow
  - Increment (+1) when the user message is saved and generation is scheduled:
    - In `chat.sendMessage` and `chat.saveInitialMessage`, after saving the prompt (or message with files) and before/around `scheduler.runAfter(...)` for `internal.chat.generateResponseStreamingAsync`.
    - If scheduling fails, decrement (−1) immediately to avoid leakage.
  - Decrement (−1) once generation completes or errors:
    - In `internal.chat.generateResponseStreamingAsync`, place a decrement in a `finally` block so it runs on success and error.
- Multi-model workflow
  - Increment (+1) once for the master chat thread right after the master user message is saved and before starting the workflow:
    - In `chat.startMultiModelGeneration` (right after `saveMessage` of the master thread).
  - Decrement (−1) for the master chat thread once the final synthesis response is fully streamed (the point users see completion):
    - In `workflows.generateSynthesisResponse`, place a decrement in a `finally` block.
  - Do not track secondary sub-threads — only the master chat thread appears in the sidebar for the user’s chats.

### UI changes
- In `app/chat/layout.tsx`:
  - Fetch generating thread ids with `useQuery(api.chat.getGeneratingThreadIds, isAuthenticated ? {} : "skip")`.
  - Build a `Set` of generating ids.
  - For each `ThreadItem`, compute:
    - `localLoading = useThreadLoadingState(thread._id, isActive)` (unchanged; rich logic for active thread)
    - `globalLoading = generatingSet.has(thread._id)`
    - `isLoading = isActive ? (localLoading || globalLoading) : globalLoading`
  - Use `isLoading` to drive the spinner in the collapsed/expanded presentation. This shows spinners for all generating threads even when inactive, while keeping the detailed UX for the active one.
- No changes needed in `components/ui/sidebar.tsx` or `components/ChatMessages.tsx` (active-thread auto-scroll/loader logic remains intact).

## Pseudocode snippets

```ts
// convex/schema.ts
threadActivities: defineTable({
  threadId: v.string(),
  userId: v.id("users"),
  activeCount: v.number(),
  isGenerating: v.boolean(),
  updatedAt: v.number(),
})
  .index("by_threadId", ["threadId"]) // unique
  .index("by_userId_and_isGenerating", ["userId", "isGenerating"])
```

```ts
// convex/chat.ts
export const updateThreadActivity = internalMutation({
  args: { threadId: v.string(), userId: v.id("users"), delta: v.number() },
  returns: v.null(),
  handler: async (ctx, { threadId, userId, delta }) => {
    const existing = await ctx.db
      .query("threadActivities")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .unique();
    const now = Date.now();
    if (!existing) {
      const activeCount = Math.max(0, delta);
      await ctx.db.insert("threadActivities", {
        threadId,
        userId,
        activeCount,
        isGenerating: activeCount > 0,
        updatedAt: now,
      });
      return null;
    }
    const next = Math.max(0, (existing.activeCount ?? 0) + delta);
    await ctx.db.patch(existing._id, {
      activeCount: next,
      isGenerating: next > 0,
      updatedAt: now,
    });
    return null;
  },
});

export const getGeneratingThreadIds = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("threadActivities")
      .withIndex("by_userId_and_isGenerating", (q) => q.eq("userId", userId).eq("isGenerating", true))
      .collect();
    return rows.map((r) => r.threadId);
  },
});
```

```ts
// convex/chat.ts (where to increment)
// Inside sendMessage/saveInitialMessage after saving user prompt:
await ctx.runMutation(internal.chat.updateThreadActivity, { threadId, userId, delta: +1 });
await ctx.scheduler.runAfter(0, internal.chat.generateResponseStreamingAsync, { /* ... */ });

// convex/chat.ts (where to decrement)
// Inside internal.chat.generateResponseStreamingAsync finally:
finally {
  if (userId) await ctx.runMutation(internal.chat.updateThreadActivity, { threadId, userId, delta: -1 });
}
```

```ts
// convex/workflows.ts (multi-model master thread)
// In startMultiModelGeneration after saving master message and before workflow.start
await ctx.runMutation(internal.chat.updateThreadActivity, { threadId, userId, delta: +1 });

// In generateSynthesisResponse finally (after streaming synthesis)
finally {
  await ctx.runMutation(internal.chat.updateThreadActivity, { threadId: masterThreadId, userId, delta: -1 });
}
```

```tsx
// app/chat/layout.tsx
const generatingIds = useQuery(api.chat.getGeneratingThreadIds, isAuthenticated ? {} : "skip");
const generatingSet = useMemo(() => new Set(generatingIds ?? []), [generatingIds]);

// In ThreadItem render props
const localLoading = useThreadLoadingState(thread._id, isActive);
const globalLoading = generatingSet.has(thread._id);
const isLoading = isActive ? (localLoading || globalLoading) : globalLoading;

// Use isLoading to toggle the spinner (existing UI already wired for a boolean)
```

## Failure modes and safeguards
- Use `finally` for decrements so we always clear flags on success or error.
- `activeCount` prevents race conditions when multiple sends overlap on the same thread.
- Add clamp at 0 to avoid negatives if a double-decrement occurs.
- Optional self-heal: on assistant message insertions for a thread, set `activeCount = 0, isGenerating = false` if the doc exists and looks stale (e.g., old `updatedAt`). This is not strictly required but can be added if sticky flags are observed in practice.

## Testing checklist
- Single-model send: spinner appears immediately on sidebar item; disappears after assistant finishes.
- Multi-model run: spinner appears right after starting the workflow and remains visible through initial/debate, then disappears after synthesis streaming completes.
- Multiple concurrent sends in same thread: spinner stays on until the last one completes.
- Error during streaming or workflow action: spinner clears due to `finally` decrement.

## Assumptions
- Only the user’s “master chat” threads are shown in the sidebar. Secondary threads created for multi-model are not displayed there.
- “There will also be an active regular chat message waiting on it to finish” holds for multi-model runs (the master chat waits for synthesis), justifying a single activity flag per master thread.

## Files to modify
- Backend
  - `convex/schema.ts`: add `threadActivities` table and indexes.
  - `convex/chat.ts`:
    - Add `internal.chat.updateThreadActivity` mutation.
    - Add `chat.getGeneratingThreadIds` query.
    - Increment in `sendMessage` and `saveInitialMessage` after saving user message and before scheduling.
    - Decrement in `internal.chat.generateResponseStreamingAsync` in `finally`.
  - `convex/workflows.ts`:
    - Increment in `startMultiModelGeneration` after saving the master message.
    - Decrement in `generateSynthesisResponse` in `finally`.
- Frontend
  - `app/chat/layout.tsx`: fetch generating IDs and combine with `useThreadLoadingState` inside `ThreadItem` to drive `isLoading`.
  - `hooks/use-thread-loading-state.ts`: unchanged (continue to power rich active-thread UX).
  - `components/ui/sidebar.tsx`: unchanged.
  - `components/ChatMessages.tsx`: unchanged.

## Files to attach as context for implementation
- `app/chat/layout.tsx`
- `components/ui/sidebar.tsx`
- `hooks/use-thread-loading-state.ts`
- `components/ChatMessages.tsx`
- `convex/chat.ts`
- `convex/workflows.ts`
- `convex/schema.ts`

## Notes
- This approach is reactive and cheap for the sidebar (single query returning IDs), robust across single- and multi-model flows, and avoids querying messages for inactive threads.


