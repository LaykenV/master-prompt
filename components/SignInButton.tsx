"use client";

import { Button } from "@/components/ui/button";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export default function SignInButton() {
  const { signIn } = useAuthActions();
  const router = useRouter();

  const handleSignIn = async () => {
    await signIn("google");
    router.push("/chat");
  };

  return (
    <Button onClick={handleSignIn} className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer">
      Sign in with Google
    </Button>
  );
}
