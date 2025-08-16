"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Bot, Sparkles } from "lucide-react";

interface ModelPickerProps {
  threadId?: string;
  className?: string;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
}

export function ModelPicker({ threadId, className, selectedModel, onModelChange }: ModelPickerProps) {
  const availableModels = useQuery(api.chat.getAvailableModels);
  const threadModel = useQuery(api.chat.getThreadModel, threadId ? { threadId } : "skip");
  const [clientModel, setClientModel] = useState<string>();

  // Initialize client model from thread model
  useEffect(() => {
    if (threadModel && !clientModel) {
      setClientModel(threadModel);
    }
  }, [threadModel, clientModel]);

  const currentModel = selectedModel || clientModel || threadModel || "gpt-4o-mini";

  const handleModelChange = (modelId: string) => {
    setClientModel(modelId);
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

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case "openai":
        return "🤖";
      case "google":
        return "🔮";
      default:
        return "🤖";
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className={`flex items-center gap-2 ${className}`}
        >
          <span className="text-sm">{getProviderIcon(currentModelInfo?.provider || "")}</span>
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
