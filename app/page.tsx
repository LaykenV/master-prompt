"use client";
import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";

export default function Home() {
  const { signIn } = useAuthActions();
  
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-bold">Mind Mesh</h1>
        <p className="text-lg opacity-80">Many Models, One Mind.</p>
        <div className="space-y-4">
          <Button onClick={() => signIn("google")} className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer">Sign in with Google</Button>
        </div>
      </div>
    </main>
  );
}

