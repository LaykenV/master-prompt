"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useThreadMessages, toUIMessages } from "@convex-dev/agent/react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, CheckCircle2, Loader2, AlertCircle, X } from "lucide-react";
import { getModelIcon, getProviderIcon } from "@/convex/agent";
import { ModelId } from "@/convex/agent";
import { MessageBubble } from "./MessageBubble";
 

interface MultiResponseMessageProps {
  masterMessageId: string;
}

export function MultiResponseMessage({ masterMessageId }: MultiResponseMessageProps) {
  const multiModelRun = useQuery(api.chat.getMultiModelRun, { masterMessageId });
  const availableModels = useQuery(api.chat.getAvailableModels);
  const [details, setDetails] = useState<{ threadId: string; stage: "initial" | "debate" } | null>(null);
  
  if (!multiModelRun) {
    return null;
  }

  
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
  // Derived flags (no hooks to avoid conditional hook calls)
  const allLeftInitial = multiModelRun.allRuns.every(r => r.status !== "initial");
  const allDone = multiModelRun.allRuns.every(r => r.status === "complete" || r.status === "error");

  const selectedRun = details ? multiModelRun.allRuns.find(r => r.threadId === details.threadId) : null;

  return (
    <Card className="w-full border-2 border-dashed border-primary/20 bg-muted/30 transition-colors hover:bg-muted/40">
      <CardContent className="pt-4 space-y-6">
        {/* Initial Stage */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Initial responses</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {multiModelRun.allRuns.map((run) => (
              <RunStatusCard
                key={`initial-${run.threadId}`}
                stage="initial"
                run={run}
                modelInfo={getModelInfo(run.modelId)}
                getIcon={getIcon}
                onSeeDetails={() => setDetails({ threadId: run.threadId, stage: "initial" })}
              />
            ))}
          </div>
        </div>

        {/* Debate Stage */}
        {allLeftInitial && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Debate round</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {multiModelRun.allRuns.map((run) => (
                <RunStatusCard
                  key={`debate-${run.threadId}`}
                  stage="debate"
                  run={run}
                  modelInfo={getModelInfo(run.modelId)}
                  getIcon={getIcon}
                  onSeeDetails={() => setDetails({ threadId: run.threadId, stage: "debate" })}
                />
              ))}
            </div>
          </div>
        )}

        {/* Final Summary Table */}
        {allDone && (
          <FinalSummaryTable structured={multiModelRun.runSummaryStructured} fallbackText={multiModelRun.runSummary} />
        )}

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
      </CardContent>
    </Card>
  );
}
function StatusIcon({ status, stage }: { status: "initial" | "debate" | "complete" | "error"; stage: "initial" | "debate" }) {
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
}: {
  stage: "initial" | "debate";
  run: { modelId: string; threadId: string; isMaster: boolean; status: "initial" | "debate" | "complete" | "error"; errorMessage?: string };
  modelInfo?: { displayName: string; provider: string };
  getIcon: (modelId: string, provider?: string) => string;
  onSeeDetails: () => void;
}) {
  const label = stage === "initial" ? "Initial" : "Debate";
  const isError = run.status === "error";
  return (
    <Card className={`p-3 surface-input ${run.isMaster ? 'border-primary/70' : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm">{getIcon(run.modelId, modelInfo?.provider)}</span>
        <div className="flex flex-col">
          <div className="text-sm font-medium">{modelInfo?.displayName || run.modelId}{run.isMaster && " (Master)"}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <StatusIcon status={run.status} stage={stage} />
        <button type="button" aria-label="See details" onClick={onSeeDetails} className="btn-new-chat-compact h-7 px-3 text-xs">
          Open Thread
        </button>
      </div>
      {isError && (
        <div className="text-[11px] text-destructive mt-2">{run.errorMessage || 'Error'}</div>
      )}
    </Card>
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
      <Card className="p-4 border-primary/60">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-primary" /> Final response
        </div>
        <div className="mt-2 text-sm text-muted-foreground min-h-6">
          {fallbackText ? fallbackText : (
            <div className="flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Generating summary…</div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 border-primary/60 bg-card/60">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" /> Final summary
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
          <div className="table-tile-title">Agreements</div>
          <div className="table-chip-group">
            {structured.crossModel.agreements.length === 0 ? (
              <span className="table-chip">None</span>
            ) : (
              structured.crossModel.agreements.map((a, i) => (
                <span key={`agree-${i}`} className="table-chip">{a}</span>
              ))
            )}
          </div>
        </div>
        <div className="table-tile">
          <div className="table-tile-title">Disagreements</div>
          <div className="table-chip-group">
            {structured.crossModel.disagreements.length === 0 ? (
              <span className="table-chip">None</span>
            ) : (
              structured.crossModel.disagreements.map((d, i) => (
                <span key={`disagree-${i}`} className="table-chip chip-destructive">{d}</span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Per-model table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
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
                <td>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{getIconSafe(row.modelId)}</span>
                    <span className="font-medium">{row.modelName}</span>
                  </div>
                </td>
                <td className="text-sm text-muted-foreground whitespace-pre-wrap">{row.initialSummary}</td>
                <td className="text-sm text-muted-foreground whitespace-pre-wrap">{row.refinedSummary}</td>
                <td>
                  <Badge variant={row.changedPosition ? "default" : "secondary"} className="text-xs">
                    {row.changedPosition ? "Yes" : "No"}
                  </Badge>
                </td>
                <td>
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
    </Card>
  );
}

function getIconSafe(modelId: string) {
  try { return getModelIcon(modelId as ModelId); } catch { return "🤖"; }
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
          {isMaster && <Sparkles className="h-3 w-3 text-primary" />}
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


