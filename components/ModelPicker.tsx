"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect, useMemo } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Bot, Paperclip, Brain } from "lucide-react";
import { getModelLogo, getProviderLogo } from "@/convex/agent";
import type { ModelId } from "@/convex/agent";
// no search input

interface ModelPickerProps {
  threadId?: string;
  className?: string;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  onMultiModelChange?: (models: { master: string; secondary: string[] }) => void;
  // Deprecated prop kept for backwards-compat. Ignored.
  multiModelMode?: boolean;
  // Optionally, the latest user message id in the thread to determine
  // whether it kicked off a multi-model run (authoritative for current state).
  latestUserMessageId?: string;
}

export function ModelPicker({
  threadId,
  className,
  selectedModel,
  onModelChange,
  onMultiModelChange,
  latestUserMessageId,
}: ModelPickerProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => setMounted(true), []);
  const availableModels = useQuery(api.chat.getAvailableModels);
  const threadModel = useQuery(api.chat.getThreadModel, isAuthenticated && threadId ? { threadId } : "skip");
  const latestMultiRun = useQuery(
    api.chat.getLatestMultiModelRunForThread,
    isAuthenticated && threadId ? { threadId } : "skip"
  );
  const latestMessageRun = useQuery(
    api.chat.getMultiModelRun,
    isAuthenticated && latestUserMessageId ? { masterMessageId: latestUserMessageId } : "skip"
  );
  const [multiSelectState, setMultiSelectState] = useState<{
    master: string;
    secondary: string[];
  }>({
    master: threadModel || "gpt-5",
    secondary: []
  });
  // search removed per design
  const MAX_SECONDARIES = 2;

  // Drag-and-drop state
  type DragTarget = { target: "master" } | { target: "secondary"; index: number } | null;
  const [draggingModelId, setDraggingModelId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<DragTarget>(null);

  // Initialize client model from thread model
  useEffect(() => {
    if (threadModel && multiSelectState.master !== threadModel) {
      setMultiSelectState(prev => ({
        master: threadModel,
        secondary: prev.secondary.filter(id => id !== threadModel),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadModel]);

  // If parent passes a controlled selectedModel, mirror it
  useEffect(() => {
    if (selectedModel && multiSelectState.master !== selectedModel) {
      setMultiSelectState(prev => ({
        master: selectedModel,
        secondary: prev.secondary.filter(id => id !== selectedModel),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModel]);

  // Hydrate from the latest multi-model run for this thread (if any)
  useEffect(() => {
    // If we have an authoritative latest message id, defer to that effect instead
    if (latestUserMessageId) return;
    if (!latestMultiRun) return;
    const master = (latestMultiRun.masterModelId as string) || multiSelectState.master;
    type RunInfo = { isMaster: boolean; modelId: string };
    const secondaries = (latestMultiRun.allRuns as Array<RunInfo>)
      .filter((r) => !r.isMaster)
      .map((r) => r.modelId as string)
      .slice(0, MAX_SECONDARIES);
    const nextState = { master, secondary: secondaries };
    const hasDiff =
      multiSelectState.master !== nextState.master ||
      multiSelectState.secondary.length !== nextState.secondary.length ||
      nextState.secondary.some((id: string) => !multiSelectState.secondary.includes(id));
    if (hasDiff) {
      setMultiSelectState(nextState);
      onMultiModelChange?.(nextState);
      onModelChange?.(master);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestMultiRun, latestUserMessageId]);

  // Authoritative hydration based on the latest user message in the thread.
  // If that message didn't start a multi-model run, we assume single-model mode.
  useEffect(() => {
    if (!latestUserMessageId) return;
    if (latestMessageRun) {
      const master = latestMessageRun.masterModelId as string;
      type RunInfo = { isMaster: boolean; modelId: string };
      const secondaries = (latestMessageRun.allRuns as Array<RunInfo>)
        .filter((r) => !r.isMaster)
        .map((r) => r.modelId as string)
        .slice(0, MAX_SECONDARIES);
      const nextState = { master, secondary: secondaries };
      const hasDiff =
        multiSelectState.master !== nextState.master ||
        multiSelectState.secondary.length !== nextState.secondary.length ||
        nextState.secondary.some((id: string) => !multiSelectState.secondary.includes(id));
      if (hasDiff) {
        setMultiSelectState(nextState);
        onMultiModelChange?.(nextState);
        onModelChange?.(master);
      }
    } else if (latestMessageRun === null) {
      // Explicitly no multi-model run for the latest message -> single-model mode
      const master = threadModel || multiSelectState.master;
      const nextState = { master, secondary: [] as string[] };
      const hasDiff = multiSelectState.secondary.length !== 0 || multiSelectState.master !== master;
      if (hasDiff) {
        setMultiSelectState(nextState);
        onMultiModelChange?.(nextState);
        onModelChange?.(master);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestUserMessageId, latestMessageRun]);

  const modelsByProvider = useMemo(() => {
    const list = availableModels ?? [];
    const groups: Record<string, Array<typeof list[number]>> = {};
    for (const m of list) {
      const key = m.provider || "other";
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }
    return groups;
  }, [availableModels]);
  // Note: primary changes call onModelChange; secondary toggles call onMultiModelChange

  const handleMultiModelToggle = (modelId: string) => {
    if (modelId === multiSelectState.master) {
      // If clicking the master model, just return (can't deselect master)
      return;
    }

    const isSelected = multiSelectState.secondary.includes(modelId);
    if (!isSelected && multiSelectState.secondary.length >= MAX_SECONDARIES) {
      return;
    }

    const newSecondary = isSelected
      ? multiSelectState.secondary.filter(id => id !== modelId)
      : [...multiSelectState.secondary, modelId];

    const newState = { ...multiSelectState, secondary: newSecondary };
    setMultiSelectState(newState);
    onMultiModelChange?.(newState);
  };

  const handleMasterChange = (modelId: string) => {
    // Promote to primary and demote previous primary to secondary
    const prevMaster = multiSelectState.master;
    const nextSecondaryBase = multiSelectState.secondary.filter(id => id !== modelId);
    const withPrevMaster = prevMaster && prevMaster !== modelId
      ? [...nextSecondaryBase, prevMaster]
      : nextSecondaryBase;
    const uniqueSecondary = Array.from(new Set(withPrevMaster));
    const cappedSecondary = uniqueSecondary.slice(0, MAX_SECONDARIES);
    const newState = { master: modelId, secondary: cappedSecondary };
    setMultiSelectState(newState);
    onMultiModelChange?.(newState);
    onModelChange?.(modelId);
  };



  // DnD handlers
  const onCardDragStart = (e: React.DragEvent, modelId: string) => {
    setDraggingModelId(modelId);
    try {
      e.dataTransfer.setData("text/plain", modelId);
    } catch {}
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragEnd = () => {
    setDraggingModelId(null);
    setDragOverTarget(null);
  };

  const onDragOverZone = (e: React.DragEvent, target: DragTarget) => {
    e.preventDefault();
    setDragOverTarget(target);
  };

  const onDropOnMaster = (e: React.DragEvent) => {
    e.preventDefault();
    const id = (() => {
      try {
        return e.dataTransfer.getData("text/plain") || draggingModelId;
      } catch {
        return draggingModelId;
      }
    })();
    if (!id) return;
    if (id === multiSelectState.master) return;
    handleMasterChange(id);
    setDragOverTarget(null);
    setDraggingModelId(null);
  };

  const onDropOnSecondary = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const id = (() => {
      try {
        return e.dataTransfer.getData("text/plain") || draggingModelId;
      } catch {
        return draggingModelId;
      }
    })();
    if (!id) return;
    if (id === multiSelectState.master) {
      // Don't allow dropping the current master into secondary directly
      setDragOverTarget(null);
      setDraggingModelId(null);
      return;
    }

    const isAlreadySecondary = multiSelectState.secondary.includes(id);
    const nextSecondary = [...multiSelectState.secondary];

    if (isAlreadySecondary) {
      // Reorder within secondary slots
      const from = nextSecondary.indexOf(id);
      if (from !== -1 && from !== index) {
        nextSecondary.splice(from, 1);
        nextSecondary.splice(index, 0, id);
      }
    } else {
      // Insert into requested slot
      if (nextSecondary.length < MAX_SECONDARIES) {
        nextSecondary.splice(index, 0, id);
      } else {
        // Replace the target slot if full
        nextSecondary[index] = id;
      }
    }

    // Ensure uniqueness and cap
    const unique = Array.from(new Set(nextSecondary)).slice(0, MAX_SECONDARIES);
    const newState = { ...multiSelectState, secondary: unique };
    setMultiSelectState(newState);
    onMultiModelChange?.(newState);
    setDragOverTarget(null);
    setDraggingModelId(null);
  };

  if (!availableModels) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Bot className="h-4 w-4" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const masterModelInfo = availableModels.find(m => m.id === multiSelectState.master);
  const secondaryInfos = availableModels.filter(m => multiSelectState.secondary.includes(m.id));

  // Helper to render a themed logo (light/dark) for a model or its provider
  const renderLogo = (modelId: string, provider?: string) => {
    const logo = (() => {
      try {
        return getModelLogo(modelId as ModelId);
      } catch {
        return getProviderLogo(provider || "");
      }
    })();
    const isDark = (resolvedTheme ?? "dark") === "dark";
    const src = mounted ? (isDark ? logo.dark : logo.light) : logo.dark; // default to dark during SSR to avoid flicker
    return (<img src={src} alt={logo.alt} className="h-5 w-5" />);
  };

  // Responsive card components
  type ModelInfo = {
    id: string;
    displayName: string;
    provider?: string;
    fileSupport?: boolean;
    reasoning?: boolean;
  };

  interface ModelCardBaseProps {
    model: ModelInfo;
    isPrimary: boolean;
    isSelected: boolean;
    disabled: boolean;
    selectedClass: string;
    onClick: () => void;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  }

  const ModelCardMobile = ({
    model,
    isPrimary,
    isSelected,
    disabled,
    selectedClass,
    onClick,
    onDragStart,
    onDragEnd,
  }: ModelCardBaseProps) => {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`model-card model-card-wide w-full text-left p-3 ${
          disabled ? "cursor-default opacity-90" : "cursor-pointer"
        } ${selectedClass} lg:hidden`}
        aria-selected={isSelected}
        role="option"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {isPrimary && (
              <span className="badge-primary" aria-label="Primary model"></span>
            )}
            {renderLogo(model.id, model.provider)}
            <span className="font-medium text-sm sm:text-base truncate">{model.displayName}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-end gap-2">
              {model.fileSupport && (
                <span className="badge-file" aria-label="Supports files">
                  <Paperclip className="h-3 w-3" />
                  <span className="hidden sm:inline">Files</span>
                </span>
              )}
              {model.reasoning && (
                <span className="badge-file" aria-label="Supports reasoning">
                  <Brain className="h-3 w-3" />
                  <span className="hidden sm:inline">Reasoning</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const ModelCardDesktop = ({
    model,
    isPrimary,
    isSelected,
    disabled,
    selectedClass,
    onClick,
    onDragStart,
    onDragEnd,
  }: ModelCardBaseProps) => {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`model-card model-card-wide w-full text-left p-3 ${
          disabled ? "cursor-default opacity-90" : "cursor-pointer"
        } ${selectedClass} hidden lg:block`}
        aria-selected={isSelected}
        role="option"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {isPrimary && (
              <span className="badge-primary" aria-label="Primary model"></span>
            )}
            {renderLogo(model.id, model.provider)}
            <span className="font-medium text-base truncate">{model.displayName}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {model.fileSupport && (
              <span className="badge-file" aria-label="Supports files">
                <Paperclip className="h-3 w-3" />
                <span>Files</span>
              </span>
            )}
            {model.reasoning && (
              <span className="badge-file" aria-label="Supports reasoning">
                <Brain className="h-3 w-3" />
                <span>Reasoning</span>
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  // Unified single-button menu with master + optional secondary selection
  const totalSelected = 1 + multiSelectState.secondary.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={`flex items-center gap-2 surface-trigger ${className}`}
        >
          <span className="inline-flex items-center gap-2">
            <span className="text-sm font-medium"> 
              {masterModelInfo?.displayName || multiSelectState.master}
            </span>
          </span>
          {secondaryInfos.length > 0 && (
            <span className="ml-1 hidden sm:inline-flex items-center gap-1">
              
              {secondaryInfos.length > 3 && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-secondary text-secondary-foreground">
                  +{secondaryInfos.length - 3}
                </span>
              )}
            </span>
          )}
          {/* Compact selection label: number only on mobile, full text on larger screens */}
          <span className="ml-1 text-[10px] font-medium text-muted-foreground inline sm:hidden">
            {totalSelected}
          </span>
          <span className="ml-1 text-xs text-muted-foreground hidden sm:inline">
            {totalSelected} selected
          </span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[92vw] md:w-[1000px] max-w-[95vw] border-border p-5 rounded-xl shadow-xl surface-menu">
        <div className="h-[70vh] max-h-[640px]">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 h-full">
            {/* Selected panel - sticky on desktop, always visible */}
            <div className="lg:col-span-1 lg:sticky lg:top-2 self-start surface-menu rounded-lg p-3">
              <div className="flex items-center justify-between px-1 mb-3">
                <span className="text-base font-semibold">Selected</span>
                <button
                  type="button"
                  onClick={() => {
                    const newState = { master: multiSelectState.master, secondary: [] as string[] };
                    setMultiSelectState(newState);
                    onMultiModelChange?.(newState);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Clear
                </button>
              </div>
              {/* Master drop zone */}
              <div
                onDragOver={(e) => onDragOverZone(e, { target: "master" })}
                onDrop={onDropOnMaster}
                onDragLeave={() => setDragOverTarget(null)}
                className={`rounded-lg border p-2 mb-4 transition-colors ${
                  dragOverTarget && dragOverTarget.target === "master" ? "border-primary/60" : "border-border"
                }`}
                aria-label="Master model drop zone"
              >
                <div className="text-xs font-medium mb-2 flex items-center gap-2">
                  <span className="badge-primary" aria-label="Primary model"></span>
                  <span className="text-muted-foreground">Master model</span>
                </div>
                {masterModelInfo ? (
                  <div className="model-card model-card-wide p-3">
                    <div className="flex items-center gap-3 lg:hidden">
                      {renderLogo(masterModelInfo.id, masterModelInfo.provider)}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm sm:text-base truncate">{masterModelInfo.displayName}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {masterModelInfo.fileSupport && (
                          <span className="badge-file" aria-label="Supports files">
                            <Paperclip className="h-3 w-3" />
                            <span className="hidden sm:inline">Files</span>
                          </span>
                        )}
                        {masterModelInfo.reasoning && (
                          <span className="badge-file" aria-label="Supports reasoning">
                            <Brain className="h-3 w-3" />
                            <span className="hidden sm:inline">Reasoning</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="hidden lg:flex lg:flex-col lg:gap-2">
                      <div className="flex items-center gap-2">
                        {renderLogo(masterModelInfo.id, masterModelInfo.provider)}
                        <div className="font-medium text-base truncate">{masterModelInfo.displayName}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {masterModelInfo.fileSupport && (
                          <span className="badge-file" aria-label="Supports files">
                            <Paperclip className="h-3 w-3" />
                            <span>Files</span>
                          </span>
                        )}
                        {masterModelInfo.reasoning && (
                          <span className="badge-file" aria-label="Supports reasoning">
                            <Brain className="h-3 w-3" />
                            <span>Reasoning</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-md border border-dashed text-xs text-muted-foreground">Drop a model here to set as master</div>
                )}
              </div>

              {/* Secondary slots */}
              <div className="px-1 mb-2 text-xs text-muted-foreground">Optional secondaries (up to {MAX_SECONDARIES})</div>
              <div className="grid grid-cols-1 gap-3">
                {[0, 1].slice(0, MAX_SECONDARIES).map((slotIndex) => {
                  const slotModel = secondaryInfos[slotIndex];
                  const isDragOver = !!(dragOverTarget && dragOverTarget.target === "secondary" && dragOverTarget.index === slotIndex);
                  return (
                    <div
                      key={`secondary-slot-${slotIndex}`}
                      onDragOver={(e) => onDragOverZone(e, { target: "secondary", index: slotIndex })}
                      onDrop={(e) => onDropOnSecondary(e, slotIndex)}
                      onDragLeave={() => setDragOverTarget(null)}
                      className={`rounded-lg border p-2 transition-colors ${isDragOver ? "border-primary/60" : "border-border"}`}
                    >
                      {slotModel ? (
                        <div
                          className="model-card model-card-wide p-2 cursor-pointer"
                          draggable
                          onDragStart={(e) => onCardDragStart(e, slotModel.id)}
                          onDragEnd={onDragEnd}
                          onClick={() => handleMultiModelToggle(slotModel.id)}
                        >
                          <div className="flex items-center gap-3 lg:hidden">
                            {renderLogo(slotModel.id, slotModel.provider)}
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-sm truncate">{slotModel.displayName}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              {slotModel.fileSupport && (
                                <span className="badge-file" aria-label="Supports files">
                                  <Paperclip className="h-3 w-3" />
                                  <span className="hidden sm:inline">Files</span>
                                </span>
                              )}
                              {slotModel.reasoning && (
                                <span className="badge-file" aria-label="Supports reasoning">
                                  <Brain className="h-3 w-3" />
                                  <span className="hidden sm:inline">Reasoning</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="hidden lg:flex lg:flex-col lg:gap-2">
                            <div className="flex items-center gap-2">
                              {renderLogo(slotModel.id, slotModel.provider)}
                              <div className="font-medium text-base truncate">{slotModel.displayName}</div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              {slotModel.fileSupport && (
                                <span className="badge-file" aria-label="Supports files">
                                  <Paperclip className="h-3 w-3" />
                                  <span>Files</span>
                                </span>
                              )}
                              {slotModel.reasoning && (
                                <span className="badge-file" aria-label="Supports reasoning">
                                  <Brain className="h-3 w-3" />
                                  <span>Reasoning</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 rounded-md border border-dashed text-xs text-muted-foreground">Drop a model here</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Available models - scrollable on desktop */}
            <div className="lg:col-span-2 h-full overflow-auto pr-1">
              <div className="flex flex-col gap-6">
                {Object.entries(modelsByProvider).map(([provider, models]) => {
                  const visibleModels = models; // Keep showing all models; indicate selected state
                  if (visibleModels.length === 0) return null;
                  return (
                    <div key={`provider-${provider}`} className="flex flex-col gap-3">
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-base font-semibold capitalize">{provider}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                        {visibleModels.map((model) => {
                          const isPrimary = model.id === multiSelectState.master;
                          const isSecondary = multiSelectState.secondary.includes(model.id);
                          const disabled = isPrimary || (!isSecondary && multiSelectState.secondary.length >= MAX_SECONDARIES);
                          const selectedClass = isPrimary || isSecondary ? "model-card-selected" : "";
                          const isSelected = isPrimary || isSecondary;
                          return (
                            <div key={`card-${model.id}`} className="group relative">
                              <ModelCardMobile
                                model={model as ModelInfo}
                                isPrimary={isPrimary}
                                isSelected={isSelected}
                                disabled={disabled}
                                selectedClass={selectedClass}
                                onClick={() => !disabled && handleMultiModelToggle(model.id)}
                                onDragStart={(e) => onCardDragStart(e, model.id)}
                                onDragEnd={onDragEnd}
                              />
                              <ModelCardDesktop
                                model={model as ModelInfo}
                                isPrimary={isPrimary}
                                isSelected={isSelected}
                                disabled={disabled}
                                selectedClass={selectedClass}
                                onClick={() => !disabled && handleMultiModelToggle(model.id)}
                                onDragStart={(e) => onCardDragStart(e, model.id)}
                                onDragEnd={onDragEnd}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

