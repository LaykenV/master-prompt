"use client";

import React, { useState, useRef, useEffect, UIEvent } from "react";
import { Button } from "@/components/ui/button";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useSelfStatus } from "@/hooks/use-self-status";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Static plans array
const plans = [
  { id: "free", name: "Free", tier: null },
  { id: "lite", name: "Lite", tier: "lite" as const },
  { id: "pro", name: "Pro", tier: "pro" as const }
];

export default function SubscriptionPage() {
  const checkout = useAction(api.stripeActions.createCheckoutSession);
  const customerPortal = useAction(api.stripeActions.createCustomerPortalSession);
  const selfStatus = useSelfStatus();

  const currentTier = selfStatus?.planName?.toLowerCase() || "free";

  const [open, setOpen] = useState(false); // mobile/click fallback for hover accordion
  const [isCheckoutLoading, setIsCheckoutLoading] = useState<string | null>(null);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  
  // Mobile scroll handling for pricing cards
  const [selectedPricingIndex, setSelectedPricingIndex] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleUpgrade = async (tier: "lite" | "pro") => {
    try {
      setIsCheckoutLoading(tier);
      const url = await checkout({ tier });
      window.location.href = url.url;
    } catch (error) {
      console.error("Error during checkout:", error);
      setIsCheckoutLoading(null);
    }
  };

  const handleCustomerPortal = async () => {
    try {
      setIsPortalLoading(true);
      const url = await customerPortal();
      window.location.href = url.url;
    } catch (error) {
      console.error("Error opening customer portal:", error);
      setIsPortalLoading(false);
    }
  };

  const formatDate = (ms: number) => new Date(ms).toLocaleDateString();

  //const isSubscriptionActive = !!selfStatus?.subscription && !selfStatus?.subscription?.cancelAtPeriodEnd;
  const statusLabel = "Active"; // Always show Active

  // Auto-scroll to current plan on mobile (only on initial load)
  const hasAutoScrolled = useRef(false);
  
  useEffect(() => {
    if (selfStatus && scrollContainerRef.current && !hasAutoScrolled.current) {
      const currentPlanIndex = plans.findIndex(plan => plan.id === currentTier);
      if (currentPlanIndex !== -1) {
        setSelectedPricingIndex(currentPlanIndex);
        
        // Auto-scroll to current plan only once
        const container = scrollContainerRef.current;
        const cardWidth = container.scrollWidth / plans.length;
        const scrollPosition = currentPlanIndex * cardWidth;
        
        container.scrollTo({
          left: scrollPosition,
          behavior: 'smooth'
        });
        
        hasAutoScrolled.current = true;
      }
    }
  }, [selfStatus, currentTier]);

  const handlePricingScroll = (e: UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    if (!container) return;

    const scrollLeft = container.scrollLeft;
    const totalWidth = container.scrollWidth - container.clientWidth;
    
    if (totalWidth <= 0) return;

    // Calculate which card is in view
    const cardWidthEstimate = container.scrollWidth / plans.length;
    const centerScrollPosition = scrollLeft + container.clientWidth / 2;
    let newIndex = Math.floor(centerScrollPosition / cardWidthEstimate);

    newIndex = Math.max(0, Math.min(plans.length - 1, newIndex));

    if (newIndex !== selectedPricingIndex) {
      setSelectedPricingIndex(newIndex);
    }
  };

  if (selfStatus === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="mx-auto max-w-6xl h-full flex flex-col">
        <main className="flex-1 overflow-auto px-4 sm:px-6 pb-8 pt-4">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Subscription Accordion */}
            <div
              className={`subscription-accordion group ${open ? "accordion-open" : ""}`}
              onMouseEnter={() => {
                // Only enable hover on devices that support it (non-touch)
                if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
                  setOpen(true);
                }
              }}
              onMouseLeave={() => {
                // Only enable hover on devices that support it (non-touch)
                if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
                  setOpen(false);
                }
              }}
            >
              <button
                type="button"
                className="subscription-accordion-header w-full text-left relative"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls="subscription-accordion-content"
              >
                <div className="pr-12">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base sm:text-lg font-semibold">Your Subscription</h2>
                    <span
                      className={`pill pill-success`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <div className="subscription-accordion-subtitle">
                    <span className="font-medium text-muted-foreground">Current Plan:</span>
                    <span className="font-medium text-primary">{selfStatus.planName}</span>
                  </div>
                </div>
                
                <svg
                  className={`absolute right-4 md:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-primary transition-transform ${
                    open ? "rotate-180" : "rotate-0"
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div
                id="subscription-accordion-content"
                className="subscription-accordion-content"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <div className="text-sm text-muted-foreground">Billing</div>
                    <div className="font-medium">{selfStatus.subscription ? "Subscribed" : "Free"}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Status</div>
                    <div className={`font-medium ${selfStatus.canSend ? "text-green-600" : "text-red-600"}`}>
                      {selfStatus.canSend ? "Can send messages" : "Over limit"}
                    </div>
                  </div>
                  {currentTier !== "free" && (
                    <div className="flex items-end md:items-start">
                      <Button
                        variant="outline"
                        className="btn-new-chat-compact w-full md:w-auto"
                        onClick={handleCustomerPortal}
                        disabled={isPortalLoading}
                      >
                        {isPortalLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Manage billing"
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {selfStatus.subscription && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                    <div>
                      <div className="text-sm text-muted-foreground">Period ends</div>
                      <div className="font-medium">
                        {formatDate(selfStatus.subscription.currentPeriodEndMs)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Auto-renew</div>
                      <div className="font-medium">
                        {selfStatus.subscription.cancelAtPeriodEnd ? "Cancelled" : "Active"}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Payment method</div>
                      <div className="font-medium">
                        {selfStatus.subscription.paymentBrand && selfStatus.subscription.paymentLast4
                          ? `${selfStatus.subscription.paymentBrand} ****${selfStatus.subscription.paymentLast4}`
                          : "—"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Pricing Section Header */}
            <div className="upgrade-card p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Choose Your Plan</h2>
                <span className="upgrade-pill">Transparent Pricing</span>
              </div>
            </div>

            {/* Mobile: Horizontal scroll container - floating cards */}
            <div 
              ref={scrollContainerRef}
              className="md:hidden flex overflow-x-auto space-x-4 pb-4 px-4 snap-x snap-mandatory scrollbar-hide"
              onScroll={handlePricingScroll}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {/* Free */}
                <div className={cn(
                  "min-w-[260px] w-[75vw] max-w-[300px] snap-center flex-shrink-0",
                  `pricing-card ${currentTier === "free" ? "pricing-card-current" : ""}`
                )}>
                  <div className="pricing-card-header">
                    <h3 className="pricing-title">Free</h3>
                    {/*currentTier === "free" && <span className="badge-popular">Current</span>*/}
                    <div className="pricing-price">
                      <span className="pricing-amount">$0</span>
                      <span className="pricing-period">/mo</span>
                    </div>
                  </div>
                  <ul className="pricing-features">
                    <li>Great for trying the app</li>
                    <li>Multi-model support</li>
                    <li>API credits ($0.30/week)</li>
                  </ul>
                  {currentTier === "free" ? (
                    <button className="btn-pricing btn-pricing-current" disabled>
                      Current Plan
                    </button>
                  ) : (
                    <button
                      className="btn-pricing btn-pricing-outline"
                      onClick={handleCustomerPortal}
                      disabled={isPortalLoading}
                    >
                      {isPortalLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Downgrade to Free"
                      )}
                    </button>
                  )}
                </div>

                {/* Lite */}
                <div className={cn(
                  "min-w-[260px] w-[75vw] max-w-[300px] snap-center flex-shrink-0",
                  `pricing-card ${currentTier === "lite" ? "pricing-card-current" : ""}`
                )}>
                  <div className="pricing-card-header">
                    <h3 className="pricing-title">Lite</h3>
                    <div className="pricing-price">
                      <span className="pricing-amount">$15</span>
                      <span className="pricing-period">/mo</span>
                    </div>
                  </div>
                  <ul className="pricing-features">
                        <li>For light personal use</li>
                        <li>1x Re-up on weekly usage</li>
                        <li>API credits ($2.00/week)</li>
                  </ul>
                  {currentTier === "lite" ? (
                    <button className="btn-pricing btn-pricing-current" disabled>
                      Current Plan
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleUpgrade("lite")} 
                      className="btn-pricing btn-pricing-primary"
                      disabled={isCheckoutLoading === "lite"}
                    >
                      {isCheckoutLoading === "lite" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        currentTier === "free" ? "Upgrade to Lite" : "Switch to Lite"
                      )}
                    </button>
                  )}
                </div>

                {/* Pro */}
                <div className={cn(
                  "min-w-[260px] w-[75vw] max-w-[300px] snap-center flex-shrink-0",
                  `pricing-card pricing-card-featured ${currentTier === "pro" ? "pricing-card-current" : ""}`
                )}>
                  <div className="pricing-card-header">
                    <h3 className="pricing-title">Pro</h3>
                    {/*<span className="badge-popular">Most popular</span>*/}
                    <div className="pricing-price">
                      <span className="pricing-amount">$40</span>
                      <span className="pricing-period">/mo</span>
                    </div>
                  </div>
                  <ul className="pricing-features">
                    <li>For power users and teams</li>
                    <li>Priority Support</li>
                    <li>API credits ($6.00/week)</li>
                  </ul>
                  {currentTier === "pro" ? (
                    <button className="btn-pricing btn-pricing-current" disabled>
                      Current Plan
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleUpgrade("pro")} 
                      className="btn-pricing btn-pricing-featured" 
                      disabled={isCheckoutLoading === "pro"}
                    >
                      {isCheckoutLoading === "pro" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        currentTier === "free" ? "Upgrade to Pro" : "Switch to Pro"
                      )}
                    </button>
                  )}
                </div>
              </div>

            {/* Mobile Scroll Indicators */}
            <div className="md:hidden flex justify-center mt-6">
              <div className="flex space-x-2">
                {plans.map((_, index) => (
                  <div 
                    key={index} 
                    className={cn(
                      "transition-all duration-300 rounded-full",
                      selectedPricingIndex === index 
                        ? "w-8 h-2 bg-primary" 
                        : "w-2 h-2 bg-primary/40"
                    )}
                  />
                ))}
              </div>
            </div>

            {/* Desktop: Grid layout - floating cards */}
            <div className="hidden md:grid grid-cols-1 md:grid-cols-3 gap-6 px-4">
                {/* Free */}
                <div className={`pricing-card ${currentTier === "free" ? "pricing-card-current" : ""}`}>
                  <div className="pricing-card-header">
                    <h3 className="pricing-title">Free</h3>
                    {/*currentTier === "free" && <span className="badge-popular">Current</span>*/}
                    <div className="pricing-price">
                      <span className="pricing-amount">$0</span>
                      <span className="pricing-period">/mo</span>
                    </div>
                  </div>
                  <ul className="pricing-features">
                    <li>Great for trying the app</li>
                    <li>Multi-model support</li>
                    <li>API credits ($0.30/week)</li>
                  </ul>
                  {currentTier === "free" ? (
                    <button className="btn-pricing btn-pricing-current" disabled>
                      Current Plan
                    </button>
                  ) : (
                    <button
                      className="btn-pricing btn-pricing-outline"
                      onClick={handleCustomerPortal}
                      disabled={isPortalLoading}
                    >
                      {isPortalLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Downgrade to Free"
                      )}
                    </button>
                  )}
                </div>

                {/* Lite */}
                <div className={`pricing-card ${currentTier === "lite" ? "pricing-card-current" : ""}`}>
                  <div className="pricing-card-header">
                    <h3 className="pricing-title">Lite</h3>
                    <div className="pricing-price">
                      <span className="pricing-amount">$15</span>
                      <span className="pricing-period">/mo</span>
                    </div>
                  </div>
                  <ul className="pricing-features">
                    <li>For light personal use</li>
                    <li>1x Re-up on weekly usage</li>
                    <li>API credits ($2.00/week)</li>
                  </ul>
                  {currentTier === "lite" ? (
                    <button className="btn-pricing btn-pricing-current" disabled>
                      Current Plan
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleUpgrade("lite")} 
                      className="btn-pricing btn-pricing-primary"
                      disabled={isCheckoutLoading === "lite"}
                    >
                      {isCheckoutLoading === "lite" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        currentTier === "free" ? "Upgrade to Lite" : "Switch to Lite"
                      )}
                    </button>
                  )}
                </div>

                {/* Pro */}
                <div className={`pricing-card pricing-card-featured ${currentTier === "pro" ? "pricing-card-current" : ""}`}>
                  <div className="pricing-card-header">
                    <h3 className="pricing-title">Pro</h3>
                    {/*<span className="badge-popular">Most popular</span>*/}
                    <div className="pricing-price">
                      <span className="pricing-amount">$40</span>
                      <span className="pricing-period">/mo</span>
                    </div>
                  </div>
                  <ul className="pricing-features">
                    <li>For power users and teams</li>
                    <li>Priority Support</li>
                    <li>API credits ($6.00/week)</li>
                  </ul>
                  {currentTier === "pro" ? (
                    <button className="btn-pricing btn-pricing-current" disabled>
                      Current Plan
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleUpgrade("pro")} 
                      className="btn-pricing btn-pricing-featured" 
                      disabled={isCheckoutLoading === "pro"}
                    >
                      {isCheckoutLoading === "pro" ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        currentTier === "free" ? "Upgrade to Pro" : "Switch to Pro"
                      )}
                    </button>
                  )}
                </div>
              </div>
          </div>
        </main>
      </div>
    </div>
  );
}


