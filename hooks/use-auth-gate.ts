"use client";

import { useCallback, useState } from "react";
import { useConvexAuth } from "convex/react";

export function useAuthGate() {
  const { isAuthenticated } = useConvexAuth();
  const [authOpen, setAuthOpen] = useState(false);

  const ensureAuthed = useCallback(async (): Promise<boolean> => {
    if (isAuthenticated) return true;
    setAuthOpen(true);
    // We cannot reliably know success without a redirect in this simple helper.
    // Callers should either check isAuthenticated on next render or use replay-after-redirect via sessionStorage.
    return false;
  }, [isAuthenticated]);

  const withAuth = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      if (!isAuthenticated) {
        setAuthOpen(true);
        return undefined;
      }
      return await fn();
    },
    [isAuthenticated]
  );

  return { isAuthenticated, authOpen, setAuthOpen, ensureAuthed, withAuth };
}


