"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Mail, Calendar } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useSelfStatus } from "@/hooks/use-self-status";
import Image from "next/image";

export default function AccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnChat = searchParams.get("returnChat");
  
  const user = useQuery(api.chat.getUser);
  const checkout = useAction(api.stripeActions.createCheckoutSession);
  const customerPortal = useAction(api.stripeActions.createCustomerPortalSession);
  const selfStatus = useSelfStatus();

  const handleBack = () => {
    if (returnChat) {
      router.push(`/chat/${returnChat}`);
    } else {
      router.push("/chat");
    }
  };

  const handleUpgrade = async (tier: "lite" | "pro") => {
    const url = await checkout({ tier });
    window.location.href = url.url;
  };

  const formatDate = (ms: number) => {
    return new Date(ms).toLocaleDateString();
  };

  if (user === undefined || selfStatus === undefined) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-muted-foreground">Not signed in</div>
          <Button onClick={() => router.push("/")}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  const currentTier = selfStatus.planName?.toLowerCase() || 'free';

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
            <ArrowLeft className="h-4 w-4" />
            Back to Chat
          </Button>
          <h1 className="text-2xl font-semibold">Account</h1>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Profile Information */}
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                {user.name && (
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Name</div>
                      <div className="font-medium">{user.name}</div>
                    </div>
                  </div>
                )}
                {user.image && (
                  <div className="flex items-center gap-3">
                    <Image className="rounded-full" width={24} height={24} alt="User Image" src={user.image}/>
                    <div>
                      <div className="text-sm text-muted-foreground">Profile Image</div>
                    </div>
                  </div>
                )}
                
                {user.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Email</div>
                      <div className="font-medium">{user.email}</div>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm text-muted-foreground">Member since</div>
                    <div className="font-medium">
                      {new Date(user._creationTime).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Authentication Status</div>
                  <div className="font-medium">{selfStatus.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}</div>
                </div>
                
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Current Plan</div>
                  <div className="font-medium">{selfStatus.planName || 'Free'}</div>
                </div>

                <Separator />
                
                <div className="text-sm text-muted-foreground">
                  User ID: <code className="bg-muted px-1 py-0.5 rounded text-xs">{user._id}</code>
                </div>
              </div>
            </div>
          </div>

          {/* Subscription Information */}
          {selfStatus.subscription && (
            <div className="bg-card border rounded-lg p-6">
              <h2 className="text-lg font-medium mb-4">Subscription Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="font-medium capitalize">{selfStatus.subscription.status}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Plan</div>
                  <div className="font-medium">{selfStatus.planName}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Period Ends</div>
                  <div className="font-medium">{formatDate(selfStatus.subscription.currentPeriodEndMs)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Auto-Renew</div>
                  <div className="font-medium">{selfStatus.subscription.cancelAtPeriodEnd ? 'Cancelled' : 'Active'}</div>
                </div>
                {selfStatus.subscription.paymentBrand && selfStatus.subscription.paymentLast4 && (
                  <div className="md:col-span-2">
                    <div className="text-sm text-muted-foreground">Payment Method</div>
                    <div className="font-medium">{selfStatus.subscription.paymentBrand} ****{selfStatus.subscription.paymentLast4}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pricing Tiers */}
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-lg font-medium mb-6">Choose Your Plan</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Free Tier */}
              <div className={`border rounded-lg p-6 space-y-4 ${currentTier === 'free' ? 'border-blue-500 bg-blue-50' : ''}`}>
                <div className="text-center">
                  <h3 className="text-xl font-semibold">Free Tier</h3>
                  <p className="text-3xl font-bold">$0.30</p>
                  <p className="text-sm text-muted-foreground">usage per week</p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Perfect for trying out the service</p>
                </div>
                {currentTier === 'free' ? (
                  <Button className="w-full" disabled variant="secondary">
                    Current Plan
                  </Button>
                ) : (
                  <Button 
                    className="w-full" 
                    variant="outline"
                    disabled={currentTier === 'free'}
                    onClick={ async () => {
                      const url = await customerPortal();
                      window.location.href = url.url;
                    }}
                  >
                    Downgrade to Free
                  </Button>
                )}
              </div>

              {/* Lite Tier */}
              <div className={`border rounded-lg p-6 space-y-4 ${currentTier === 'lite' ? 'border-blue-500 bg-blue-50' : ''}`}>
                <div className="text-center">
                  <h3 className="text-xl font-semibold">Lite Tier</h3>
                  <p className="text-3xl font-bold">$2.50</p>
                  <p className="text-sm text-muted-foreground">usage per week</p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Perfect for light usage</p>
                </div>
                {currentTier === 'lite' ? (
                  <Button className="w-full" disabled variant="secondary">
                    Current Plan
                  </Button>
                ) : (
                  <Button 
                    onClick={() => handleUpgrade("lite")}
                    className="w-full"
                    disabled={currentTier === 'lite'}
                  >
                    {currentTier === 'free' ? 'Upgrade to Lite' : 'Switch to Lite'}
                  </Button>
                )}
              </div>
              
              {/* Pro Tier */}
              <div className={`border rounded-lg p-6 space-y-4 ${currentTier === 'pro' ? 'border-blue-500 bg-blue-50' : ''}`}>
                <div className="text-center">
                  <h3 className="text-xl font-semibold">Pro Tier</h3>
                  <p className="text-3xl font-bold">$6.00</p>
                  <p className="text-sm text-muted-foreground">usage per week</p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>For power users</p>
                </div>
                {currentTier === 'pro' ? (
                  <Button className="w-full" disabled variant="secondary">
                    Current Plan
                  </Button>
                ) : (
                  <Button 
                    onClick={() => handleUpgrade("pro")}
                    className="w-full"
                    variant="default"
                    disabled={currentTier === 'pro'}
                  >
                    {currentTier === 'free' ? 'Upgrade to Pro' : 'Switch to Pro'}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-lg font-medium mb-4">Quick Actions</h2>
            <div className="flex gap-4">
              <Button 
                onClick={() => router.push(`/account/usage${returnChat ? `?returnChat=${returnChat}` : ''}`)}
                variant="outline"
              >
                View Usage Details
              </Button>
              <Button 
                onClick={() => router.push("/settings")}
                variant="outline"
              >
                Settings
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
