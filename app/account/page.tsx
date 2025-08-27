"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { User, Mail, Calendar } from "lucide-react";
import { useSelfStatus } from "@/hooks/use-self-status";
import Image from "next/image";

export default function AccountPage() {
  const router = useRouter();
  
  const user = useQuery(api.chat.getUser);
  const selfStatus = useSelfStatus();

  // Back handled by header tabs component

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

  return (
    <div className="space-y-6">
        <div className="mx-auto">
          <h1 className="text-2xl font-semibold">Account Overview</h1>
        </div>

        {/* Profile + Subscription (Combined) */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile & Subscription
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
            </div>
          </div>
        </div>
    </div>
  );
}
