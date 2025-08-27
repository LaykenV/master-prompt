"use client";
import { useEffect, useMemo, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";

export default function SuccessPage() {
  const sync = useAction(api.stripeActions.syncAfterSuccessForSelf);

  const [progress, setProgress] = useState(12);
  const [statusIndex, setStatusIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const steps = useMemo(
    () => [
      "Syncing your subscription",
      "Verifying access",
      "Preparing your workspace",
      "Redirecting to chat",
    ],
    []
  );

  const runSync = async () => {
    setError(null);
    setProgress(14);
    setStatusIndex(0);
    let tick: ReturnType<typeof setInterval> | null = null;
    let stepper: ReturnType<typeof setInterval> | null = null;
    try {
      tick = setInterval(() => {
        setProgress((p) => Math.min(p + Math.random() * 5 + 1, 92));
      }, 240);
      stepper = setInterval(() => {
        setStatusIndex((i) => Math.min(i + 1, steps.length - 1));
      }, 1300);
      await sync({});
      if (tick) clearInterval(tick);
      if (stepper) clearInterval(stepper);
      setProgress(100);
      setStatusIndex(steps.length - 1);
    } catch (e) {
      if (tick) clearInterval(tick);
      if (stepper) clearInterval(stepper);
      console.error("syncAfterSuccessForSelf failed", e);
      setError(
        "We couldn't finalize your subscription automatically. Please try again."
      );
    }
  };

  useEffect(() => {
    void runSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full account-gradient">
      <div className="mx-auto max-w-4xl h-full flex flex-col">
        <main className="flex-1 overflow-auto px-4 sm:px-6 pb-10 pt-10">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="upgrade-card p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/40 bg-card"
                  aria-hidden
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-6 w-6 text-primary"
                  >
                    <path
                      fillRule="evenodd"
                      d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-2.59a.75.75 0 1 0-1.22-.92l-3.88 5.15-1.77-1.77a.75.75 0 1 0-1.06 1.06l2.4 2.4c.31.31.82.27 1.08-.08l4.45-5.84Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="upgrade-pill">Pro plan activated</span>
                    <span className="pill pill-success">Thank you!</span>
                  </div>
                  <h1 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
                    Success! Finalizing your subscription
                  </h1>
                  <p className="mt-2 text-muted-foreground">
                    This only takes a moment. You’ll be redirected as soon as
                    everything is ready.
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <div
                  className="upgrade-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress)}
                >
                  <div
                    className="upgrade-progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2 rounded-full bg-primary" aria-hidden />
                    <span>{steps[statusIndex]}</span>
                  </div>
                  <span>{Math.round(progress)}%</span>
                </div>
              </div>

              {error ? (
                <div className="mt-6 info-banner">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium text-foreground">
                        We hit a snag
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {error}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void runSync()}
                      className="toggle-btn"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 grid gap-3 sm:flex sm:items-center sm:justify-between">
                <Link href="/chat" className="btn-new-chat">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="h-5 w-5"
                    aria-hidden
                  >
                    <path d="M2.25 12a9.75 9.75 0 1 1 18.203 5.303c-.142.247-.172.546-.075.814l.82 2.252a.75.75 0 0 1-.948.96l-2.252-.82a1.25 1.25 0 0 0-.814.075A9.75 9.75 0 0 1 2.25 12Z" />
                  </svg>
                  Continue to chat
                </Link>
                <div className="flex gap-2 text-sm text-muted-foreground justify-center sm:justify-end">
                  <Link href="/account/subscription" className="badge-set-primary">
                    Manage subscription
                  </Link>
                  <Link href="/account/usage" className="badge-set-primary">
                    View usage
                  </Link>
                </div>
              </div>
            </div>

            <div className="section-card p-4">
              <div className="stats-row">
                <div className="stat-pill">
                  <div className="stat-pill-label">Plan</div>
                  <div className="stat-pill-value">Pro</div>
                </div>
                <div className="stat-pill">
                  <div className="stat-pill-label">Priority</div>
                  <div className="stat-pill-value">High</div>
                </div>
                <div className="stat-pill">
                  <div className="stat-pill-label">Status</div>
                  <div className="stat-pill-value">Active</div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}