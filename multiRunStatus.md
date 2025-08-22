## Multi‑Model Workflow Upgrade Plan (Status‑Driven + Lazy Details)

### Objectives
- Replace full sub-thread rendering with lightweight status cards per model.
- Track per-run status that progresses through stages: initial → debate → complete (error allowed).
- Live-update UI via Convex queries only on the master run document; do not open sub-threads unless details are requested.
- Render a single “Final response” card after the debate stage finishes for all runs. The final response continues to stream into the main chat (no separate status tracking).
- Generate a narrative run summary in parallel with synthesis and store it on the run document; display it on the final card.
- “See details” opens a modal that connects to the specific sub-thread and stage message (assistant-only). If never opened, we never connect to sub-threads.

---

## 1) Data Model & Schema

### New/updated fields (convex/schema.ts)
- Add a status to each run in `allRuns`.
- Store prompt message ids per stage for precise “details” targeting.
- Add `runSummary` text on the multi-model run to display on the final card.

```typescript
// convex/schema.ts (excerpt)
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { MODEL_ID_SCHEMA } from "./agent";

const RUN_STATUS = v.union(
  v.literal("initial"), // initial generation running
  v.literal("debate"),  // debate generation running
  v.literal("complete"),
  v.literal("error"),
);

export default defineSchema({
  ...authTables,
  multiModelRuns: defineTable({
    masterMessageId: v.string(),
    masterThreadId: v.string(),
    masterModelId: MODEL_ID_SCHEMA,

    // NEW: run summary text generated after debate (in parallel to synthesis)
    runSummary: v.optional(v.string()),

    // NEW: per-run status + stage prompt ids
    allRuns: v.array(
      v.object({
        modelId: MODEL_ID_SCHEMA,
        threadId: v.string(),
        isMaster: v.boolean(),
        status: RUN_STATUS, // default: "initial"
        initialPromptMessageId: v.optional(v.string()),
        debatePromptMessageId: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
      }),
    ),
  })
    .index("by_master_message", ["masterMessageId"]) 
    .index("by_master_thread", ["masterThreadId"]),
});
```

## 2) Workflow Updates (convex/workflows.ts)

Use status mutations during the workflow to advance the UI, and add a parallel summary generation after debate.

### New mutations
- `updateRunStatus` (internalMutation)
  - args: { masterMessageId, threadId, status, promptMessageId?, errorMessage? }
  - Reads run by `masterMessageId`, finds matching entry by `threadId`, updates `status` and optional prompt id/error message, then `ctx.db.patch` the document.
- `setRunSummary` (internalMutation)
  - args: { masterMessageId, summary: v.string() }
  - Saves the narrative run summary to the run document.

### New action
- `generateRunSummary` (internalAction)
  - args: { masterThreadId, masterModelId, originalPrompt, initialResponses: Array<{ modelId, response }>, refinedResponses: Array<{ modelId, response }> }
  - Creates a concise narrative describing agreements/disagreements across models and changes after debate (see prompt guidance below).
  - Implementation tip (Context7 best practice): run on the master thread with `storageOptions: { saveMessages: "none" }` to avoid polluting the thread, then return the text.

### Status transitions
- On run creation: insert runs with `status = "initial"`.
- In `generateModelResponse` (per run):
  1) After saving the run’s initial user message: `updateRunStatus(..., status: "initial", promptMessageId: initialPromptMessageId)`.
  2) After streaming finishes: `updateRunStatus(..., status: "debate")`.
  3) On error: `updateRunStatus(..., status: "error", errorMessage)`.
- In `generateDebateResponse` (per run):
  1) After saving debate user message: `updateRunStatus(..., status: "debate", promptMessageId: debatePromptMessageId)`.
  2) After streaming finishes: `updateRunStatus(..., status: "complete")`.
  3) On error: `updateRunStatus(..., status: "error", errorMessage)`.
- After all runs have completed the debate round:
  - Run in parallel:
    - `generateSynthesisResponse` (unchanged; streams into the main chat and is already handled by UI)
    - `generateRunSummary` → then `setRunSummary({ masterMessageId, summary })`

### Summary prompt guidance
- Input: `originalPrompt`, list of initial responses by model, list of refined/debate responses by model.
- Output: short narrative indicating agreements/disagreements initially and changes after debate.
- Example instruction: “Summarize the cross-model dynamics. Identify which models agreed initially, which differed (with reasons if explicit), and how the debate changed positions. Keep it concise and factual.”

### Implementation notes (Context7: Convex Agent best practices)
- Keep `saveStreamDeltas` for initial/debate streaming.
- Actions cannot use `ctx.db`; use `ctx.runMutation` for status/summary updates from actions.
- Prefer `storageOptions: { saveMessages: "none" }` for summary generation to avoid extra messages.

---

## 3) Backend API (convex/chat.ts)

### Updates
- Extend `getMultiModelRun` and `getLatestMultiModelRunForThread` return types to include:
  - `allRuns[].status`, `allRuns[].initialPromptMessageId`, `allRuns[].debatePromptMessageId`, `allRuns[].errorMessage`
  - `runSummary`

