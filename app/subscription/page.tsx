"use client";

import React from "react";
import AccountTabs from "@/components/AccountTabs";
import { Button } from "@/components/ui/button";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSelfStatus } from "@/hooks/use-self-status";

export default function SubscriptionPage() {
  const checkout = useAction(api.stripeActions.createCheckoutSession);
  const customerPortal = useAction(api.stripeActions.createCustomerPortalSession);
  const selfStatus = useSelfStatus();

  const currentTier = selfStatus?.planName?.toLowerCase() || "free";

  const handleUpgrade = async (tier: "lite" | "pro") => {
    const url = await checkout({ tier });
    window.location.href = url.url;
  };

  const formatDate = (ms: number) => new Date(ms).toLocaleDateString();

  if (selfStatus === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-full account-gradient">
      <div className="mx-auto max-w-6xl h-full flex flex-col">
        <header className="account-header sticky top-0 z-10">
          <div className="px-4 sm:px-6 py-3">
            <AccountTabs />
          </div>
        </header>
        <main className="flex-1 overflow-auto px-4 sm:px-6 pb-8 pt-4">
          <div className="max-w-5xl mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-semibold">Subscription & Plans</h1>
            </div>

            {/* Subscription Details */}
            <div className="bg-card border rounded-lg p-6">
              <h2 className="text-lg font-medium mb-4">Your Subscription</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground">Current Plan</div>
                  <div className="font-medium">{selfStatus.planName}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Billing</div>
                  <div className="font-medium">{selfStatus.subscription ? "Subscribed" : "Free"}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="font-medium">{selfStatus.canSend ? "Active" : "Over Limit"}</div>
                </div>
              </div>

              {selfStatus.subscription && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                  <div>
                    <div className="text-sm text-muted-foreground">Period Ends</div>
                    <div className="font-medium">{formatDate(selfStatus.subscription.currentPeriodEndMs)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Auto-Renew</div>
                    <div className="font-medium">{selfStatus.subscription.cancelAtPeriodEnd ? "Cancelled" : "Active"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Payment Method</div>
                    <div className="font-medium">
                      {selfStatus.subscription.paymentBrand && selfStatus.subscription.paymentLast4
                        ? `${selfStatus.subscription.paymentBrand} ****${selfStatus.subscription.paymentLast4}`
                        : "—"}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Pricing Tiers */}
            <div className="bg-card border rounded-lg p-6 upgrade-card">
              <h2 className="text-lg font-medium mb-6">Choose Your Plan</h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Free Tier */}
                <div className={`model-card p-6 space-y-4 ${currentTier === "free" ? "model-card-selected" : ""}`}>
                  <div className="text-center">
                    <h3 className="text-xl font-semibold">Free Tier</h3>
                    <p className="text-3xl font-bold">$0.30</p>
                    <p className="text-sm text-muted-foreground">usage per week</p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>Perfect for trying out the service</p>
                  </div>
                  {currentTier === "free" ? (
                    <Button className="w-full" disabled variant="secondary">
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant="outline"
                      disabled={currentTier === "free"}
                      onClick={async () => {
                        const url = await customerPortal();
                        window.location.href = url.url;
                      }}
                    >
                      Downgrade to Free
                    </Button>
                  )}
                </div>

                {/* Lite Tier */}
                <div className={`model-card p-6 space-y-4 ${currentTier === "lite" ? "model-card-selected" : ""}`}>
                  <div className="text-center">
                    <h3 className="text-xl font-semibold">Lite Tier</h3>
                    <p className="text-3xl font-bold">$2.50</p>
                    <p className="text-sm text-muted-foreground">usage per week</p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>Perfect for light usage</p>
                  </div>
                  {currentTier === "lite" ? (
                    <Button className="w-full" disabled variant="secondary">
                      Current Plan
                    </Button>
                  ) : (
                    <Button onClick={() => handleUpgrade("lite")} className="w-full" disabled={currentTier === "lite"}>
                      {currentTier === "free" ? "Upgrade to Lite" : "Switch to Lite"}
                    </Button>
                  )}
                </div>

                {/* Pro Tier */}
                <div className={`model-card p-6 space-y-4 ${currentTier === "pro" ? "model-card-selected" : ""}`}>
                  <div className="text-center">
                    <h3 className="text-xl font-semibold">Pro Tier</h3>
                    <p className="text-3xl font-bold">$6.00</p>
                    <p className="text-sm text-muted-foreground">usage per week</p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p>For power users</p>
                  </div>
                  {currentTier === "pro" ? (
                    <Button className="w-full" disabled variant="secondary">
                      Current Plan
                    </Button>
                  ) : (
                    <Button onClick={() => handleUpgrade("pro")} className="w-full" variant="default" disabled={currentTier === "pro"}>
                      {currentTier === "free" ? "Upgrade to Pro" : "Switch to Pro"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}


