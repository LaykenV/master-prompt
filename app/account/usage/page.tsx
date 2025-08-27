"use client";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function UsagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnChat = searchParams.get("returnChat");
  const checkout = useAction(api.stripeActions.createCheckoutSession);

  const user = useQuery(api.chat.getUser);

  const handleBack = () => {
    if (returnChat) {
      router.push(`/chat/${returnChat}`);
    } else {
      router.push("/chat");
    }
  };

  const handleUpgrade = async () => {
    const url = await checkout();
    window.location.href = url.url;
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
          <Button onClick={() => router.push("/")}>
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center space-y-2">
        <div className="text-muted-foreground">Usage</div>
        <div className="flex justify-center gap-2">
          <Button onClick={handleUpgrade}>
            Upgrade
          </Button>
          <Button onClick={handleBack}>
            Back to Chat
          </Button>
        </div>
      </div>
    </div>
  );
}