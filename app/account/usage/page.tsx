"use client";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useSelfStatus } from "@/hooks/use-self-status";
import { useState } from "react";

export default function UsagePage() {
  const reUp = useMutation(api.usage.reUpCurrentWeekForSelf);
  const selfStatus = useSelfStatus();
  const [isReUpLoading, setIsReUpLoading] = useState(false);
  const [reUpMessage, setReUpMessage] = useState<string>("");
  const weekly = useQuery(api.usage.getCurrentWeekForSelf);



  const handleReUp = async () => {
    setIsReUpLoading(true);
    setReUpMessage("");
    try {
      const result = await reUp();
      setReUpMessage(result.message);
    } catch {
      setReUpMessage("Failed to re-up. Please try again.");
    } finally {
      setIsReUpLoading(false);
    }
  };

  const formatCents = (cents: bigint | number) => {
    const value = typeof cents === 'bigint' ? Number(cents) : cents;
    return `$${(value / 100).toFixed(2)}`;
  };

  const formatDate = (ms: number) => {
    return new Date(ms).toLocaleDateString();
  };

  if (selfStatus === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }



  return (
    <div className="space-y-6">
        <div className="mx-auto">
          <h1 className="text-2xl font-semibold">Usage</h1>
        </div>

          {/* Weekly Usage Statistics */}
          <div className="bg-card border rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4">Weekly Usage</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Used</div>
                <div className="text-2xl font-bold">{formatCents(selfStatus.usage?.totalCents || 0)}</div>
              </div>
              
              <div className="text-center p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Limit</div>
                <div className="text-2xl font-bold">{formatCents(selfStatus.usage?.limitCents || 0)}</div>
              </div>
              
              <div className="text-center p-4 border rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Remaining</div>
                <div className="text-2xl font-bold">{formatCents(selfStatus.usage?.remainingCents || 0)}</div>
              </div>
            </div>

            {/* Usage Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Usage Progress</span>
                <span className="text-sm text-muted-foreground">
                  {100 - (selfStatus.percentRemaining || 0)}% used
                </span>
              </div>
              <div className="w-full rounded-full h-3 surface-input">
                <div 
                  className={`h-3 rounded-full transition-all ${
                    selfStatus.isOverLimit ? 'bg-destructive' : 
                    (100 - (selfStatus.percentRemaining || 0)) > 80 ? 'bg-yellow-500' : 'bg-primary'
                  } shadow`}
                  style={{ width: `${Math.min(100, 100 - (selfStatus.percentRemaining || 0))}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Week started: {formatDate(selfStatus.usage?.weekStartMs || 0)}</span>
                <span className={selfStatus.canSend ? 'text-green-600' : 'text-red-600'}>
                  {selfStatus.canSend ? 'Can send messages' : 'Over limit'}
                </span>
              </div>
              {weekly && (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full summary-table text-sm">
                    <thead>
                      <tr>
                        <th className="text-left">Metric</th>
                        <th className="text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="summary-cell-muted">Requests</td>
                        <td className="text-right font-medium">{weekly.requests}</td>
                      </tr>
                      <tr>
                        <td className="summary-cell-muted">Prompt tokens</td>
                        <td className="text-right font-medium">{weekly.promptTokens.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td className="summary-cell-muted">Completion tokens</td>
                        <td className="text-right font-medium">{weekly.completionTokens.toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td className="summary-cell-muted">Reasoning tokens</td>
                        <td className="text-right font-medium">{weekly.reasoningTokens.toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Re-up Section */}
          <div className="bg-card border rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4">Weekly Re-up</h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800">
                <strong>Monthly Re-up:</strong> Reset your weekly usage once per month. 
                This will clear your current week&apos;s usage and restore your full weekly limit.
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <Button 
                onClick={handleReUp}
                disabled={isReUpLoading}
                variant="outline"
              >
                {isReUpLoading ? 'Re-upping...' : 'Re-up Weekly Usage'}
              </Button>
              
              {reUpMessage && (
                <div className={`text-sm ${
                  reUpMessage.includes('successful') || reUpMessage.includes('Re-up successful') 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`}>
                  {reUpMessage}
                </div>
              )}
            </div>
          </div>

          {/* Bottom actions removed as requested */}
    </div>
  );
}