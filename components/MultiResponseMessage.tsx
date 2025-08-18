"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useThreadMessages, toUIMessages, useSmoothText, type UIMessage } from "@convex-dev/agent/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Sparkles, Eye, EyeOff } from "lucide-react";
import { getModelIcon, getProviderIcon } from "@/convex/agent";
import { ModelId } from "@/convex/agent";

interface MultiResponseMessageProps {
  masterMessageId: string;
  originalPrompt: string;
}

export function MultiResponseMessage({ masterMessageId, originalPrompt }: MultiResponseMessageProps) {
  const multiModelRun = useQuery(api.chat.getMultiModelRun, { masterMessageId });
  const availableModels = useQuery(api.chat.getAvailableModels);
  const [showAllResponses, setShowAllResponses] = useState(true);
  
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

  return (
    <Card className="w-full border-2 border-dashed border-primary/20 bg-muted/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">
              Multi-Model Response
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {multiModelRun.allRuns.length} models
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAllResponses(!showAllResponses)}
            className="text-xs"
          >
            {showAllResponses ? (
              <>
                <EyeOff className="h-3 w-3 mr-1" />
                Hide Individual
              </>
            ) : (
              <>
                <Eye className="h-3 w-3 mr-1" />
                Show Individual
              </>
            )}
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          <strong>Your question:</strong> {originalPrompt}
        </div>
      </CardHeader>
      
      {showAllResponses && (
        <CardContent className="pt-0">
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all" className="text-xs">All Responses</TabsTrigger>
              {multiModelRun.allRuns.slice(0, 3).map((run) => (
                <TabsTrigger key={run.threadId} value={run.threadId} className="text-xs">
                  {getModelInfo(run.modelId)?.displayName || run.modelId}
                  {run.isMaster && " (Master)"}
                </TabsTrigger>
              ))}
            </TabsList>
            
            <TabsContent value="all" className="mt-4 space-y-4">
              <div className="grid gap-4">
                {/* All sub-thread responses */}
                {multiModelRun.allRuns.map((run) => (
                  <ModelResponseCard
                    key={run.threadId}
                    threadId={run.threadId}
                    modelId={run.modelId}
                    modelInfo={getModelInfo(run.modelId)}
                    isMaster={run.isMaster}
                    getIcon={getIcon}
                  />
                ))}
              </div>
            </TabsContent>
            
            {multiModelRun.allRuns.map((run) => (
              <TabsContent key={run.threadId} value={run.threadId} className="mt-4">
                <ModelResponseCard
                  threadId={run.threadId}
                  modelId={run.modelId}
                  modelInfo={getModelInfo(run.modelId)}
                  isMaster={run.isMaster}
                  getIcon={getIcon}
                  expanded={true}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}

interface ModelResponseCardProps {
  threadId: string;
  modelId: string;
  modelInfo?: { displayName: string; provider: string };
  isMaster: boolean;
  getIcon: (modelId: string, provider?: string) => string;
  expanded?: boolean;
}

function ModelResponseCard({ 
  threadId, 
  modelId, 
  modelInfo, 
  isMaster, 
  getIcon,
  expanded = false 
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
    <Card className={`${isMaster ? 'border-primary' : 'border-muted'}`}>
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
              <div className="max-w-[80%] rounded-lg p-4 bg-card border mr-12">
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

function MessageBubble({ message }: { message: UIMessage }) {
  const [visibleText] = useSmoothText(message.content, {
    startStreaming: message.status === "streaming",
  });
  
  return (
    <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
      <div 
        className={`max-w-[80%] rounded-lg p-4 ${
          message.role === "user" 
            ? "bg-primary text-primary-foreground ml-12" 
            : "bg-card border mr-12"
        }`}
      >
        <div className="text-xs opacity-60 mb-1">
          {message.role === "user" ? "You" : "Assistant"}
        </div>
        <div 
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: visibleText }}
        />
        {message.status === "streaming" && (
          <div className="mt-2 flex items-center gap-1">
            <div className="h-1 w-1 rounded-full bg-current animate-pulse" />
            <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.2s" }} />
            <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.4s" }} />
          </div>
        )}
      </div>
    </div>
  );
}

