"use client";
import { useAuthActions } from "@convex-dev/auth/react";

export default function AuthPage() {
  const { signIn } = useAuthActions();

  return (
    <div>
      <button onClick={() => signIn("google")}>Sign in with Google</button>
    </div>
  );
}