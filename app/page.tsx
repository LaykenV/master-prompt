"use client";

import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export default function Home() {
  const { signIn } = useAuthActions();
  const router = useRouter();

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-bold">MASTER PROMPT</h1>
        <p className="text-lg opacity-80">Your AI chat workspace.</p>
        <div className="space-y-4">
          <Button onClick={() => void signIn("google").then(() => router.push("/chat"))}>
            Sign in with Google
          </Button>
        </div>
      </div>
    </main>
  );
}

