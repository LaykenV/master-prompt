## New Chat Page – “Agent Squad” Hero (Planning Doc)

This plan replaces the current “Welcome to Master Prompt” header + info cards with a dynamic hero component that previews multi‑model runs in a visually stunning way, consistent with our design system. The hero celebrates the idea of deploying an “army” of AI agents and adapts to whether the user has selected one or multiple models.

### Objectives
- Create an impressive, on‑brand hero for the new chat page that:
  - Clearly communicates the power of multi‑model runs and debate.
  - Reacts to the current selection state (single vs multiple models).
  - Reuses our visual language, tokens, and components.
  - Performs well and remains accessible on all screen sizes.

### High‑level Concept
Think of the hero as a “squad preview”: model icons orbit or assemble with animated beams flowing between them and a central “final insight” node. On multi‑model selection, the effect conveys coordination, debate, and convergence. On single‑model selection, the hero is calmer, highlighting what you gain by adding more models.

### Key States
1) Single model selected
   - Visual: A prominent single model node (the selected model) centered in a compact formation.
   - Microcopy: “Add up to 2 more models to unlock multi‑model runs, enhanced thinking, and debate.”
   - CTA: “Choose models” (opens ModelPicker). Use `btn-new-chat-compact` styling.
   - Optional: Subtle ghost placeholders for secondary nodes with a dashed border animating in/out to hint what’s possible.

2) Multiple models selected (1 master + up to 2 secondary)
   - Visual: Three nodes (master emphasized) connected with animated beams to a central “Final” node (final insight nucleus). Beams pulse subtly and reveal progressively (similar tweening approach used in `MultiResponseMessage`).
   - Microcopy: “Your agent squad is ready to deploy.” Optionally display a tiny status subtitle: “Initial → Debate → Final” with a concise legend.
   - Icons: Use `getModelLogo` and fall back to provider icons via `getProviderLogo` to keep brand‑true.
   - Interaction: Hover/focus on each node reveals a small tooltip with model name + capabilities. Clicking the master node can also open the ModelPicker (improve affordance to tune selection).

3) Loading/No models available
   - Visual: Skeleton hero using soft gradients from `section-card` and subtle shimmer. No beams until models are known.

### Layout & Responsiveness
- Container: Place the hero inside a `section-card` within the existing page structure, under the page header area. The page continues to use `account-gradient` background.
- Desktop/tablet (md+):
  - Show full animated beams overlay (`beams-overlay`) behind the model cards/icons.
  - Use a grid that centers the hero content, max width ≈ `max-w-4xl/5xl`.
- Mobile (sm and below):
  - Reduce complexity: stack nodes in a simple row with a short, curved beam or a faint glow to imply connection.
  - Ensure tap targets ≥ 44px, readable microcopy, and avoid visual clutter.
- Reduced motion: Respect `prefers-reduced-motion` to disable beam animation; keep static lines and focus states.

### Visual Language & Tokens
- Reuse classes from `app/globals.css` and guidance in `design-plan.md`:
  - Surfaces: `section-card`, `surface-input`, `surface-menu` for any popovers.
  - Text and accents: `text-muted-foreground`, `badge-primary`, `badge-file` (for optional capability badges).
  - Buttons: `btn-new-chat-compact` for small CTAs inside the hero.
  - Beams overlay: `beams-overlay` layered behind cards.
  - Animations: keep durations ~180–200ms; stagger node reveals for delight.

### Component Structure (planned)
- `components/AgentSquadPreview.tsx` (new)
  - Props:
    - `models: { master: string; secondary: string[] }`
    - `availableModels: Array<{ id: string; displayName: string; provider: string; fileSupport: boolean }>`
    - `onOpenModelPicker?: () => void`
    - `reducedMotion?: boolean` (derived from media query)
  - Responsibilities:
    - Resolve logos with `getModelLogo`/`getProviderLogo`.
    - Render nodes (cards or icon chips) with labels.
    - Render animated beams via `AnimatedBeam` between:
      - master → secondary nodes
      - all nodes → final nucleus node
    - Manage reveal tween state (mirroring the `MultiResponseMessage` approach with RAF + a short easing window) while honoring reduced motion.
    - Expose a compact layout mode for mobile.

