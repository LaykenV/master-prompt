## Subscription + Usage Gating Plan

### Goals
- Centralize subscription + weekly usage status for the authenticated user.
- Gate only at the start of user-initiated work (single send or multi-model run) so in-flight runs finish even if the cap is crossed mid-stream.
- Keep existing lightweight identity calls (`chat.getUser`) unchanged; expose a new, explicit status query for places that need plan/usage.
- Reuse this status consistently across UI surfaces (new chat page, thread page, model picker upgrade card).

### High-level architecture
- Add a public aggregator query: `usage.getSelfStatus`.
  - Returns identity, active subscription snapshot, weekly usage totals/limit, computed `canSend`.
- Add a minimal internal helper: `usage.getBudgetStatusInternal`.
  - Server-side gate for start-only checks; returns just enough to decide.
- Add start-only checks to:
  - `chat.sendMessage` (mutation)
  - `chat.startMultiModelGeneration` (action)
- Do not check usage in streaming/agent workflow steps; allow completion once started.

### Data sources (already in codebase)
- Weekly usage: `usage.getCurrentWeekForSelf` (convex/usage.ts) → returns totals and limit for current week.
- Subscription snapshot: `stripeHelpers.getMySubscription` (convex/stripeHelpers.ts) → plan status, priceId, payment info.
- Recording usage: `usage.recordEvent` is already called by the agent usageHandler; this updates weekly aggregates.

### New API surface
- `usage.getSelfStatus` (public query)
  - Inputs: none
  - Output shape:
    - `isAuthenticated: boolean`
    - `user: { _id: Id<'users'>, email?: string } | null`
    - `subscription: null | { status: string, priceId: string, cancelAtPeriodEnd: boolean, currentPeriodEndMs: number, paymentBrand?: string, paymentLast4?: string, updatedAtMs: number }`
    - `usage: { weekStartMs: number, totalCents: bigint, limitCents: bigint, remainingCents: bigint }`
    - `canSend: boolean` (computed as `totalCents < limitCents`)
  - Notes:
    - If not authenticated, return `{ isAuthenticated: false, user: null, subscription: null, usage: { ...zeros }, canSend: false }`.
    - Uses existing `getAuthUserId`, `stripeHelpers.getMySubscription`, and `usage.getCurrentWeekForSelf`.

- `usage.getBudgetStatusInternal` (internalQuery)
  - Inputs: none
  - Output shape: `{ canSend: boolean, totalCents: bigint, limitCents: bigint, remainingCents: bigint }`
  - Purpose: server-only gatekeeper used by send/start mutations/actions. Keeps start-time checks consistent without over-fetch.

### Server gating (start-only)
- Update `chat.sendMessage` (mutation):
  - First line after auth + thread access: call `ctx.runQuery(internal.usage.getBudgetStatusInternal, {})`.
  - If `!canSend`, throw `new Error("Weekly limit reached. Upgrade or try again next week.")`.
  - Proceed as-is otherwise.

- Update `chat.startMultiModelGeneration` (action):
  - After auth + thread access: same internal query and error.
  - Proceed with workflow if allowed.

- Do NOT add checks in:
  - `generateResponseStreamingAsync`
  - Any `workflows.ts` steps (`generateModelResponse`, `generateDebateResponse`, `generateSynthesisResponse`)  
  Rationale: once a run starts, let it complete even if remaining budget crosses zero mid-flight.

### Frontend integration
- Surfaces: `app/chat/page.tsx` and `app/chat/[threadId]/page.tsx`.
  - Fetch `api.usage.getSelfStatus` alongside existing queries.
  - Disable sending when:
    - `!selfStatus?.isAuthenticated` or `!selfStatus?.canSend`.
  - On submit handlers, early-return with a toast if disabled (server will still be authoritative).
  - Show a small banner above the input when disabled: “Weekly limit reached. Upgrade to continue.” with a link/button.

- `components/ModelPicker.tsx` (Upgrade card):
  - Switch from `usage.getCurrentWeekForSelf` to `usage.getSelfStatus` to compute remaining percentage and render the same Upgrade UI.
  - Keep upgrade flow via `stripeActions.createCheckoutSession`.

- Optional convenience: a `useSelfStatus()` hook to wrap `useQuery(api.usage.getSelfStatus)` with derived helpers (`percentRemaining`, `isOverLimit`).

### UX details
- When `canSend === false`:
  - Disable the `MessageInput` and show the upgrade banner.
  - Keep model selection available (users can browse/plan), but block submits.
- When user has a tiny remaining balance (e.g., 1c):
  - They can still start a run; once started, it will finish even if it pushes them over.
  - After the run completes and usage posts, subsequent sends are blocked both UI-side and server-side.

### Edge cases and consistency
- Race at start: If two sends start simultaneously with tiny remaining budget, the server gate decides; one may pass, the other may be blocked.
- Remaining can go negative briefly after completion due to start-only policy; this is acceptable and will be reflected by subsequent `getSelfStatus` calls.
- File uploads: do not gate uploads; gate the send/start operations only. If desired later, add soft UI nudges (not blocking) before large uploads when close to limit.

### Implementation checklist (no code here; references only)
1) Backend
   - Add `usage.getSelfStatus` (convex/usage.ts).
   - Add `usage.getBudgetStatusInternal` (convex/usage.ts).
   - Update `chat.sendMessage` and `chat.startMultiModelGeneration` to call the internal gate and error when over limit.

2) Frontend
   - New Chat (`app/chat/page.tsx`): fetch `getSelfStatus`; disable `MessageInput` and show banner when over limit.
   - Thread page (`app/chat/[threadId]/page.tsx`): same as above.
   - Model picker (`components/ModelPicker.tsx`): replace usage source with `getSelfStatus` for the Upgrade card’s percentage.
   - Optional: create `hooks/use-self-status.ts` to centralize status consumption (derive `percentRemaining`, etc.).

3) Errors & toasts
   - Server error text for gating: “Weekly limit reached. Upgrade or try again next week.”
   - Client catches and shows toast; ensure the disabled state reflects `getSelfStatus`.

4) QA & tests
   - Start a run with small remaining; verify completion and subsequent blocking.
   - Verify multi-model start is blocked when over limit; confirm no workflow artifacts created.
   - Verify re-up (`usage.reUpCurrentWeekForSelf`) resets totals and reenables sending.
   - Ensure upgrade flow updates subscription, then status flips to enabled.

### Data shapes to rely on (summaries)
- Weekly usage (existing): `{ weekStartMs, totalCents: bigint, limitCents: bigint, promptTokens, completionTokens, reasoningTokens, requests }`
- Subscription (existing): `{ status, priceId, currentPeriodStartMs, currentPeriodEndMs, cancelAtPeriodEnd, paymentBrand?, paymentLast4?, updatedAtMs }`
- Self status (new): combines the above and adds `canSend` and `remainingCents`.

### Rollout order
1) Ship backend queries and start-only gating.
2) Wire `getSelfStatus` into UI, keep old usage reads temporarily until confirmed.
3) Switch ModelPicker Upgrade card to `getSelfStatus`.
4) Remove any redundant usage calls if present.

### Future considerations
- If abuse emerges (starting giant runs at 1c), add an optional “minimum remaining to start” policy (e.g., require ≥ N cents) while still allowing in-flight completion.
- Consider exposing estimated cost previews per model in UI (not blocking) to inform users before starting multi-model runs.
- Add analytics for gating rejections to understand upgrade conversion.


