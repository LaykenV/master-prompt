"use client";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useSelfStatus } from "@/hooks/use-self-status";
import { useState } from "react";

export default function UsagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnChat = searchParams.get("returnChat");
  const reUp = useMutation(api.usage.reUpCurrentWeekForSelf);
  const selfStatus = useSelfStatus();
  const [isReUpLoading, setIsReUpLoading] = useState(false);
  const [reUpMessage, setReUpMessage] = useState<string>("");

  const handleBack = () => {
    if (returnChat) {
      router.push(`/chat/${returnChat}`);
    } else {
      router.push("/chat");
    }
  };

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
    <div className="h-full flex flex-col">
      <header className="border-b bg-background p-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="flex items-center gap-2"
          >
            Back to Chat
          </Button>
          <h1 className="text-2xl font-semibold">Usage Details</h1>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Subscription & Plan Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border rounded-lg p-6">
              <h3 className="font-semibold text-lg mb-4">Current Plan</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">Plan Name</div>
                  <div className="text-2xl font-bold">{selfStatus.planName || 'Free'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="font-medium">{selfStatus.canSend ? 'Active' : 'Over Limit'}</div>
                </div>
              </div>
            </div>

            {selfStatus.subscription ? (
              <div className="border rounded-lg p-6">
                <h3 className="font-semibold text-lg mb-4">Subscription Details</h3>
                <div className="space-y-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Status</div>
                    <div className="font-medium capitalize">{selfStatus.subscription.status}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Period Ends</div>
                    <div className="font-medium">{formatDate(selfStatus.subscription.currentPeriodEndMs)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Auto-Renew</div>
                    <div className="font-medium">{selfStatus.subscription.cancelAtPeriodEnd ? 'Cancelled' : 'Active'}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border rounded-lg p-6">
                <h3 className="font-semibold text-lg mb-4">Free Plan</h3>
                <div className="space-y-3">
                  <p className="text-muted-foreground">You&apos;re currently on the free plan with limited usage.</p>
                  <Button 
                    onClick={() => router.push(`/account${returnChat ? `?returnChat=${returnChat}` : ''}`)}
                    variant="outline"
                    size="sm"
                  >
                    Upgrade Plan
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Weekly Usage Statistics */}
          <div className="border rounded-lg p-6">
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
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full transition-all ${
                    selfStatus.isOverLimit ? 'bg-red-500' : 
                    (100 - (selfStatus.percentRemaining || 0)) > 80 ? 'bg-yellow-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, 100 - (selfStatus.percentRemaining || 0))}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Week started: {formatDate(selfStatus.usage?.weekStartMs || 0)}</span>
                <span className={selfStatus.canSend ? 'text-green-600' : 'text-red-600'}>
                  {selfStatus.canSend ? 'Can send messages' : 'Over limit'}
                </span>
              </div>
            </div>
          </div>

          {/* Re-up Section */}
          <div className="border rounded-lg p-6">
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

          {/* Quick Actions */}
          <div className="border rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4">Account Actions</h3>
            <div className="flex flex-wrap gap-4">
              <Button 
                onClick={() => router.push(`/account${returnChat ? `?returnChat=${returnChat}` : ''}`)}
                variant="outline"
              >
                Account Overview
              </Button>
              <Button 
                onClick={() => router.push("/settings")}
                variant="outline"
              >
                Settings
              </Button>
              <Button onClick={handleBack} variant="ghost">
                Back to Chat
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}