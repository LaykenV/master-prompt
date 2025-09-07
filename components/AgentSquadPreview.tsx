"use client";

import React, { useMemo, useRef, useEffect, useState } from "react";
import Image from "next/image";
import { AnimatedBeam } from "@/components/magicui/animated-beam";
import { ChevronRight, ChevronDown, MessageSquare, GitBranch, Lightbulb, Target, Users, Plus, ExternalLink } from "lucide-react";
import { useTheme } from "next-themes";
import { getModelLogo, getProviderLogo, ModelId } from "@/convex/agent";

type AvailableModel = {
  id: string;
  displayName?: string;
  provider?: string;
  fileSupport?: boolean;
};

export function AgentSquadPreview({
  models,
  availableModels,
  onChooseModels,
}: {
  models: { master: string; secondary: string[] };
  availableModels?: Array<AvailableModel>;
  onChooseModels?: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isMulti = (models.secondary?.length ?? 0) > 0;

  const getModelInfo = (id?: string) =>
    availableModels?.find((m) => m.id === id);

  const containerRef = useRef<HTMLDivElement>(null);
  const masterRef = useRef<HTMLDivElement>(null);
  const finalRef = useRef<HTMLDivElement>(null);
  const sec1Ref = useRef<HTMLDivElement>(null);
  const sec2Ref = useRef<HTMLDivElement>(null);
  // Anchor refs for precise beam endpoints (bottom of cards -> top of final)
  const masterBottomAnchorRef = useRef<HTMLDivElement>(null);
  const finalTopAnchorRef = useRef<HTMLDivElement>(null);
  const sec1BottomAnchorRef = useRef<HTMLDivElement>(null);
  const sec2BottomAnchorRef = useRef<HTMLDivElement>(null);
  // Mobile combined section anchors
  const combinedRef = useRef<HTMLDivElement>(null);
  const combinedTopAnchorRef = useRef<HTMLDivElement>(null);
  // Research & Debate anchors
  const researchRef = useRef<HTMLDivElement>(null);
  const researchTopAnchorRef = useRef<HTMLDivElement>(null);
  const researchBottomAnchorRef = useRef<HTMLDivElement>(null);

  const secondaryRefs = useMemo(() => [sec1Ref, sec2Ref], []);
  const secondaryBottomAnchorRefs = useMemo(
    () => [sec1BottomAnchorRef, sec2BottomAnchorRef],
    [],
  );

  const renderLogo = (modelId?: string, provider?: string) => {
    if (!modelId) return null;
    const logo = (() => {
      try {
        return getModelLogo(modelId as ModelId);
      } catch {
        return getProviderLogo(provider || "");
      }
    })();
    const isDark = (resolvedTheme ?? "dark") === "dark";
    const src = mounted ? (isDark ? logo.dark : logo.light) : logo.dark;
    return (
      <Image
        src={src}
        alt={logo.alt}
        width={24}
        height={24}
        className="h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6"
        priority={false}
      />
    );
  };

  const masterInfo = getModelInfo(models.master);
  const secondaries = useMemo(() => models.secondary?.slice(0, 2) ?? [], [models.secondary]);
  
  // Helper: open the ModelPicker in the input bar
  const openModelPicker = React.useCallback(() => {
    try {
      onChooseModels?.();
      const tryOpen = () => {
        const form = document.getElementById("new-chat-input-form");
        let trigger = form?.querySelector<HTMLButtonElement>(".surface-trigger");
        if (!trigger) trigger = document.querySelector<HTMLButtonElement>(".surface-trigger");
        if (!trigger) return false;
        try {
          // Radix menus may open on pointer/mouse down; dispatch them before click
          try {
            trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          } catch {}
          try {
            trigger.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          } catch {}
          trigger.click();
          return true;
        } catch {
          return false;
        }
      };
      // Attempt immediately, then poll briefly in case the picker hasn't mounted yet
      if (tryOpen()) return;
      const started = Date.now();
      const timeoutMs = 2000;
      const interval = window.setInterval(() => {
        if (tryOpen() || Date.now() - started > timeoutMs) {
          window.clearInterval(interval);
        }
      }, 150);
    } catch (error) {
      console.error("Error opening model picker:", error);
    }
  }, [onChooseModels]);

  // Reduced motion: if user prefers, we show beams static (revealProgress = 1) and avoid pulsing
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Simple tween from 0 -> 1 for reveal
  const [reveal, setReveal] = useState(prefersReducedMotion ? 1 : 0);
  useEffect(() => {
    if (prefersReducedMotion) return;
    let raf: number | null = null;
    let start: number | null = null;
    const duration = 650;
    const tick = (ts: number) => {
      if (start == null) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      setReveal(t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [prefersReducedMotion]);

  return (
    <div className="relative max-w-full">
      <div className="relative">
          {/* Header copy */}
          <div className="flex flex-col gap-2">
            <div className="grid gap-1 text-center sm:text-left">
              <div className="text-base sm:text-lg lg:text-xl font-semibold text-foreground">
                {isMulti ? "Your agent squad is ready to deploy" : "Assemble your agent squad"}
              </div>
              <div className="text-[11px] sm:text-xs lg:text-sm text-muted-foreground">
                {isMulti
                  ? "Master + secondary models coordinate with debate and converge to a final insight."
                  : "Add up to 2 more models to unlock multi‑model runs, enhanced thinking, and debate."}
              </div>
            </div>
          </div>

          {/* Hero layout */}
          <div ref={containerRef} className="relative mt-4 sm:mt-6 lg:mt-8">
            {/* Top row: all model nodes horizontally aligned */}
            <div className="relative z-10 flex items-stretch justify-center gap-1 sm:gap-2 md:gap-3 lg:gap-5 xl:gap-6 flex-nowrap px-1 sm:px-2 md:px-0">
              {/* Master */}
              <div ref={masterRef} className="relative">
                <div className={`surface-input rounded-lg border ${isMulti ? 'border-primary/70' : 'border-primary/40'} h-10 sm:h-12 md:h-14 lg:h-16 px-2 sm:px-3 md:px-3 min-w-[92px] sm:min-w-[120px] md:min-w-[148px] lg:min-w-[180px] flex items-center gap-1 sm:gap-2`}>
                  <span className="shrink-0">{renderLogo(models.master, masterInfo?.provider)}</span>
                  <div className="min-w-0">
                    <div className="text-[11px] sm:text-xs lg:text-sm font-medium truncate">{masterInfo?.displayName || models.master}</div>
                    <div className="hidden sm:block text-[10px] sm:text-[11px] lg:text-xs text-muted-foreground">Master</div>
                  </div>
                </div>
                {/* Bottom anchor for beam connection */}
                <div ref={masterBottomAnchorRef} className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1 h-0 w-0" />
              </div>

              {/* Fixed two secondary slots for consistent layout */}
              {[0, 1].map((slotIndex) => {
                const id = secondaries[slotIndex];
                const ref = secondaryRefs[slotIndex];
                if (id) {
                  const info = getModelInfo(id);
                  return (
                    <div key={`secondary-slot-${slotIndex}`} ref={ref} className="relative">
                      <div className="surface-input rounded-lg border border-border h-10 sm:h-12 md:h-14 lg:h-16 px-2 sm:px-3 md:px-3 min-w-[92px] sm:min-w-[120px] md:min-w-[148px] lg:min-w-[180px] flex items-center gap-1 sm:gap-2">
                        <span className="shrink-0">{renderLogo(id, info?.provider)}</span>
                        <div className="min-w-0">
                          <div className="text-[11px] sm:text-xs lg:text-sm font-medium truncate">{info?.displayName || id}</div>
                          <div className="hidden sm:block text-[10px] sm:text-[11px] lg:text-xs text-muted-foreground">Secondary</div>
                        </div>
                      </div>
                      {/* Bottom anchor for beam connection */}
                      <div ref={secondaryBottomAnchorRefs[slotIndex]} className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1 h-0 w-0" />
                    </div>
                  );
                }
                return (
                  <div key={`secondary-slot-${slotIndex}`} ref={ref} className="relative">
                    <button
                      type="button"
                      onClick={openModelPicker}
                      className="surface-input rounded-lg border border-dashed border-primary/45 bg-card h-10 sm:h-12 md:h-14 lg:h-16 px-2 sm:px-3 md:px-3 min-w-[92px] sm:min-w-[120px] md:min-w-[148px] lg:min-w-[180px] flex items-center gap-1 sm:gap-2 text-left text-muted-foreground cursor-pointer"
                      aria-label="Add Secondary"
                    >
                      <Plus className="h-5 w-5 sm:h-6 sm:w-6 lg:h-7 lg:w-7 text-muted-foreground/70" />
                      <div className="min-w-0">
                        <div className="text-[11px] sm:text-xs lg:text-sm font-medium truncate">Add Secondary</div>
                        <div className="hidden sm:block text-[10px] sm:text-[11px] lg:text-xs text-muted-foreground">Optional</div>
                      </div>
                    </button>
                    {/* Bottom anchor for beam connection */}
                    <div ref={secondaryBottomAnchorRefs[slotIndex]} className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1 h-0 w-0" />
                  </div>
                );
              })}
            </div>

            {/* Middle: Research & Debate node (desktop/tablet only) */}
            <div className="hidden sm:flex relative z-10 mt-10 lg:mt-12 xl:mt-14 justify-center">
              <div ref={researchRef} className="relative">
                {/* Decorative gradient glow to draw attention */}
                <div aria-hidden className="pointer-events-none absolute inset-x-0 sm:-left-12 sm:-right-12 -top-12 h-20 bg-gradient-to-b from-primary/20 via-primary/8 to-transparent opacity-60 blur-2xl rounded-full" />

                <div className="section-card px-3 sm:px-3 md:px-4 py-3 sm:py-4 md:py-5 text-center mx-2 sm:mx-0">
                  <div className="flex items-center justify-center gap-2 text-primary font-semibold text-xs sm:text-sm tracking-tight">
                    <Lightbulb className="h-4 w-4" />
                    Individual Thoughts & Debate
                  </div>
                  <div className="mt-1 text-center text-[10px] sm:text-xs text-muted-foreground max-w-[640px] mx-auto">
                    Models develop individual thoughts through a research‑backed Socratic seminar and debate one another to improve answer quality.
                    <br />
                    <a 
                      href="https://composable-models.github.io/llm_debate/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors text-xs mt-1 underline underline-offset-2"
                    >
                      Read the research paper <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  {/* Steps – mobile grid */}
                  <div className="sm:hidden mt-3 grid grid-cols-2 gap-1.5 justify-items-center px-1">
                    <span className="pill flex items-center gap-1.5 text-[11px]"><Lightbulb className="h-3.5 w-3.5" /> Individual Thoughts</span>
                    <span className="pill flex items-center gap-1.5 text-[11px]"><MessageSquare className="h-3.5 w-3.5" /> Socratic seminar</span>
                    <span className="pill flex items-center gap-1.5 text-[11px]"><GitBranch className="h-3.5 w-3.5" /> Counterpoints</span>
                    <span className="pill flex items-center gap-1.5 text-[11px]"><Target className="h-3.5 w-3.5" /> Convergence</span>
                  </div>

                  {/* Steps – desktop flow */}
                  <div className="hidden sm:flex items-center justify-center gap-2 mt-3">
                    <span className="pill flex items-center gap-1.5 text-[11px] sm:text-xs"><Lightbulb className="h-3.5 w-3.5" /> Individual Thoughts</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/70" aria-hidden />
                    <span className="pill flex items-center gap-1.5 text-[11px] sm:text-xs"><MessageSquare className="h-3.5 w-3.5" /> Socratic seminar</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/70" aria-hidden />
                    <span className="pill flex items-center gap-1.5 text-[11px] sm:text-xs"><GitBranch className="h-3.5 w-3.5" /> Counterpoints</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/70" aria-hidden />
                    <span className="pill flex items-center gap-1.5 text-[11px] sm:text-xs"><Target className="h-3.5 w-3.5" /> Convergence</span>
                  </div>
                </div>
                {/* Anchors for beam connections */}
                <div ref={researchTopAnchorRef} className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 h-0 w-0" />
                <div ref={researchBottomAnchorRef} className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1 h-0 w-0" />
              </div>
            </div>
            
            {/* Mobile: Combined Research/Debate + Final insight */}
            <div className="sm:hidden relative z-10 mt-8 flex justify-center">
              <div ref={combinedRef} className="relative">
                {/* Decorative gradient glow to draw attention */}
                <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 h-16 bg-gradient-to-b from-primary/20 via-primary/8 to-transparent opacity-60 blur-2xl rounded-full" />
                <div className="section-card px-3 py-3">
                  <div className="flex items-center justify-center gap-2 text-primary font-semibold text-xs tracking-tight">
                    <Lightbulb className="h-4 w-4" />
                    Individual Thoughts & Debate
                  </div>
                  <div className="mt-1 text-center text-[11px] text-muted-foreground mx-auto">
                    Models think individually, discuss Socratically, and converge on a better answer.
                    <br />
                    <a 
                      href="https://composable-models.github.io/llm_debate/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors text-xs mt-1 underline underline-offset-2"
                    >
                      Read the research paper <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>

                  {/* Steps – compact grid for mobile */}
                  <div className="mt-3 grid grid-cols-2 gap-1.5 justify-items-center px-1">
                    <span className="pill flex items-center gap-1.5 text-[11px]"><Lightbulb className="h-3.5 w-3.5" /> Individual Thoughts</span>
                    <span className="pill flex items-center gap-1.5 text-[11px]"><MessageSquare className="h-3.5 w-3.5" /> Socratic seminar</span>
                    <span className="pill flex items-center gap-1.5 text-[11px]"><GitBranch className="h-3.5 w-3.5" /> Counterpoints</span>
                    <span className="pill flex items-center gap-1.5 text-[11px]"><Target className="h-3.5 w-3.5" /> Convergence</span>
                  </div>

                  {/* Flow indicator */}
                  <div className="mt-3 flex items-center justify-center gap-2 text-muted-foreground">
                    <div className="h-px w-8 bg-border" />
                    <ChevronDown className="h-4 w-4" aria-hidden />
                    <div className="h-px w-8 bg-border" />
                  </div>

                  {/* Final insight summary inline */}
                  <div className="mt-4 text-center">
                    <div className="final-compact-title justify-center"><Users className="h-4 w-4 text-primary" /> Final insight</div>
                    <div className="final-compact-body text-xs text-muted-foreground">Coordinated result from your selected models.</div>
                  </div>
                </div>
                {/* Top anchor for beam connection */}
                <div ref={combinedTopAnchorRef} className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 h-0 w-0" />
              </div>
            </div>

            {/* Bottom: final nucleus centered under the row (desktop/tablet only) */}
            <div className="hidden sm:flex relative z-10 mt-8 lg:mt-10 xl:mt-12 justify-center">
              <div ref={finalRef} className="relative">
                <div className="final-compact-card">
                  <div className="final-compact-title"><Users className="h-4 w-4 text-primary" /> Final insight</div>
                  <div className="final-compact-body text-[11px] sm:text-xs text-muted-foreground">Coordinated result from your selected models.</div>
                </div>
                {/* Top anchor for beam connection */}
                <div ref={finalTopAnchorRef} className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 h-0 w-0" />
              </div>
            </div>

            {/* Beams overlay */}
            <div aria-hidden className="pointer-events-none absolute inset-0 z-0 beams-overlay">
              {/* Mobile: from all three slots to combined insight */}
              <div className="sm:hidden">
                <AnimatedBeam
                  key={`m-c`}
                  containerRef={containerRef}
                  fromRef={masterBottomAnchorRef}
                  toRef={combinedTopAnchorRef}
                  curvature={2}
                  pathOpacity={0.2}
                  pathWidth={1.5}
                  pathColor="hsl(var(--primary))"
                  gradientStartColor="#34d399"
                  gradientStopColor="#60a5fa"
                  duration={4.5}
                  delay={0.05}
                  showNodes
                  nodeRadius={1.5}
                  glow
                  glowOpacity={0.24}
                  revealProgress={reveal}
                />
                {[0,1].map((idx) => (
                  <AnimatedBeam
                    key={`s-c-${idx}`}
                    containerRef={containerRef}
                    fromRef={secondaryBottomAnchorRefs[idx]}
                    toRef={combinedTopAnchorRef}
                    curvature={2}
                    pathOpacity={0.2}
                    pathWidth={1.5}
                    pathColor="hsl(var(--primary))"
                    gradientStartColor="#34d399"
                    gradientStopColor="#60a5fa"
                    duration={4.5}
                    delay={0.1 + idx * 0.05}
                    showNodes
                    nodeRadius={1.5}
                    glow
                    glowOpacity={0.24}
                    revealProgress={reveal}
                  />
                ))}
              </div>

              {/* Desktop/tablet: from nodes to Research & Debate, then to Final */}
              <div className="hidden sm:block">
                <AnimatedBeam
                  key={`m-r`}
                  containerRef={containerRef}
                  fromRef={masterBottomAnchorRef}
                  toRef={researchTopAnchorRef}
                  curvature={2}
                  pathOpacity={0.2}
                  pathWidth={1.5}
                  pathColor="hsl(var(--primary))"
                  gradientStartColor="#34d399"
                  gradientStopColor="#60a5fa"
                  duration={4.5}
                  delay={0.05}
                  showNodes
                  nodeRadius={1.5}
                  glow
                  glowOpacity={0.24}
                  revealProgress={reveal}
                />
                {secondaries.map((_, idx) => (
                  <AnimatedBeam
                    key={`s-r-${idx}`}
                    containerRef={containerRef}
                    fromRef={secondaryBottomAnchorRefs[idx]}
                    toRef={researchTopAnchorRef}
                    curvature={2}
                    pathOpacity={0.2}
                    pathWidth={1.5}
                    pathColor="hsl(var(--primary))"
                    gradientStartColor="#34d399"
                    gradientStopColor="#60a5fa"
                    duration={4.5}
                    delay={0.1 + idx * 0.05}
                    showNodes
                    nodeRadius={1.5}
                    glow
                    glowOpacity={0.24}
                    revealProgress={reveal}
                  />
                ))}
                <AnimatedBeam
                  key={`r-f`}
                  containerRef={containerRef}
                  fromRef={researchBottomAnchorRef}
                  toRef={finalTopAnchorRef}
                  curvature={2}
                  pathOpacity={0.22}
                  pathWidth={2}
                  pathColor="hsl(var(--primary))"
                  gradientStartColor="#34d399"
                  gradientStopColor="#60a5fa"
                  duration={4.5}
                  delay={0.15}
                  showNodes
                  nodeRadius={1.5}
                  glow
                  glowOpacity={0.26}
                  revealProgress={reveal}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}


