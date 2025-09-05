## Goal

Make chat the home page. Let unauthenticated users land on it, choose models, and type freely. Require sign-in only when they try to send a message or upload files. After successful auth, seamlessly replay the intended action. Keep all server-side usage/budget enforcement exactly as-is (only for authenticated users).

### High-level approach
- Keep Convex auth and usage checks unchanged. Defer authentication to the moment an action needs it (send, upload).
- Allow the UI to be fully interactive pre-auth (model selection, typing), but gate side-effects.
- Introduce an `AuthDialog` flow and a small gating helper to prompt sign-in and then replay the attempted action.

## Changes overview
- Move chat layout/page from `/chat` to `/` and update all links to point to `/` as the “New Chat” destination.
- Update `middleware.ts` so the home page `/` is always publicly accessible; keep `account/*` gated; keep thread pages gated.
- Update the chat page logic to:
  - Allow input when unauthenticated.
  - On first send or file attach/upload, trigger auth modal; after auth, replay the action.
  - Prevent pre-auth background uploads.
- Add `AuthDialog` and a `useAuthGate` helper for easy gating of actions.

## Server/middleware updates

### middleware.ts
- Remove the “redirect `/` -> `/chat` when authed` logic. The home page is now the chat page.
- Keep account pages protected. Keep thread pages protected (users should only read their own threads).

Example shape (adjust to taste):
```ts
// Pseudocode outline
const isHomePage = createRouteMatcher(["/"]);
const isProtectedRoute = createRouteMatcher([
  "/server",
  "/account",
  "/account/usage",
  "/account/subscription",
  "/account/subscription/success",
  "/chat/:threadId", // keep threads gated
]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  // No redirect for home anymore
  if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/");
  }
});
```

No schema changes needed. Usage remains tracked only for signed-in users because server functions call `getAuthUserId`.

## Client updates (new home page)

You will move `app/chat/page.tsx` to `app/page.tsx` (and integrate with your root layout). Make the following changes in the page component:

### 1) Auth state and gating helper
- Use `useConvexAuth()` to get `isAuthenticated`.
- Add an `AuthDialog` component and a small `useAuthGate` hook:
  - `ensureAuthed(): Promise<boolean>` → if not authed, open auth modal; resolve `true` on success, `false` on cancel.
  - `withAuth<T>(fn: () => Promise<T>): Promise<T | void>` → calls `ensureAuthed()` then `fn()` if authed.

### 2) Enable input for unauthenticated users
- Do not disable the message input when `!user`. Keep the weekly-limit banner and disabling only when the user is authenticated and over limit.
- Concretely, replace `disabled={!user || (selfStatus && !selfStatus.canSend)}` with `disabled={selfStatus?.isAuthenticated ? !selfStatus.canSend : false}`.

### 3) Defer auth on send (and replay)
- In `onStart`:
  - If not authenticated: open `AuthDialog`.
    - Persist draft in `sessionStorage` (e.g. `preAuthDraft`) containing: `{ content, selectedModel, multiModelSelection, hasFiles: !!files?.length }`.
    - If auth requires a full redirect, we still recover this after returning.
  - After success, immediately continue the existing send flow (create thread, then send message). Clear `preAuthDraft`.
- On mount, if `isAuthenticated` and a `preAuthDraft` exists, auto-resume or show a toast “Resume your draft?” with a button that triggers `onStart`.

### 4) Defer auth on file attach and prevent pre-auth uploads
- Today, files auto-upload in an effect:
  - Wrap the `useEffect` that starts uploads with `if (!isAuthenticated) return;` so no background uploads start pre-auth.
- On file select:
  - If unauthenticated, open `AuthDialog`. On success, keep the selected files in state and let the upload effect kick in. If the auth flow is a full redirect, the selected file objects will be lost; show a toast: “Please reattach your files after signing in.”
- Keep all existing server file validations (model fileSupport, etc.) intact.

### 5) Model selection
- Keep current model selection logic untouched (users can pick models pre-auth). No server calls are made until send/upload.

### 6) Multi-model flow
- Apply the same deferral: on multi-model send, require auth before creating the thread or starting the workflow.
- Persist the draft similarly via `preAuthDraft`.

## AuthDialog and gating helper
- Add `components/AuthDialog.tsx` that:
  - Shows provider buttons (e.g. GitHub, Google) using `useAuthActions().signIn(provider, { redirectTo: window.location.href })`.
  - Emits `onSuccess` once the user is authenticated.
  - Works as a controlled dialog used by the chat page.
- Add `hooks/use-auth-gate.ts` helper to encapsulate the logic for `ensureAuthed` and `withAuth`.

## Routing updates (moving chat to root)
1) Move `app/chat/layout.tsx` → integrate its content into your root layout or a route group as needed.
2) Move `app/chat/page.tsx` → `app/page.tsx` and preserve all logic.
3) Keep `app/chat/[threadId]/page.tsx` as-is for now (still gated). Update links to thread pages accordingly.
4) Update all links in the app:
   - Replace `href="/chat"` with `href="/"` (New Chat buttons, redirects, etc.).
   - Ensure thread links still point to `/chat/[threadId]` (unless you decide to move those too).
5) Update `middleware.ts` per the section above.

## UI/UX notes
- Show a subtle sign-in prompt on the page for unauthenticated users, but do not block typing.
- For unauthenticated users, hide the weekly-limit banner; show it only for authenticated users when applicable.
- When an unauthenticated user clicks send, the dialog should feel first-class and quick (show providers; return to same page on completion).
- If auth redirected away and back, auto-offer resuming the draft via `sessionStorage`.

## Testing checklist
- Unauthed land on `/` can:
  - Select models and type; cannot upload files until signing in; clicking send opens auth.
- After signing in from the send modal:
  - Draft resumes; thread is created; message is sent; budget enforcement and rate limits work.
- Authenticated out-of-budget users:
  - Input shows weekly limit message and disables send.
- Links:
  - New Chat points to `/` everywhere. Thread links still work. Account pages remain gated.
- File uploads:
  - Pre-auth: attaching triggers auth; no background upload happens.
  - Post-auth: files upload and attach correctly; model file support rules enforced.

## Optional follow-ups
- Add a small banner or inline CTA encouraging sign-in to attach files or save history.
- Add analytics event for “auth requested” when users attempt send/upload while unauth.
- Consider moving thread routes to `/:threadId` later if you want a fully root-based chat app (update middleware and authz accordingly).


