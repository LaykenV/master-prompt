## Multi-Model Response Viewer Upgrade Plan

Objective: Improve performance and UX of `MultiResponseMessage` and nested `ModelResponseCard` by reducing concurrent streams, scaling to many models, and adding resilient loading behaviors.

### Current issues
- Each run opens a live stream concurrently (N streams) when “All Responses” is visible; this doesn’t scale.
- Only the first 3 runs get tab triggers; others are only accessible in the “All” pane.
- Brief label flicker while `availableModels` loads; raw IDs appear.
- No pagination/virtualization for long sub-threads.

### Plan
1) Lazy mount and stream only the active tab
   - Control Tabs with local state `activeTab` (default: "all").
   - Render and stream only the content for `activeTab`. If `activeTab === "all"`, render the “All” grid; otherwise render only the selected model’s thread.
   - Do not mount other `TabsContent` panels until they are active.

2) Limit load in “All Responses”
   - Use a small `initialNumItems` (e.g., 3–5) for each `ModelResponseCard` under “All” to prevent heavy data pulls.
   - Consider `stream: false` in “All” to avoid N live streams. Clicking into an individual tab then mounts with `{ stream: true }`.
   - Optionally lazy-load each card on scroll-in with IntersectionObserver.

3) Tab overflow handling
   - Render triggers for all runs using a scrollable `TabsList` or add a “More…” overflow (Dropdown/Sheet) to select hidden runs.
   - Keep “All” as the first tab for the overview.

4) Model lookup and loading states
   - Memoize a map for O(1) lookups:
     ```ts
     const modelById = useMemo(() => new Map((availableModels ?? []).map(m => [m.id, m])), [availableModels]);
     const modelInfo = modelById.get(run.modelId);
     ```
   - While `availableModels` is undefined, show a small skeleton in tab triggers instead of raw IDs.

5) Pagination/virtualization for sub-threads
   - Keep `initialNumItems` low and add a “Load more” button per `ModelResponseCard` (if your query supports pagination props).
   - If threads can get long, consider virtualization inside each card’s scroll area.

6) Minor UX/stability
   - Add error and empty states per card (if `messages.error` or no assistant after last user).
   - Keep existing pending assistant bubble; it’s consistent with the main chat.

### Code sketches

Control active tab and mount only what’s needed:
```tsx
const [activeTab, setActiveTab] = useState<string>("all");

<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
  <TabsList className="grid w-full grid-cols-4 overflow-x-auto">
    <TabsTrigger value="all">All Responses</TabsTrigger>
    {multiModelRun.allRuns.map((run) => (
      <TabsTrigger key={run.threadId} value={run.threadId}>
        {modelById.get(run.modelId)?.displayName ?? run.modelId}
        {run.isMaster && " (Master)"}
      </TabsTrigger>
    ))}
  </TabsList>

  {/* Only render the content for the active tab */}
  {activeTab === "all" ? (
    <TabsContent value="all" className="mt-4">
      <div className="grid gap-4">
        {multiModelRun.allRuns.map((run) => (
          <ModelResponseCard
            key={run.threadId}
            threadId={run.threadId}
            modelId={run.modelId}
            modelInfo={modelById.get(run.modelId)}
            isMaster={run.isMaster}
            // Limit load under "All": no stream, small page size
            stream={false}
            initialNumItems={4}
          />
        ))}
      </div>
    </TabsContent>
  ) : (
    <TabsContent value={activeTab} className="mt-4">
      {(() => {
        const run = multiModelRun.allRuns.find(r => r.threadId === activeTab);
        if (!run) return null;
        return (
          <ModelResponseCard
            threadId={run.threadId}
            modelId={run.modelId}
            modelInfo={modelById.get(run.modelId)}
            isMaster={run.isMaster}
            // Focused view: stream live and allow more items
            stream={true}
            initialNumItems={10}
          />
        );
      })()}
    </TabsContent>
  )}
</Tabs>
```

Update `ModelResponseCard` to accept `stream` and `initialNumItems`:
```tsx
function ModelResponseCard({ threadId, modelId, modelInfo, isMaster, stream, initialNumItems }: {
  threadId: string;
  modelId: string;
  modelInfo?: { displayName: string; provider: string };
  isMaster: boolean;
  stream: boolean;
  initialNumItems: number;
}) {
  const messages = useThreadMessages(
    api.chat.listSecondaryThreadMessages,
    { threadId },
    { initialNumItems, stream }
  );
  // ...unchanged rendering
}
```

### Security note
`listSecondaryThreadMessages` intentionally skips auth for temporary secondary threads. Ensure users only see threads linked from `multiModelRun` results; don’t accept arbitrary `threadId`s from the client.

### Testing
- Many-model runs (10+): ensure only one stream is active when not on “All”.
- “All Responses” shows limited items and no live streaming; switching to a model tab starts streaming.
- Tab overflow: confirm you can access all runs.
- Long sub-threads: pagination or virtualization behaves correctly.


