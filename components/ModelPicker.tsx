"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Bot, Paperclip, Brain } from "lucide-react";
import { getModelLogo, getProviderLogo } from "@/convex/agent";
import type { ModelId } from "@/convex/agent";
import {
  DndContext,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  DragOverlay,
  closestCenter,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useSelfStatus } from "@/hooks/use-self-status";
import Link from "next/link";
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
  const [isDesktop, setIsDesktop] = useState(false);
  const draggableRefs = useRef<Record<string, HTMLElement | null>>({});
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    // Safari fallback
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    } else if ('addListener' in mq && typeof mq.addListener === 'function') {
      mq.addListener(update);
      return () => {
        if ('removeListener' in mq && typeof mq.removeListener === 'function') {
          mq.removeListener(update);
        }
      };
    }
  }, []);
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

  // dnd-kit state
  const [activeId, setActiveId] = useState<string | null>(null);

  // Draggable id helpers to disambiguate context (available/master/secondary)
  const makeAvailableDragId = (modelId: string) => `available:${modelId}` as const;
  const makeMasterDragId = (modelId: string) => `master:${modelId}` as const;
  const makeSecondaryDragId = (slotIndex: number, modelId: string) => `secondary:${slotIndex}:${modelId}` as const;
  const parseDragId = (
    dragId: string,
  ): { context: "available" | "master" | "secondary"; modelId: string; slotIndex?: number } => {
    const [context, ...rest] = dragId.split(":");
    if (context === "secondary") {
      const [slotIndexStr, ...modelParts] = rest;
      return { context: "secondary", slotIndex: Number(slotIndexStr), modelId: modelParts.join(":") };
    }
    const ctx = context === "available" || context === "master" ? context : "available";
    return { context: ctx, modelId: rest.join(":") };
  };

  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(MouseSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor)
  );

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

  const dropOnSecondaryById = (index: number, id: string) => {
    if (!id) return;
    if (id === multiSelectState.master) {
      return;
    }
    const isAlreadySecondary = multiSelectState.secondary.includes(id);
    const nextSecondary = [...multiSelectState.secondary];
    if (isAlreadySecondary) {
      const from = nextSecondary.indexOf(id);
      if (from !== -1 && from !== index) {
        nextSecondary.splice(from, 1);
        nextSecondary.splice(index, 0, id);
      }
    } else {
      if (nextSecondary.length < MAX_SECONDARIES) {
        nextSecondary.splice(index, 0, id);
      } else {
        nextSecondary[index] = id;
      }
    }
    const unique = Array.from(new Set(nextSecondary)).slice(0, MAX_SECONDARIES);
    const newState = { ...multiSelectState, secondary: unique };
    setMultiSelectState(newState);
    onMultiModelChange?.(newState);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const active = String(event.active.id);
    const { modelId: activeModelId } = parseDragId(active);
    const overId = event.over?.id;
    setActiveId(null);
    if (!overId) return;
    const over = String(overId);
    if (over === "drop-master") {
      if (activeModelId !== multiSelectState.master) {
        handleMasterChange(activeModelId);
      }
      return;
    }
    if (over.startsWith("drop-secondary-")) {
      const index = parseInt(over.split("-").pop() || "0", 10);
      if (!Number.isNaN(index)) {
        dropOnSecondaryById(index, activeModelId);
      }
    }
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

  // Upgrade & usage card
  const UpgradeUsageCard = ({ threadId }: { threadId?: string }) => {
    const { percentRemaining, subscription, planName } = useSelfStatus();
    const pct = percentRemaining;
    
    if (subscription) {
      // Pro Plan card for subscribed users
      return (
        <Link
          href={`/account/usage${threadId ? `?returnChat=${threadId}` : ''}`}
          className="upgrade-card p-2 sm:p-3 lg:p-4 text-left cursor-pointer block"
          aria-label="View usage details"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{planName}</span>
                <span className="upgrade-pill">Active</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">Higher usage limits</div>
            </div>
          </div>
          <div className="mt-2 sm:mt-3">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>Weekly usage remaining</span>
              <span>{pct}%</span>
            </div>
            <div className="upgrade-progress-track">
              <div className="upgrade-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </Link>
      );
    }
    
    // Upgrade card for non-subscribed users
    return (
      <Link
        href={`/account/subscription${threadId ? `?returnChat=${threadId}` : ''}`}
        className="upgrade-card p-2 sm:p-3 lg:p-4 text-left cursor-pointer block"
        aria-label="Upgrade to unlock higher usage limits"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Upgrade</span>
              <span className="upgrade-pill">$15/month</span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">Unlock higher usage limits</div>
          </div>
        </div>
        <div className="mt-2 sm:mt-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span>Weekly usage remaining</span>
            <span>{pct}%</span>
          </div>
          <div className="upgrade-progress-track">
            <div className="upgrade-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </Link>
    );
  };

  interface ModelCardBaseProps {
    model: ModelInfo;
    isPrimary: boolean;
    isSelected: boolean;
    disabled: boolean;
    selectedClass: string;
    onClick: () => void;
  }

  const ModelCardMobile = ({
    model,
    isPrimary,
    isSelected,
    disabled,
    selectedClass,
    onClick,
  }: ModelCardBaseProps) => {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`model-card model-card-wide w-full text-left p-2 sm:p-3 ${
          disabled ? "cursor-default opacity-90" : "cursor-pointer"
        } ${selectedClass} lg:hidden`}
        aria-selected={isSelected}
        role="option"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isPrimary && (
              <span className="badge-primary" aria-label="Primary model"></span>
            )}
            {renderLogo(model.id, model.provider)}
            <span className="font-medium text-sm sm:text-base truncate">{model.displayName}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-end gap-1.5 sm:gap-2">
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

  const DraggableModelCard = ({
    model,
    isPrimary,
    isSelected,
    disabled,
    selectedClass,
    onClick,
    dragId,
  }: ModelCardBaseProps & { model: ModelInfo; dragId: string }) => {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: dragId });
    const refCallback = (node: HTMLElement | null) => {
      setNodeRef(node);
      draggableRefs.current[dragId] = node;
    };
    const style: React.CSSProperties = {
      transform: transform ? CSS.Transform.toString(transform) : undefined,
      zIndex: isDragging ? 50 : undefined,
      position: isDragging ? "relative" : undefined,
      willChange: transform ? "transform" : undefined,
      opacity: isDragging ? 0 : undefined,
    };
    return (
      <div ref={refCallback} {...listeners} {...attributes} className="block" style={style}>
        {isDesktop ? (
          <ModelCardDesktop
            model={model}
            isPrimary={isPrimary}
            isSelected={isSelected}
            disabled={disabled}
            selectedClass={selectedClass}
            onClick={onClick}
          />
        ) : (
          <ModelCardMobile
            model={model}
            isPrimary={isPrimary}
            isSelected={isSelected}
            disabled={disabled}
            selectedClass={selectedClass}
            onClick={onClick}
          />
        )}
      </div>
    );
  };

  const MasterDropZone = ({ modelInfo }: { modelInfo: ModelInfo | undefined }) => {
    const { setNodeRef, isOver } = useDroppable({ id: "drop-master" });
    return (
      <div
        ref={setNodeRef}
        className={`rounded-lg border p-1.5 sm:p-2 mb-2 sm:mb-3 lg:mb-4 transition-colors ${
          isOver ? "border-primary/60" : "border-border"
        }`}
        aria-label="Master model drop zone"
      >
        <div className="text-[10px] sm:text-xs font-medium mb-1 sm:mb-1.5 lg:mb-2 flex items-center gap-2">
          <span className="badge-primary" aria-label="Primary model"></span>
          <span className="text-muted-foreground">Master model</span>
        </div>
        {modelInfo ? (
          <DraggableModelCard
            model={modelInfo}
            isPrimary={true}
            isSelected={true}
            disabled={false}
            selectedClass={"model-card-selected"}
            onClick={() => {}}
            dragId={makeMasterDragId(modelInfo.id)}
          />
        ) : (
          <div className="p-4 rounded-md border border-dashed text-xs text-muted-foreground">Drop a model here to set as master</div>
        )}
      </div>
    );
  };

  const SecondaryDropZone = ({
    slotIndex,
    slotModel,
    onToggle,
  }: { slotIndex: number; slotModel: ModelInfo | undefined; onToggle: (id: string) => void }) => {
    const { setNodeRef, isOver } = useDroppable({ id: `drop-secondary-${slotIndex}` });
    return (
      <div
        ref={setNodeRef}
        className={`rounded-lg border p-1.5 sm:p-2 transition-colors ${isOver ? "border-primary/60" : "border-border"}`}
      >
        {slotModel ? (
          <DraggableModelCard
            model={slotModel}
            isPrimary={false}
            isSelected={true}
            disabled={false}
            selectedClass={"model-card-selected"}
            onClick={() => onToggle(slotModel.id)}
            dragId={makeSecondaryDragId(slotIndex, slotModel.id)}
          />
        ) : (
          <div className="p-2 sm:p-3 rounded-md border border-dashed text-xs text-muted-foreground">Drop a model here</div>
        )}
      </div>
    );
  };

  // Unified single-button menu with master + optional secondary selection
  const totalSelected = 1 + multiSelectState.secondary.length;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
        <DropdownMenuContent align="start" sideOffset={10} className="w-[94vw] md:w-[1000px] max-w-[95vw] border-border p-2 sm:p-4 lg:p-5 rounded-xl shadow-xl surface-menu mt-2 sm:mt-3 lg:mt-0">
        {/* Mobile top banner - more compact */}
        <div className="block lg:hidden mb-1.5 sm:mb-2">
          <UpgradeUsageCard threadId={threadId} />
        </div>
        <div className="h-[60vh] sm:h-[68vh] md:h-[70vh] max-h-[75vh] sm:max-h-[84vh] md:max-h-[640px]">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 h-full">
            {/* Selected panel - sticky on desktop, always visible */}
            <div className="lg:col-span-1 lg:sticky lg:top-2 self-start surface-menu rounded-lg p-2 lg:p-3 h-full flex flex-col">
              <div className="flex items-center justify-between px-1 mb-1.5 sm:mb-2 lg:mb-3">
                <span className="text-sm lg:text-base font-semibold">Selected</span>
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
              <div className="flex-1">
                {/* Master drop zone */}
                <MasterDropZone modelInfo={masterModelInfo as ModelInfo | undefined} />

                {/* Secondary slots */}
                <div className="px-1 mb-1 sm:mb-1.5 lg:mb-2 text-[10px] sm:text-xs text-muted-foreground">Optional secondaries (up to {MAX_SECONDARIES})</div>
                <div className="grid grid-cols-1 gap-1.5 sm:gap-2 lg:gap-3">
                  {[0, 1].slice(0, MAX_SECONDARIES).map((slotIndex) => (
                    <SecondaryDropZone
                      key={`secondary-slot-${slotIndex}`}
                      slotIndex={slotIndex}
                      slotModel={secondaryInfos[slotIndex] as ModelInfo | undefined}
                      onToggle={(id) => handleMultiModelToggle(id)}
                    />
                  ))}
                </div>
              </div>

              {/* Desktop bottom-left upgrade card */}
              <div className="hidden lg:block mt-3">
                <UpgradeUsageCard threadId={threadId} />
              </div>
            </div>

            {/* Available models - scrollable on desktop */}
            <div className="lg:col-span-2 h-full overflow-auto pr-1">
              <div className="flex flex-col gap-3 sm:gap-4 lg:gap-6">
                {Object.entries(modelsByProvider).map(([provider, models]) => {
                  const visibleModels = models; // Keep showing all models; indicate selected state
                  if (visibleModels.length === 0) return null;
                  return (
                    <div key={`provider-${provider}`} className="flex flex-col gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-sm sm:text-base font-semibold capitalize">{provider}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
                        {visibleModels.map((model) => {
                          const isPrimary = model.id === multiSelectState.master;
                          const isSecondary = multiSelectState.secondary.includes(model.id);
                          const disabled = isPrimary || (!isSecondary && multiSelectState.secondary.length >= MAX_SECONDARIES);
                          const selectedClass = isPrimary || isSecondary ? "model-card-selected" : "";
                          const isSelected = isPrimary || isSecondary;
                          return (
                            <div key={`card-${model.id}`} className="group relative">
                              <DraggableModelCard
                                model={model as ModelInfo}
                                isPrimary={isPrimary}
                                isSelected={isSelected}
                                disabled={disabled}
                                selectedClass={selectedClass}
                                onClick={() => !disabled && handleMultiModelToggle(model.id)}
                                dragId={makeAvailableDragId(model.id)}
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
      {mounted && createPortal(
        <DragOverlay dropAnimation={null} style={{ zIndex: 99999 }}>
          {activeId ? (
            (() => {
              const { modelId } = parseDragId(activeId);
              const m = availableModels.find((mm) => mm.id === modelId);
              if (!m) return null;
              const model = m as ModelInfo;
              
              return (
                <div className="model-card model-card-wide p-3 rounded-md shadow-lg bg-background border border-border opacity-90 cursor-grabbing">
                  <div className="flex items-center gap-3">
                    {renderLogo(model.id, model.provider)}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm sm:text-base truncate">{model.displayName}</div>
                    </div>
                    <div className="flex items-center gap-2">
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
              );
            })()
          ) : null}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  );
}

