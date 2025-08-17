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

interface MultiResponseMessageProps {
  masterMessageId: string;
  originalPrompt: string;
}

export function MultiResponseMessage({ masterMessageId, originalPrompt }: MultiResponseMessageProps) {
  const multiModelRun = useQuery(api.chat.getMultiModelRun, { masterMessageId });
  const [showAllResponses, setShowAllResponses] = useState(false);
  
  if (!multiModelRun) {
    return null;
  }

  const availableModels = useQuery(api.chat.getAvailableModels);
  
  const getModelInfo = (modelId: string) => {
    return availableModels?.find(m => m.id === modelId);
  };

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
    <Card className="w-full border-2 border-dashed border-primary/20 bg-muted/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">
              Multi-Model Response
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {1 + multiModelRun.secondaryRuns.length} models
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
              <TabsTrigger value="master" className="text-xs">
                Master Response
              </TabsTrigger>
              {multiModelRun.secondaryRuns.slice(0, 2).map((run, index) => (
                <TabsTrigger key={run.threadId} value={run.threadId} className="text-xs">
                  {getModelInfo(run.modelId)?.displayName}
                </TabsTrigger>
              ))}
            </TabsList>
            
            <TabsContent value="all" className="mt-4 space-y-4">
              <div className="grid gap-4">
                {/* Master thread response - we need to get the master model ID from thread metadata */}
                <ModelResponseCard
                  threadId={multiModelRun.masterThreadId}
                  modelId="master"
                  modelInfo={undefined}
                  isMaster={true}
                  getProviderIcon={getProviderIcon}
                />
                
                {/* Secondary responses */}
                {multiModelRun.secondaryRuns.map((run) => (
                  <ModelResponseCard
                    key={run.threadId}
                    threadId={run.threadId}
                    modelId={run.modelId}
                    modelInfo={getModelInfo(run.modelId)}
                    isMaster={false}
                    getProviderIcon={getProviderIcon}
                  />
                ))}
              </div>
            </TabsContent>
            
            <TabsContent value="master" className="mt-4">
              <ModelResponseCard
                threadId={multiModelRun.masterThreadId}
                modelId="master"
                modelInfo={undefined}
                isMaster={true}
                getProviderIcon={getProviderIcon}
                expanded={true}
              />
            </TabsContent>
            
            {multiModelRun.secondaryRuns.map((run) => (
              <TabsContent key={run.threadId} value={run.threadId} className="mt-4">
                <ModelResponseCard
                  threadId={run.threadId}
                  modelId={run.modelId}
                  modelInfo={getModelInfo(run.modelId)}
                  isMaster={false}
                  getProviderIcon={getProviderIcon}
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
  getProviderIcon: (provider: string) => string;
  expanded?: boolean;
}

function ModelResponseCard({ 
  threadId, 
  modelId, 
  modelInfo, 
  isMaster, 
  getProviderIcon,
  expanded = false 
}: ModelResponseCardProps) {
  const messages = useThreadMessages(
    api.chat.listSecondaryThreadMessages,
    { threadId },
    { initialNumItems: 5, stream: true }
  );

  if (!messages.results || messages.results.length === 0) {
    return (
      <Card className={`${isMaster ? 'border-primary' : 'border-muted'} ${expanded ? '' : 'h-32'}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">{getProviderIcon(modelInfo?.provider || "openai")}</span>
            <span className="text-sm font-medium">{modelInfo?.displayName || (isMaster ? "Master Model" : modelId)}</span>
            {isMaster && <Sparkles className="h-3 w-3 text-primary" />}
          </div>
        </CardHeader>
        <CardContent className="pt-0 flex items-center justify-center">
          <div className="flex items-center gap-1 text-muted-foreground">
            <div className="h-1 w-1 rounded-full bg-current animate-pulse" />
            <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.2s" }} />
            <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.4s" }} />
          </div>
        </CardContent>
      </Card>
    );
  }

  const uiMessages = toUIMessages(messages.results);
  const assistantMessages = uiMessages.filter(m => m.role === "assistant");
  
  if (assistantMessages.length === 0) {
    return (
      <Card className={`${isMaster ? 'border-primary' : 'border-muted'} ${expanded ? '' : 'h-32'}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">{getProviderIcon(modelInfo?.provider || "openai")}</span>
            <span className="text-sm font-medium">{modelInfo?.displayName || (isMaster ? "Master Model" : modelId)}</span>
            {isMaster && <Sparkles className="h-3 w-3 text-primary" />}
          </div>
        </CardHeader>
        <CardContent className="pt-0 flex items-center justify-center">
          <div className="flex items-center gap-1 text-muted-foreground">
            <div className="h-1 w-1 rounded-full bg-current animate-pulse" />
            <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.2s" }} />
            <div className="h-1 w-1 rounded-full bg-current animate-pulse" style={{ animationDelay: "0.4s" }} />
          </div>
        </CardContent>
      </Card>
    );
  }

  const latestResponse = assistantMessages[assistantMessages.length - 1];

  return (
    <Card className={`${isMaster ? 'border-primary' : 'border-muted'} ${expanded ? '' : 'max-h-48'}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm">{getProviderIcon(modelInfo?.provider || "")}</span>
          <span className="text-sm font-medium">{modelInfo?.displayName || modelId}</span>
          {isMaster && <Sparkles className="h-3 w-3 text-primary" />}
          <Badge variant={isMaster ? "default" : "secondary"} className="text-xs">
            {isMaster ? "Master" : "Secondary"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className={`${expanded ? '' : 'max-h-24 overflow-hidden'}`}>
          <MessageContent message={latestResponse} />
        </div>
      </CardContent>
    </Card>
  );
}

function MessageContent({ message }: { message: UIMessage }) {
  const [visibleText] = useSmoothText(message.content, {
    startStreaming: message.status === "streaming",
  });
  
  return (
    <div 
      className="prose prose-sm max-w-none dark:prose-invert text-sm"
      dangerouslySetInnerHTML={{ __html: visibleText }}
    />
  );
}
