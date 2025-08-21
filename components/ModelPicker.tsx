"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Bot, Sparkles, Users, Check, Search } from "lucide-react";
import { getModelIcon, getProviderIcon, ModelId } from "@/convex/agent";
import { Input } from "@/components/ui/input";

interface ModelPickerProps {
  threadId?: string;
  className?: string;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  onMultiModelChange?: (models: { master: string; secondary: string[] }) => void;
  // Deprecated prop kept for backwards-compat. Ignored.
  multiModelMode?: boolean;
}

export function ModelPicker({
  threadId,
  className,
  selectedModel,
  onModelChange,
  onMultiModelChange,
}: ModelPickerProps) {
  const availableModels = useQuery(api.chat.getAvailableModels);
  const threadModel = useQuery(api.chat.getThreadModel, threadId ? { threadId } : "skip");
  const [clientModel, setClientModel] = useState<string>();
  const [multiSelectState, setMultiSelectState] = useState<{
    master: string;
    secondary: string[];
  }>({
    master: threadModel || "gpt-4o-mini",
    secondary: []
  });
  const [search, setSearch] = useState<string>("");

  // Initialize client model from thread model
  useEffect(() => {
    if (threadModel && !clientModel) {
      setClientModel(threadModel);
      setMultiSelectState(prev => ({ ...prev, master: threadModel }));
    }
  }, [threadModel, clientModel]);

  const currentModel = selectedModel || clientModel || threadModel || "gpt-4o-mini";

  const filteredModels = useMemo(() => {
    if (!availableModels) return [] as typeof availableModels;
    const s = search.trim().toLowerCase();
    if (!s) return availableModels;
    return availableModels.filter((m) =>
      [m.displayName, m.id, m.provider].some((x) => x.toLowerCase().includes(s))
    );
  }, [availableModels, search]);

  const handleModelChange = (modelId: string) => {
    setClientModel(modelId);
    onModelChange?.(modelId);
  };

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
    // Remove from secondary if it was there
    const newSecondary = multiSelectState.secondary.filter(id => id !== modelId);
    const newState = { master: modelId, secondary: newSecondary };
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

  const currentModelInfo = availableModels.find(m => m.id === currentModel);
  const masterModelInfo = availableModels.find(m => m.id === multiSelectState.master);

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
          className={`flex items-center gap-2 ${className}`}
        >
          <Users className="h-4 w-4" />
          <span className="text-sm font-medium">
            {totalSelected === 1
              ? masterModelInfo?.displayName || multiSelectState.master
              : `${totalSelected} Models`}
          </span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 border-border bg-popover">
        <div className="px-2 py-2">
          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="h-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          MASTER MODEL (Primary)
        </DropdownMenuLabel>
        <div className="max-h-40 overflow-auto">
          {filteredModels.map((model) => (
            <DropdownMenuItem
              key={`master-${model.id}`}
              onClick={() => handleMasterChange(model.id)}
              className="flex items-center gap-3 cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
            >
              <span className="text-lg">{getIcon(model.id, model.provider)}</span>
              <div className="flex flex-col flex-1">
                <span className="font-medium">{model.displayName}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {model.provider} • Master
                </span>
              </div>
              {model.id === multiSelectState.master && (
                <Sparkles className="h-3 w-3 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          SECONDARY MODELS (Optional)
        </DropdownMenuLabel>
        <div className="max-h-56 overflow-auto">
          {filteredModels.map((model) => {
            const isSelected = multiSelectState.secondary.includes(model.id);
            const isMaster = model.id === multiSelectState.master;
            return (
              <DropdownMenuItem
                key={`secondary-${model.id}`}
                onClick={() => !isMaster && handleMultiModelToggle(model.id)}
                className={`flex items-center gap-3 transition-colors ${
                  isMaster
                    ? "opacity-50 cursor-not-allowed"
                    : "cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                }`}
              >
                <span className="text-lg">{getIcon(model.id, model.provider)}</span>
                <div className="flex flex-col flex-1">
                  <span className="font-medium">{model.displayName}</span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {model.provider}
                  </span>
                </div>
                {isSelected && !isMaster && (
                  <Check className="h-3 w-3 text-primary" />
                )}
              </DropdownMenuItem>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
