"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Bot } from "lucide-react";
import { getModelIcon, getProviderIcon, ModelId } from "@/convex/agent";
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
  const availableModels = useQuery(api.chat.getAvailableModels);
  const threadModel = useQuery(api.chat.getThreadModel, threadId ? { threadId } : "skip");
  const latestMultiRun = useQuery(
    api.chat.getLatestMultiModelRunForThread,
    threadId ? { threadId } : "skip"
  );
  const latestMessageRun = useQuery(
    api.chat.getMultiModelRun,
    latestUserMessageId ? { masterMessageId: latestUserMessageId } : "skip"
  );
  const [multiSelectState, setMultiSelectState] = useState<{
    master: string;
    secondary: string[];
  }>({
    master: threadModel || "gpt-4o-mini",
    secondary: []
  });
  // search removed per design

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
    const secondaries = latestMultiRun.allRuns
      .filter(r => !r.isMaster)
      .map(r => r.modelId as string);
    const nextState = { master, secondary: secondaries };
    const hasDiff =
      multiSelectState.master !== nextState.master ||
      multiSelectState.secondary.length !== nextState.secondary.length ||
      nextState.secondary.some(id => !multiSelectState.secondary.includes(id));
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
      const secondaries = latestMessageRun.allRuns
        .filter(r => !r.isMaster)
        .map(r => r.modelId as string);
      const nextState = { master, secondary: secondaries };
      const hasDiff =
        multiSelectState.master !== nextState.master ||
        multiSelectState.secondary.length !== nextState.secondary.length ||
        nextState.secondary.some(id => !multiSelectState.secondary.includes(id));
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

    const newSecondary = multiSelectState.secondary.includes(modelId)
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
    const newState = { master: modelId, secondary: uniqueSecondary };
    setMultiSelectState(newState);
    onMultiModelChange?.(newState);
    onModelChange?.(modelId);
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
  const selectedIds = new Set<string>([
    multiSelectState.master,
    ...multiSelectState.secondary,
  ]);
  const selectedModelsList = [
    ...(masterModelInfo ? [masterModelInfo] : []),
    ...availableModels.filter(m => multiSelectState.secondary.includes(m.id)),
  ];

  // Helper function to get icon by model ID or fallback to provider
  const getIcon = (modelId: string, provider?: string) => {
    try {
      return getModelIcon(modelId as ModelId);
    } catch {
      return getProviderIcon(provider || "");
    }
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
      <DropdownMenuContent align="start" className="w-[960px] max-w-[95vw] border-border p-5 rounded-xl shadow-xl surface-menu">
        <div className="max-h-[540px] overflow-auto pr-1">
          <div className="flex flex-col gap-6">
            {selectedModelsList.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-base font-semibold">Selected models</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
                  {selectedModelsList.map((model) => {
                    const isPrimary = model.id === multiSelectState.master;
                    const isSecondary = multiSelectState.secondary.includes(model.id);
                    const disabled = isPrimary;
                    return (
                      <div key={`selected-card-${model.id}`} className="group relative">
                        <button
                          type="button"
                          onClick={() => !disabled && handleMultiModelToggle(model.id)}
                          className={`model-card model-card-wide w-full text-left p-3 ${
                            disabled ? "cursor-default opacity-90" : "cursor-pointer"
                          } ${isPrimary || isSecondary ? "model-card-selected" : ""}`}
                          aria-selected={isPrimary || isSecondary}
                          role="option"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{getIcon(model.id, model.provider)}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-sm sm:text-base truncate">{model.displayName}</span>
                              </div>
                            </div>
                          </div>
                          {isPrimary && (
                            <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-[11px] shadow">
                               Primary
                            </span>
                          )}
                        </button>
                        {isSecondary && !isPrimary && (
                          <button
                            type="button"
                            onClick={() => handleMasterChange(model.id)}
                            className="absolute bottom-3 right-3 rounded-md bg-background border border-border px-2.5 py-1 text-[11px] shadow transition-opacity cursor-pointer opacity-100"
                            aria-label={`Set ${model.displayName} as primary`}
                          >
                            Set Primary
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {Object.entries(modelsByProvider).map(([provider, models]) => {
              const visibleModels = models.filter(m => !selectedIds.has(m.id));
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
                      const disabled = isPrimary;
                      return (
                        <div key={`card-${model.id}`} className="group relative">
                          <button
                            type="button"
                            onClick={() => !disabled && handleMultiModelToggle(model.id)}
                            className={`model-card model-card-wide w-full text-left p-3 ${
                              disabled ? "cursor-default opacity-90" : "cursor-pointer"
                            } ${isPrimary || isSecondary ? "model-card-selected" : ""}`}
                            aria-selected={isPrimary || isSecondary}
                            role="option"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{getIcon(model.id, model.provider)}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium text-sm sm:text-base truncate">{model.displayName}</span>
                                </div>
                              </div>
                            </div>
                            {isPrimary && (
                              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-[11px] shadow">
                               Primary
                              </span>
                            )}
                          </button>

                          {isSecondary && !isPrimary && (
                            <button
                              type="button"
                              onClick={() => handleMasterChange(model.id)}
                              className="absolute bottom-3 right-3 rounded-md bg-background border border-border px-2.5 py-1 text-[11px] shadow transition-opacity cursor-pointer opacity-100"
                              aria-label={`Set ${model.displayName} as primary`}
                            >
                              Set Primary
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
