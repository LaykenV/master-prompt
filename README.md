# Mesh Mind

Mesh Mind is a multi‑model chat and research interface built with Next.js and Convex. It lets you:

- Coordinate multiple AI models in a single conversation
- Run a two‑round “research + debate” process across models
- Synthesize a final, concise answer from all model viewpoints
- Attach files (PDFs, JSON, Markdown, images) to ground answers
- Stream responses live with optimistic UI and per‑thread activity indicators
- Track usage and weekly limits with a lightweight subscription model

Mesh Mind is designed to be read and learned from. The codebase shows how to compose Convex, modern React 19 patterns, and the `@convex-dev/*` ecosystem to build an opinionated, real‑time AI product.


## Highlights

- **Multi‑model runs with debate**: Pick a master model and up to two secondary models. The system:
  - Generates initial answers in parallel
  - Runs a debate round where each model revises based on peers
  - Produces a final synthesis that blends the strongest arguments
- **Live streaming**: Messages stream line‑by‑line using Convex Agent stream deltas for responsive UI.
- **File‑aware prompts**: Drag‑and‑drop or paste files; small files upload directly, large files via signed URLs.
- **Usage and plans**: Server‑side accounting of tokens and costs per model, weekly budget limits, and optional re‑ups for paid plans.
- **Great UX**: Sidebar with recent threads, mobile‑first message input, model picker with drag‑and‑drop, and animated beams to visualize flow.


## How it works

### Frontend (Next.js App Router)
- `app/(app-shell)/page.tsx` – New chat landing with the model squad preview and message input. Kickstarts a thread and navigates immediately for a fast feel.
- `app/(app-shell)/chat/[threadId]/page.tsx` – Thread view. Streams messages in real time, supports file attachments, and allows switching between single‑ and multi‑model runs.
- `components/ChatLayout.tsx` – Shell with sidebar, auth controls, and global toasts.
- `components/ChatMessages.tsx` – Virtualized message list with pending skeletons and multi‑response injection.
- `components/ModelPicker.tsx` – Drag‑and‑drop model selector: choose a master and up to two secondaries.
- `components/AgentSquadPreview.tsx` – Visual scene for the “master + secondaries → debate → final synthesis” flow.
- `components/MessageBubble.tsx`, `components/MultiResponseMessage.tsx` – Message rendering, including per‑model status and the final structured summary table.

### Backend (Convex)
- `convex/agent.ts`
  - Defines `AVAILABLE_MODELS` (OpenAI, Anthropic, Google, xAI, and OSS examples) and pricing.
  - `createAgentWithModel(modelId)` produces an Agent instance bound to a specific provider.
  - Usage handler records tokens and estimated cost; supports “reasoning tokens” when providers report them.
- `convex/chat.ts`
  - Core chat APIs: create threads, send messages, list messages with streams, and file handling.
  - Multi‑model orchestration entrypoint: `startMultiModelGeneration` saves the user message, spins up a workflow, and tracks per‑thread activity for loading indicators.
  - Guards: authorization per thread, rate limiting, model feature checks (e.g., file support).
- `convex/workflows.ts`
  - Workflow engine for multi‑model runs:
    - Create temporary sub‑threads (one per model, master included)
    - Round 1: initial responses in parallel
    - Round 2: debate prompts that incorporate peers’ answers
    - Final: master model synthesizes a single response; a separate lightweight “summary agent” generates a structured summary object used by the UI’s table.
  - Persists run status in `multiModelRuns` for real‑time status and linking.
- `convex/usage.ts`
  - Records usage events per request, aggregates a weekly ledger, and computes budget/limit status.
  - Exposes `getSelfStatus` for UI gating (e.g., banners/tooltips when limits are reached) and optional re‑up capability on paid tiers.
- `convex/schema.ts`
  - Tables for `multiModelRuns`, `usageEvents`, weekly aggregates, plan metadata, and per‑thread activity signals.


## Product flow

1. User opens the home page and selects models in the Model Picker.
2. On submit, a thread is created immediately and the app navigates to `/chat/[threadId]`.
3. For single‑model:
   - The user message is saved and an assistant response streams back from the chosen model.
4. For multi‑model:
   - The initial user message is saved to the master thread.
   - A workflow creates one sub‑thread per selected model, runs initial responses in parallel, then a debate round, then synthesizes the final message on the master thread.
   - The UI displays per‑model cards with status and a final summary table once synthesis completes.


## Notable UI details

- **Optimistic navigation**: We save a lightweight “pending message” in `sessionStorage` to show immediate feedback before the first server response arrives.
- **Streaming awareness**: The message list merges persisted messages with live stream deltas for smooth incremental rendering.
- **Model capabilities**: The input bar disables file attachments if a selected model does not support files; switching models auto‑clears attachments to avoid invalid sends.
- **Accessibility**: Keyboard shortcuts (Cmd/Ctrl + K to focus input), labeled controls, and responsive layouts.


## Data model (selected tables)

- `multiModelRuns`
  - Tracks a run anchored to the master thread/message, with per‑model run states (`initial`, `debate`, `complete`, `error`).
  - Stores a structured `runSummaryStructured` object for the final UI table (agreements, disagreements, per‑model summaries).
- `usageEvents`, `weeklyUsage`, `usageReups`
  - Immutable usage ledger, weekly rollups, and monthly re‑up gating.
- `subscriptions`, `plans`, `billingCustomers`
  - Minimal subscription snapshotting to compute weekly budgets; not intended for self‑hosting.


## Technology

- **Frontend**: Next.js (App Router), React 19, Tailwind‑based UI, Radix primitives, Framer Motion for tasteful micro‑interactions.
- **Backend**: Convex (functions, storage, workflows), `@convex-dev/agent` for message storage/streaming, `@convex-dev/auth` for auth.
- **Models**: OpenAI (GPT‑5 family), Anthropic (Claude), Google (Gemini), xAI (Grok), and illustrative OSS entries. The app enforces model capabilities like file support.


## Why this project

Mesh Mind demonstrates a practical, end‑to‑end pattern for:

- Coordinating multiple LLMs to improve answer quality through structured debate
- Presenting multi‑model outputs in a way that is explainable and auditable
- Building a responsive, streaming chat UX with real‑time state from Convex
- Tracking cost and limits without coupling to any single provider API

If you’re exploring multi‑model orchestration, streaming UX, or Convex‑based full‑stack development, this repo is meant to be read.


## Repository tour

- `app/(app-shell)/` – App shell, routes, and entry chat pages
- `components/` – UI primitives and chat components (model picker, messages, squad preview)
- `convex/` – Server functions, workflows, schema, and usage tracking
- `hooks/` – Client hooks (auth, autosize, auto‑scroll, mobile)
- `public/` – Provider logos and assets used throughout the UI


## Status

Active development. The repository is open for reading and discussion. It is not intended for self‑hosting as‑is (no deployment instructions are included).
