"use client";
import { useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

export default function SuccessPage() {
  const sync = useAction(api.stripeActions.syncAfterSuccessForSelf);
  useEffect(() => {
    void (async () => {
      try {
        await sync({});
      } catch (e) {
        console.error("syncAfterSuccessForSelf failed", e);
      }
    })();
  }, []);
  return (
    <div>
      Success! Finalizing your subscription...
      <div>
        <Link href="/chat">Go to chat</Link>
      </div>
    </div>
  );
}