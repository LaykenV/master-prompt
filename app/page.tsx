"use client";

import { useConvexAuth } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 bg-background p-4 border-b-2 border-slate-200 dark:border-slate-800 flex flex-row justify-between items-center">
        <h1 className="text-4xl font-bold text-center">
          MASTER PROMPT
        </h1>
        <SignOutButton />
      </header>
      <main className="p-8 flex flex-col gap-8 mx-auto max-w-2xl w-full">
        {/* chat interface */}
        <div className="flex flex-col gap-4 bg-slate-200 dark:bg-slate-800 p-4 rounded-md">
          <div className="flex flex-col gap-2 bg-slate-200 dark:bg-slate-800 p-4 rounded-md">
            <input className="bg-background text-foreground rounded-md p-2 border-2 border-slate-200 dark:border-slate-800" type="text" placeholder="Message" />
            <button className="bg-foreground text-background rounded-md px-2 py-1">Send</button>
          </div>
        </div>
      </main>
    </>
  );
}

function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <>
      {isAuthenticated ? (
        <button
          className="bg-slate-200 dark:bg-slate-800 text-foreground rounded-md px-2 py-1"
          onClick={() =>
            void signOut().then(() => {
              router.push("/signin");
            })
          }
        >
          Sign out
        </button>
      ) : (
        <button
          className="bg-slate-200 dark:bg-slate-800 text-foreground rounded-md px-2 py-1"
          onClick={() => router.push("/signin")}
        >
          Sign in
        </button>
      )}
    </>
  );
}