### Optional helper query (for “details” modal)
- `getRunStepInfo`
  - args: { masterMessageId, threadId, stage: "initial" | "debate" }
  - returns: { threadId, promptMessageId }
  - Lets the client request only the thread id and exact prompt message id for the chosen stage.

### Use existing thread listing only on demand
- Keep `listSecondaryThreadMessages` for modal view. Only call it after the user clicks “See details”.
- Client filters to show assistant-only messages. If we need precision by stage, the modal can use `getRunStepInfo` and highlight the first assistant after `promptMessageId`.

---

## 4) UI/UX

### MultiResponseMessage
- Replace full sub-thread rendering with a status board:
  - Section A: Initial Response (one card per model)
    - Spinner when `status === "initial"`; checkmark when `status !== "initial"`.
    - “See details” opens modal preconfigured to show the assistant message for the initial prompt.
  - Section B: Debate Round (one card per model)
    - Render this section only when all runs have `status !== "initial"`.
    - Spinner when `status === "debate"`; checkmark when `status === "complete"`.
    - “See details” opens modal to the debate assistant message.
  - Section C: Final Response (single card)
    - Render when all runs have `status === "complete"` or `"error"`.
    - Do not track synthesis status; the final answer streams into the master chat thread as today.
    - Show `runSummary` on this card when present; show a small spinner/placeholder while it’s being generated.

- Lazy details
  - On “See details”, open a modal (Sheet/Dialog) and mount a component that calls:
    - `useThreadMessages(api.chat.listSecondaryThreadMessages, { threadId }, { initialNumItems: 10, stream: true })`
    - Filter to show only assistant messages. If provided `promptMessageId` for stage, scroll/anchor to the first assistant after that id.
  - Close modal → unmount → connection to that sub-thread is dropped.

- Visuals
  - Each card: model icon, display name, stage label (Initial / Debate), spinner or check, and “See details”.
  - Final card: “Final response” plus the `runSummary` text when ready.

### Components (new/updated)
- `RunStatusCard` (new): Small presentational card for a model run + stage.
- `FinalStatusCard` (new): Single card for the final stage showing the `runSummary` (and optionally a link to jump to the synthesized answer in chat).
- `RunDetailsModal` (new): Opens on demand, connects to sub-thread, shows assistant-only content.

---

## 5) Status Logic (UI)

- Derivations:
  - Show Debate section when `allRuns.every(r => r.status !== "initial")`.
  - Show Final card when `allRuns.every(r => r.status === "complete" || r.status === "error")`.
  - Spinner vs check:
    - Initial: spinner if `status === "initial"`, check otherwise.
    - Debate: spinner if `status === "debate"`, check if `status === "complete"`, warning/error badge if `status === "error"`.
    - Final: show a placeholder/spinner for the summary until `runSummary` is set, then render the `runSummary` text.

---

## 6) Error Handling
- Per-run errors: set `status = "error"` and `errorMessage`. UI shows error badge and allows “See details”.
- Summary error: if summary generation fails, leave `runSummary` unset and display a small error notice on the final card (optional fallback: save a short error string instead).
- Do not block other runs; the board progresses per run independently. Final card appears after all runs reach terminal states (complete or error). Synthesis can proceed even if some runs error (configurable by product choice).

---

## 7) Performance & Data Sync
- Only one live query by default: `getMultiModelRun` for the board.
- Sub-threads are only queried when a modal is open, minimizing concurrent stream connections.
- Continue using streaming and deltas for initial/debate threads; summary generation avoids saving messages using `storageOptions: { saveMessages: "none" }`.

---

## 8) Implementation Steps
1) Schema
   - Add `RUN_STATUS` and fields on `multiModelRuns` for per-run status and prompt ids; add `runSummary`.
   - Deploy; ensure queries tolerate missing fields for older docs.
2) Backend
   - Add `updateRunStatus`, `setRunSummary` internal mutations.
   - Add `generateRunSummary` internal action (no message saves; return text).
   - Wire status updates into `generateModelResponse` and `generateDebateResponse` at the described milestones.
   - After debate, run `generateSynthesisResponse` and `generateRunSummary` in parallel; on summary completion, call `setRunSummary`.
   - Extend `getMultiModelRun`/`getLatestMultiModelRunForThread` return validators.
   - (Optional) Add `getRunStepInfo` for precise modal targeting.
3) UI
   - Refactor `MultiResponseMessage` to a status board (cards + final card).
   - Add `RunDetailsModal` that mounts `useThreadMessages` only when opened.
   - Filter assistant-only, optionally anchor to first assistant after `promptMessageId`.
   - Final card shows `runSummary` when available.
4) QA
   - Manual: 2–4 model runs; verify card transitions; open/close details; check final card summary.
   - Error sims: force one model to throw to verify error badges and summary error handling.

---

## 9) Acceptance Criteria
- Board shows one card per model for Initial stage immediately after kickoff.
- Cards live-update from spinner → check when initial completes; Debate section appears only when all have left Initial.
- Debate cards live-update and then Final card appears; Final card displays `runSummary` when ready.
- No sub-thread connections are opened until the user clicks “See details”.
- “See details” shows only assistant message(s) for the chosen stage and updates live if still streaming.
- Errors display clearly per run; summary error displays clearly on the final card.

---


