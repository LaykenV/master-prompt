"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useThreadMessages, toUIMessages } from "@convex-dev/agent/react";
import { useState, useRef, createRef, MutableRefObject, RefObject, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, AlertCircle, X, Brain } from "lucide-react";
import { getModelIcon, getProviderIcon } from "@/convex/agent";
import { ModelId } from "@/convex/agent";
import { MessageBubble } from "./MessageBubble";
import { AnimatedBeam } from "@/components/magicui/animated-beam";
 

interface MultiResponseMessageProps {
  masterMessageId: string;
}

export function MultiResponseMessage({ masterMessageId }: MultiResponseMessageProps) {
  const multiModelRun = useQuery(api.chat.getMultiModelRun, { masterMessageId });
  const availableModels = useQuery(api.chat.getAvailableModels);
  const [details, setDetails] = useState<{ threadId: string; stage: "initial" | "debate" } | null>(null);
  const [collapsedAll, setCollapsedAll] = useState<boolean>(false);
  const [finalCollapsed, setFinalCollapsed] = useState<boolean>(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialCardRefs = useRef<Record<string, RefObject<HTMLDivElement | null>>>({});
  const debateCardRefs = useRef<Record<string, RefObject<HTMLDivElement | null>>>({});
  const initialBottomAnchorRefs = useRef<Record<string, RefObject<HTMLDivElement | null>>>({});
  const debateTopAnchorRefs = useRef<Record<string, RefObject<HTMLDivElement | null>>>({});
  const debateBottomAnchorRefs = useRef<Record<string, RefObject<HTMLDivElement | null>>>({});
  const finalTopAnchorRef = useRef<HTMLDivElement>(null);
  
  // Animated beam reveal state
  const revealTargetsRef = useRef<Record<string, number>>({});
  const revealProgressRef = useRef<Record<string, number>>({});
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const [, setRevealTick] = useState<number>(0);

  const ensureRunRef = (
    mapRef: MutableRefObject<Record<string, RefObject<HTMLDivElement | null>>>,
    key: string,
  ): RefObject<HTMLDivElement | null> => {
    if (!mapRef.current[key]) {
      mapRef.current[key] = createRef<HTMLDivElement>();
    }
    return mapRef.current[key];
  };
  
  
  const getModelInfo = (modelId: string) => {
    return availableModels?.find(m => m.id === modelId);
  };

  // Helper function to get icon by model ID or fallback to provider
  const getIcon = (modelId: string, provider?: string) => {
    try {
      return getModelIcon(modelId as ModelId);
    } catch {
      return getProviderIcon(provider || "");
    }
  };
  // Build targets and tween revealProgress toward them
  useEffect(() => {
    const nextTargets: Record<string, number> = {};
    if (multiModelRun) {
      for (const from of multiModelRun.allRuns) {
        for (const to of multiModelRun.allRuns) {
          const k = `i:${from.threadId}->${to.threadId}`;
          nextTargets[k] = from.status === "initial" ? 0 : 1;
        }
        const kf = `f:${from.threadId}`;
        nextTargets[kf] = (from.status === "complete" || from.status === "error") ? 1 : 0;
      }
    }
    revealTargetsRef.current = nextTargets;
    // Ensure progress keys exist
    for (const key in nextTargets) {
      if (revealProgressRef.current[key] === undefined) {
        revealProgressRef.current[key] = nextTargets[key] === 1 ? 1 : 0;
      }
    }
    // Start tweener
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    lastTsRef.current = null;
    const durationMs = 650; // total time to grow 0->1
    const animate = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      let anyChange = false;
      const step = Math.max(0.001, dt / durationMs);
      for (const key in revealTargetsRef.current) {
        const target = revealTargetsRef.current[key];
        const current = revealProgressRef.current[key] ?? 0;
        const diff = target - current;
        if (Math.abs(diff) > 0.002) {
          const inc = Math.sign(diff) * Math.min(Math.abs(diff), step);
          revealProgressRef.current[key] = current + inc;
          anyChange = true;
        } else {
          revealProgressRef.current[key] = target;
        }
      }
      if (anyChange) {
        setRevealTick((t) => t + 1);
        rafRef.current = requestAnimationFrame(animate);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [multiModelRun]);

  if (!multiModelRun) {
    return null;
  }

  // Derived flags (no hooks to avoid conditional hook calls)
  const allLeftInitial = multiModelRun.allRuns.every(r => r.status !== "initial");
  const allDone = multiModelRun.allRuns.every(r => r.status === "complete" || r.status === "error");
  const initialComplete = allLeftInitial;
  const debateStarted = multiModelRun.allRuns.some(r => r.status === "debate" || r.status === "complete" || r.status === "error");
  const debateComplete = allDone;
  const isTwo = multiModelRun.allRuns.length === 2;

  // (removed duplicate tween effect)

  const selectedRun = details ? multiModelRun.allRuns.find(r => r.threadId === details.threadId) : null;

  return (
    <Card className="w-full border-2 border-dashed border-primary/20 bg-muted/30 transition-colors hover:bg-muted/40">
      <CardContent className="pt-4 space-y-6">
        <div ref={containerRef} className="relative space-y-8 md:space-y-10">
          {/* Top actions */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              className="toggle-btn cursor-pointer"
              onClick={() => setCollapsedAll((v) => !v)}
              aria-pressed={collapsedAll}
            >
              {collapsedAll ? "Expand details" : "Minimize"}
            </button>
          </div>

          {/* Collapsed whole run card */}
          {collapsedAll && (
            <CollapsedWholeCard
              initialComplete={initialComplete}
              debateStarted={debateStarted}
              debateComplete={debateComplete}
              onExpand={() => setCollapsedAll(false)}
            />
          )}

          {!collapsedAll && (
            <>
              {/* Initial Stage */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Initial responses</div>
                <div className={`relative z-10 grid gap-3 md:gap-8 lg:gap-10 xl:gap-12 ${isTwo ? "grid-cols-2 md:grid-cols-2 lg:grid-cols-2 max-w-5xl mx-auto" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
                  {multiModelRun.allRuns.map((run) => (
                    <RunStatusCard
                      key={`initial-${run.threadId}`}
                      stage="initial"
                      run={run}
                      modelInfo={getModelInfo(run.modelId)}
                      getIcon={getIcon}
                      onSeeDetails={() => setDetails({ threadId: run.threadId, stage: "initial" })}
                      nodeRef={ensureRunRef(initialCardRefs, run.threadId)}
                      anchorBottomRef={ensureRunRef(initialBottomAnchorRefs, run.threadId)}
                      showStatus={true}
                    />
                  ))}
                </div>
              </div>

              {/* Debate Stage */}
              {/* Always show debate stage shell with spacing; content animates in */}
              <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">Debate round</div>
                  <div className={`relative z-10 grid gap-3 md:gap-8 lg:gap-10 xl:gap-12 ${isTwo ? "grid-cols-2 md:grid-cols-2 lg:grid-cols-2 max-w-5xl mx-auto" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
                    {multiModelRun.allRuns.map((run) => (
                      <RunStatusCard
                        key={`debate-${run.threadId}`}
                        stage="debate"
                        run={run}
                        modelInfo={getModelInfo(run.modelId)}
                        getIcon={getIcon}
                        onSeeDetails={() => setDetails({ threadId: run.threadId, stage: "debate" })}
                        nodeRef={ensureRunRef(debateCardRefs, run.threadId)}
                        anchorTopRef={ensureRunRef(debateTopAnchorRefs, run.threadId)}
                        anchorBottomRef={ensureRunRef(debateBottomAnchorRefs, run.threadId)}
                        showStatus={initialComplete}
                      />
                    ))}
                  </div>
                </div>

              {/* Final Summary Table */}
              {/* Always show final summary shell; compact card indicates progress */}
              <div className="space-y-2">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      className="toggle-btn cursor-pointer"
                      onClick={() => setFinalCollapsed((v) => !v)}
                      aria-pressed={finalCollapsed}
                    >
                      {finalCollapsed ? "Expand final" : "Minimize final"}
                    </button>
                  </div>
                  <div className="relative">
                    <div ref={finalTopAnchorRef} className="absolute left-1/2 -top-2 -translate-x-1/2 h-0 w-0" />
                    {finalCollapsed ? (
                      <FinalSummaryCompactCard structured={multiModelRun.runSummaryStructured} fallbackText="" debateComplete={debateComplete} onExpand={() => setFinalCollapsed(false)} />
                    ) : (
                      <FinalSummaryTable structured={multiModelRun.runSummaryStructured} fallbackText={debateComplete ? (multiModelRun.runSummary || "") : ""} />
                    )}
                  </div>
                </div>

              {/* Centered details modal */}
              <RunDetailsModal
                open={!!details}
                onOpenChange={(open) => !open && setDetails(null)}
                threadId={details?.threadId}
                modelId={selectedRun?.modelId || ""}
                modelInfo={selectedRun ? getModelInfo(selectedRun.modelId) : undefined}
                isMaster={!!selectedRun?.isMaster}
                getIcon={getIcon}
              />
            </>
          )}

          {/* Animated beams overlay (behind cards, hidden on mobile) */}
          {!collapsedAll && (
            <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block z-0 beams-overlay">
              {multiModelRun.allRuns.flatMap((fromRun) =>
                multiModelRun.allRuns.map((toRun) => (
                  <AnimatedBeam
                    key={`beam-init-${fromRun.threadId}-${toRun.threadId}`}
                    containerRef={containerRef}
                    fromRef={ensureRunRef(initialBottomAnchorRefs, fromRun.threadId)}
                    toRef={ensureRunRef(debateTopAnchorRefs, toRun.threadId)}
                    curvature={5}
                    pathOpacity={0.18}
                    pathWidth={2}
                    pathColor="hsl(var(--primary))"
                  gradientStartColor="#34d399"
                  gradientStopColor="#60a5fa"
                    duration={4.5}
                    delay={0}
                    showNodes
                    nodeRadius={2.5}
                    glow
                    glowOpacity={0.25}
                    revealProgress={revealProgressRef.current[`i:${fromRun.threadId}->${toRun.threadId}`] ?? 0}
                  />
                )),
              )}
            </div>
          )}

          {!collapsedAll && (
            <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block z-0 beams-overlay">
              {multiModelRun.allRuns.map((run) => (
                <AnimatedBeam
                  key={`beam-debate-${run.threadId}-final`}
                  containerRef={containerRef}
                  fromRef={ensureRunRef(debateBottomAnchorRefs, run.threadId)}
                  toRef={finalTopAnchorRef}
                  curvature={0}
                  pathOpacity={0.22}
                  pathWidth={2}
                  pathColor="hsl(var(--primary))"
                  gradientStartColor="#34d399"
                  gradientStopColor="#60a5fa"
                  duration={4.5}
                  delay={0.1}
                  showNodes
                  nodeRadius={2.5}
                  glow
                  glowOpacity={0.28}
                  revealProgress={revealProgressRef.current[`f:${run.threadId}`] ?? 0}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
function StatusIcon({ status, stage, visible = true }: { status: "initial" | "debate" | "complete" | "error"; stage: "initial" | "debate"; visible?: boolean }) {
  if (!visible) return <div className="h-4 w-4" />;
  if (stage === "initial") {
    if (status === "initial") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    if (status === "error") return <AlertCircle className="h-4 w-4 text-destructive" />;
    return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  }
  // debate stage
  if (status === "debate") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (status === "complete") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
  if (status === "error") return <AlertCircle className="h-4 w-4 text-destructive" />;
  return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
}

function RunStatusCard({
  stage,
  run,
  modelInfo,
  getIcon,
  onSeeDetails,
  nodeRef,
  anchorTopRef,
  anchorBottomRef,
  showStatus = true,
}: {
  stage: "initial" | "debate";
  run: { modelId: string; threadId: string; isMaster: boolean; status: "initial" | "debate" | "complete" | "error"; errorMessage?: string };
  modelInfo?: { displayName: string; provider: string };
  getIcon: (modelId: string, provider?: string) => string;
  onSeeDetails: () => void;
  nodeRef?: RefObject<HTMLDivElement | null>;
  anchorTopRef?: RefObject<HTMLDivElement | null>;
  anchorBottomRef?: RefObject<HTMLDivElement | null>;
  showStatus?: boolean;
}) {
  const label = stage === "initial" ? "Initial" : "Debate";
  const isError = run.status === "error";
  return (
    <div ref={nodeRef} className="relative">
      {/* Top anchor for beams */}
      {anchorTopRef && <div ref={anchorTopRef} className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1 h-0 w-0" />}
      <Card className={`p-3 surface-input ${run.isMaster ? 'border-primary/70' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{getIcon(run.modelId, modelInfo?.provider)}</span>
          <div className="flex flex-col">
            <div className="text-sm font-medium">{modelInfo?.displayName || run.modelId}{run.isMaster && " (Master)"}</div>
            <div className="text-[11px] text-muted-foreground">{label}</div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <StatusIcon status={run.status} stage={stage} visible={showStatus} />
          <button type="button" aria-label="See details" onClick={onSeeDetails} className="btn-new-chat-compact h-7 px-3 text-xs">
            Open Thread
          </button>
        </div>
        {isError && (
          <div className="text-[11px] text-destructive mt-2">{run.errorMessage || 'Error'}</div>
        )}
      </Card>
      {/* Bottom anchor for beams */}
      {anchorBottomRef && <div ref={anchorBottomRef} className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1 h-0 w-0" />}
    </div>
  );
}

function FinalSummaryTable({ structured, fallbackText }: { structured?: {
  originalPrompt: string;
  overview?: string;
  crossModel: { agreements: string[]; disagreements: string[]; convergenceSummary: string };
  perModel: Array<{ modelId: string; modelName: string; initialSummary: string; refinedSummary: string; changedPosition: boolean; keyPoints: string[] }>;
}, fallbackText?: string }) {
  if (!structured) {
    return (
      <div className="relative">
        <Card className="p-4 border-primary/60">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Brain className="h-4 w-4 text-primary" /> Final response
          </div>
          <div className="mt-2 text-sm text-muted-foreground min-h-6">
            {fallbackText ? fallbackText : (
              <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Generating summary…</div>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative">
    <Card className="p-4 border-primary/60 border-dashed bg-card/60">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Brain className="h-4 w-4 text-primary" /> Final summary
      </div>

      {/* Overview / Cross-model chips */}
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="table-tile">
          <div className="table-tile-title">Overview</div>
          <div className="table-tile-body text-sm text-muted-foreground min-h-6">
            {structured.overview || structured.crossModel.convergenceSummary}
          </div>
        </div>
        <div className="table-tile">
          <div className="table-tile-title pb-2">Agreements</div>
          <div className="table-chip-group">
            {structured.crossModel.agreements.length === 0 ? (
              <span className="table-chip table-chip--roomy summary-chip">None</span>
            ) : (
              structured.crossModel.agreements.map((a, i) => (
                <span key={`agree-${i}`} className="table-chip table-chip--roomy summary-chip">{a}</span>
              ))
            )}
          </div>
        </div>
        <div className="table-tile">
          <div className="table-tile-title pb-2">Disagreements</div>
          <div className="table-chip-group">
            {structured.crossModel.disagreements.length === 0 ? (
              <span className="table-chip table-chip--roomy summary-chip">None</span>
            ) : (
              structured.crossModel.disagreements.map((d, i) => (
                <span key={`disagree-${i}`} className="table-chip table-chip--roomy summary-chip chip-destructive">{d}</span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Per-model summary (responsive) */}
      {/* Desktop/tablet table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-border hidden md:block">
        <table className="summary-table w-full">
          <thead>
            <tr>
              <th className="text-left">Model</th>
              <th className="text-left">Initial</th>
              <th className="text-left">Refined</th>
              <th className="text-left">Changed?</th>
              <th className="text-left">Key points</th>
            </tr>
          </thead>
          <tbody>
            {structured.perModel.map((row) => (
              <tr key={row.modelId}>
                <td className="summary-col-model">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{getIconSafe(row.modelId)}</span>
                    <span className="font-medium">{row.modelName}</span>
                  </div>
                </td>
                <td className="summary-col-initial summary-cell-muted whitespace-pre-wrap text-sm">{row.initialSummary}</td>
                <td className="summary-col-refined summary-cell-muted whitespace-pre-wrap text-sm">{row.refinedSummary}</td>
                <td className="summary-col-changed">
                  <Badge variant={row.changedPosition ? "default" : "secondary"} className="text-xs">
                    {row.changedPosition ? "Yes" : "No"}
                  </Badge>
                </td>
                <td className="summary-col-keypoints">
                  <div className="table-chip-group">
                    {row.keyPoints.map((k, i) => (
                      <span key={`kp-${row.modelId}-${i}`} className="table-chip">{k}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <div className="mt-4 grid gap-3 md:hidden">
        {structured.perModel.map((row) => (
          <div key={row.modelId} className="model-summary-card">
            <div className="msc-header">
              <div className="msc-model">
                <span className="text-sm">{getIconSafe(row.modelId)}</span>
                <span className="msc-model-name">{row.modelName}</span>
              </div>
              <Badge variant={row.changedPosition ? "default" : "secondary"} className="text-xs">
                {row.changedPosition ? "Changed" : "Unchanged"}
              </Badge>
            </div>
            <div className="msc-section">
              <div className="summary-label">Initial</div>
              <div className="summary-value">{row.initialSummary}</div>
            </div>
            <div className="msc-section">
              <div className="summary-label">Refined</div>
              <div className="summary-value">{row.refinedSummary}</div>
            </div>
            <div className="msc-section">
              <div className="summary-label">Key points</div>
              <div className="table-chip-group">
                {row.keyPoints.map((k, i) => (
                  <span key={`mkp-${row.modelId}-${i}`} className="table-chip">{k}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
    </div>
  );
}

function getIconSafe(modelId: string) {
  try { return getModelIcon(modelId as ModelId); } catch { return "🤖"; }
}

function CollapsedWholeCard({ initialComplete, debateStarted, debateComplete, onExpand }: { initialComplete: boolean; debateStarted: boolean; debateComplete: boolean; onExpand: () => void }) {
  const Phase = ({ label, active, done }: { label: string; active: boolean; done: boolean }) => (
    <div className="collapsed-phase">
      <div className="collapsed-phase-icon" aria-hidden>
        {done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : (
          <Loader2 className={`h-4 w-4 ${active ? "animate-spin" : "opacity-40"}`} />
        )}
      </div>
      <div className={`collapsed-phase-text ${done ? "text-foreground" : "text-muted-foreground"}`}>
        {label}
      </div>
    </div>
  );

  return (
    <div className="collapsed-card" role="region" aria-label="Multi-model run status" onClick={onExpand}>
      <div className="collapsed-card-row">
        <Phase label="Initial round" active={!initialComplete} done={initialComplete} />
        <div className="collapsed-sep" />
        <Phase label="Debate" active={debateStarted && !debateComplete} done={debateComplete} />
      </div>
      <div className="collapsed-hint">Tap to expand details</div>
    </div>
  );
}

function FinalSummaryCompactCard({ structured, fallbackText, onExpand, debateComplete = false }: { structured?: { overview?: string; crossModel: { convergenceSummary: string } }, fallbackText?: string, onExpand?: () => void, debateComplete?: boolean }) {
  const overview = structured?.overview || structured?.crossModel.convergenceSummary || fallbackText || "";
  const finalReady = overview.trim().length > 0;
  return (
    <div
      className="collapsed-card"
      role="button"
      aria-label="Final summary compact"
      aria-busy={debateComplete && !finalReady}
      tabIndex={0}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (onExpand && (e.key === "Enter" || e.key === " ")) onExpand();
      }}
    >
      <div className="final-compact-title">
        <Brain className="h-4 w-4 text-primary" />
        <span>Final overview</span>
        {debateComplete ? (
          finalReady ? (
            <CheckCircle2 className="h-3 w-3 text-green-600" />
          ) : (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )
        ) : null}
      </div>
      <div className="final-compact-body">
       {overview}
      </div>
    </div>
  );
}

function RunDetailsModal({ open, onOpenChange, threadId, modelId, modelInfo, isMaster, getIcon }: { open: boolean; onOpenChange: (open: boolean) => void; threadId?: string; modelId?: string; modelInfo?: { displayName: string; provider: string }; isMaster?: boolean; getIcon: (modelId: string, provider?: string) => string }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => onOpenChange(false)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-2">
          <div className="text-sm font-medium">Run details</div>
          <button aria-label="Close" className="modal-close cursor-pointer" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2">
          {threadId && (
            <ModelResponseCard
              threadId={threadId}
              modelId={modelId || ""}
              modelInfo={modelInfo}
              isMaster={!!isMaster}
              getIcon={getIcon}
            />
          )}
        </div>
      </div>
    </div>
  );
}

interface ModelResponseCardProps {
  threadId: string;
  modelId: string;
  modelInfo?: { displayName: string; provider: string };
  isMaster: boolean;
  getIcon: (modelId: string, provider?: string) => string;
}

function ModelResponseCard({ 
  threadId, 
  modelId, 
  modelInfo, 
  isMaster, 
  getIcon,
}: ModelResponseCardProps) {
  const messages = useThreadMessages(
    api.chat.listSecondaryThreadMessages,
    { threadId },
    { initialNumItems: 10, stream: true }
  );

  const uiMessages = messages.results ? toUIMessages(messages.results) : [];
  
  // Check if we should show loading state
  const lastUserIndex = (() => {
    for (let i = uiMessages.length - 1; i >= 0; i -= 1) {
      if (uiMessages[i].role === "user") return i;
    }
    return -1;
  })();
  const hasAssistantAfterLastUser = lastUserIndex !== -1 && uiMessages.some((m, idx) => idx > lastUserIndex && m.role === "assistant");
  const shouldShowPendingAssistant = lastUserIndex !== -1 && !hasAssistantAfterLastUser;

  return (
    <Card className={`transition-colors hover:bg-card/80 surface-input ${isMaster ? 'border-primary' : 'border-border'}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">{getIcon(modelId, modelInfo?.provider)}</span>
          <span className="text-sm font-medium">
            {modelInfo?.displayName || modelId}{isMaster && " (Master)"}
          </span>
          <Badge variant={isMaster ? "default" : "secondary"} className="text-xs">
            {isMaster ? "Master" : "Secondary"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4 max-h-96 overflow-auto">
          {uiMessages.map((message) => (
            <MessageBubble key={message.key} message={message} />
          ))}
          {shouldShowPendingAssistant && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg p-4 bg-card border border-border mr-12">
                <div className="text-xs opacity-60 mb-1">Assistant</div>
                <div className="mt-2 flex items-center gap-1">
                  <div className="h-1 w-1 rounded-full bg-current animate-pulse" />
                  <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.2s" }} />
                  <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.4s" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


