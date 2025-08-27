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
        {/* Profile + Subscription (Combined) */}
        <div className="section-card p-6">
          <h2 className="section-card-title mb-4">
            <User className="h-5 w-5" />
            Profile
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              {user.name && (
                <div className="flex items-center gap-3">
                  {user.image && (
                    <Image className="rounded-md" width={32} height={32} alt="User Image" src={user.image}/>
                  )}
                  {!user.image && (
                    <User className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <div className="text-sm text-muted-foreground">Name</div>
                    <div className="font-medium">{user.name}</div>
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
                <div className="text-sm text-muted-foreground mb-1">Current Plan</div>
                <div className="font-medium">{selfStatus.planName || 'Free'}</div>
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
