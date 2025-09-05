"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { X, ChevronRight } from "lucide-react";
import { useState } from "react";

type AuthDialogProps = {
  open: boolean;
  onClose: () => void;
};

export default function AuthDialog({ open, onClose }: AuthDialogProps) {
  const { signIn } = useAuthActions();
  const [loading, setLoading] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="modal-card max-w-md w-full p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 sm:p-5 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold">Sign in to continue</h2>
          <button
            className="modal-close cursor-pointer"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 sm:p-6 space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Sign in to send messages, upload files, and personalize your experience.
            </p>
          </div>

          <button
            className="btn-oauth btn-oauth--google"
            onClick={() => {
              setLoading("google");
              void signIn("google");
            }}
            disabled={loading !== null}
          >
            <span className="oauth-icon">
              <svg viewBox="0 0 533.5 544.3" width="14" height="14" aria-hidden="true">
                <path fill="#4285F4" d="M533.5 278.4c0-17.4-1.6-34.1-4.6-50.4H272.1v95.3h147.1c-6.3 34-25 62.7-53.4 82v68h86.2c50.3-46.3 81.5-114.6 81.5-194.9z"/>
                <path fill="#34A853" d="M272.1 544.3c72.7 0 133.7-24.1 178.2-65.7l-86.2-68c-23.9 16.1-54.6 25.6-92 25.6-70.6 0-130.4-47.7-151.9-111.7h-90.6v70.2c44.1 87.6 136.2 149.6 242.5 149.6z"/>
                <path fill="#FBBC04" d="M120.2 324.5c-10.7-31.9-10.7-66.3 0-98.2V156H29.6C-8.2 229.2-8.2 315.3 29.6 388.5l90.6-64z"/>
                <path fill="#EA4335" d="M272.1 107.7c39.6-.6 77.5 14.6 106.3 41.8l79.1-79.1C403.1 25.1 340.7 0 272.1 0 165.8 0 73.7 62 29.6 149.6l90.6 70.2c21.4-64 81.2-112.1 151.9-112.1z"/>
              </svg>
            </span>
            <span>Continue with Google</span>
            <ChevronRight className="h-4 w-4" />
          </button>

          {/*<div className="text-xs text-muted-foreground text-center">
            By continuing, you agree to our <a className="underline" href="/terms">Terms</a> and <a className="underline" href="/privacy">Privacy Policy</a>.
          </div>*/}
        </div>
      </div>
    </div>
  );
}


