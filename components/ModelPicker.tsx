"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Bot, Sparkles, Users, Check } from "lucide-react";
import { getModelIcon, getProviderIcon, ModelId } from "@/convex/agent";

interface ModelPickerProps {
  threadId?: string;
  className?: string;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
  // Multi-model support
  multiModelMode?: boolean;
  onMultiModelChange?: (models: { master: string; secondary: string[] }) => void;
}

export function ModelPicker({ 
  threadId, 
  className, 
  selectedModel, 
  onModelChange,
  multiModelMode = false,
  onMultiModelChange
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

  // Initialize client model from thread model
  useEffect(() => {
    if (threadModel && !clientModel) {
      setClientModel(threadModel);
      setMultiSelectState(prev => ({ ...prev, master: threadModel }));
    }
  }, [threadModel, clientModel]);

  const currentModel = selectedModel || clientModel || threadModel || "gpt-4o-mini";

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

  // Multi-model mode
  if (multiModelMode) {
    const totalSelected = 1 + multiSelectState.secondary.length; // master + secondary

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
                : `${totalSelected} Models`
              }
            </span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
            MASTER MODEL (Primary response)
          </DropdownMenuLabel>
          {availableModels.map((model) => (
            <DropdownMenuItem
              key={`master-${model.id}`}
              onClick={() => handleMasterChange(model.id)}
              className="flex items-center gap-3 cursor-pointer"
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
          
          <DropdownMenuSeparator />
          
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
            SECONDARY MODELS (Additional perspectives)
          </DropdownMenuLabel>
          {availableModels.map((model) => {
            const isSelected = multiSelectState.secondary.includes(model.id);
            const isMaster = model.id === multiSelectState.master;
            
            return (
              <DropdownMenuItem
                key={`secondary-${model.id}`}
                onClick={() => !isMaster && handleMultiModelToggle(model.id)}
                className={`flex items-center gap-3 cursor-pointer ${
                  isMaster ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                <span className="text-lg">{getIcon(model.id, model.provider)}</span>
                <div className="flex flex-col flex-1">
                  <span className="font-medium">{model.displayName}</span>
                  <span className="text-xs text-muted-foreground capitalize">
                    {model.provider} {isMaster ? '• Already master' : ''}
                  </span>
                </div>
                {isSelected && !isMaster && (
                  <Check className="h-3 w-3 text-primary" />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Single model mode (original behavior)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className={`flex items-center gap-2 ${className}`}
        >
          <span className="text-sm">{getIcon(currentModel, currentModelInfo?.provider)}</span>
          <span className="text-sm font-medium">
            {currentModelInfo?.displayName || currentModel}
          </span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {availableModels.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => handleModelChange(model.id)}
            className="flex items-center gap-3 cursor-pointer"
          >
            <span className="text-lg">{getProviderIcon(model.provider)}</span>
            <div className="flex flex-col">
              <span className="font-medium">{model.displayName}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {model.provider}
              </span>
            </div>
            {model.id === currentModel && (
              <Sparkles className="h-3 w-3 ml-auto text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