- Subcomponents (inside the same file for now):
  - `SquadNode` – displays a model’s logo, name (or short name), optional badges (e.g., file support), and focus/hover states.
  - `FinalNucleus` – a compact center chip with a Brain icon indicating “Final insight”.
  - `BeamsLayer` – an overlay container rendering `AnimatedBeam` lines with configurable curvature and reveal progress.

### Interaction & UX Details
- Single model state:
  - CTA opens the ModelPicker (we’ll wire a handler from `app/chat/page.tsx` to toggle the picker or focus it).
  - Show a concise tip: “Multi‑model improves reliability and breadth through debate.”
- Multiple models state:
  - Light pulse on the master node to indicate leadership.
  - Tooltips: name + provider; basic capability chips (e.g., “files”, “reasoning”) if available in `availableModels`.
  - Optional: a tiny “Simulation preview only” label to clarify this is a visual demo; the real run starts when sending.

### Accessibility
- Keyboard focus order: master → secondary → final nucleus → CTA.
- Focus styles: rely on global focus ring (`focus-visible` styles) and ensure all interactive elements are reachable.
- Color contrast: ensure readable labels and muted text meets contrast against card surfaces.
- Motion: disable animations under `prefers-reduced-motion`.

### Performance Considerations
- Beam animations use lightweight SVG/CSS + RAF; cap to 3–5 lines to avoid GPU overdraw.
- Memoize logos; avoid re‑creating refs for beams.
- Short animations (≤650ms) with early bailouts when offscreen to save cycles.

### Integration Points
- Data sources already on page: `availableModels`, `selectedModel`, `multiModelSelection` from `app/chat/page.tsx`.
- Add the hero in place of the current header/cards block, above the `MessageInput`.
- The CTA should focus/open the `ModelPicker` (either via prop callback or by scrolling into view and toggling the picker menu).

### States Summary (what the user sees)
- Single model:
  - One primary node, two ghost placeholders, dashed hints.
  - Microcopy + CTA to add models.
- Multi model:
  - Master emphasized, secondary nodes arranged symmetrically.
  - Animated beams into a final nucleus chip.
  - “Agent squad ready” headline.
- Loading:
  - Shimmer card, no beams.

### Implementation Steps (next PRs)
1) Create `components/AgentSquadPreview.tsx` with responsive layout and reduced‑motion support.
2) Implement `SquadNode`, `FinalNucleus`, and `BeamsLayer` using `AnimatedBeam` from `components/magicui/animated-beam.tsx`.
3) Wire hero into `app/chat/page.tsx` replacing the current header/cards region.
4) Connect to page state (`availableModels`, `selectedModel`, `multiModelSelection`).
5) Add tooltips and CTA wiring to open `ModelPicker`.
6) Tune animations and timing; ensure `beams-overlay` stays behind content and doesn’t intercept pointer events.
7) Responsive QA (mobile first), then tablet/desktop; verify scroll/layout constraints and no overflow.
8) Accessibility pass (focus order, reduced motion, contrast checks).
9) Polish: micro‑interactions (soft glow on hover, staggered reveals), copy tweaks.

### Future Enhancements (optional)
- Allow users to rearrange secondary nodes via drag in the hero (visual only).
- Seeded node layout randomness per session to keep it feeling fresh.
- Tiny “simulation” of Initial → Debate → Final with progress dots when idle.

---
This plan adheres to the tokens and patterns in `design-plan.md` and utilities in `app/globals.css`, favoring `section-card`, `surface-*` surfaces, `btn-new-chat-compact` CTAs, theme‑aware logos, and the existing `AnimatedBeam` for the connective tissue effect.

