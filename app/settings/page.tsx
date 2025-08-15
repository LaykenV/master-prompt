"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Mail, Calendar } from "lucide-react";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnChat = searchParams.get("returnChat");
  
  const user = useQuery(api.chat.getUser);

  const handleBack = () => {
    if (returnChat) {
      router.push(`/chat/${returnChat}`);
    } else {
      router.push("/chat");
    }
  };

  if (user === undefined) {
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
          <Button onClick={() => router.push("/signin")}>
            Sign In
          </Button>
        </div>
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
            <ArrowLeft className="h-4 w-4" />
            Back to Chat
          </Button>
          <h1 className="text-2xl font-semibold">Settings</h1>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </h2>
            
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
              
              <Separator />
              
              <div className="text-sm text-muted-foreground">
                User ID: <code className="bg-muted px-1 py-0.5 rounded text-xs">{user._id}</code>
              </div>
            </div>
          </div>
          
          {/* Additional settings sections can be added here */}
          <div className="bg-card border rounded-lg p-6">
            <h2 className="text-lg font-medium mb-4">Preferences</h2>
            <div className="text-muted-foreground">
              Coming soon...
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
