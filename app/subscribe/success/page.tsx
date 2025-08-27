"use client";
import { useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

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
  return <div>Success! Finalizing your subscription...</div>;
}