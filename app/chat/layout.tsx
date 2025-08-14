"use client";

import { ReactNode, useMemo } from "react";
import { useConvexAuth } from "convex/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAction } from "convex/react";

export default function ChatLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const user = useQuery(api.chat.getUser);
  const deleteThread = useAction(api.chat.deleteThread);
  const threads = useQuery(
    api.chat.getThreads,
    user
      ? { userId: user._id, paginationOpts: { numItems: 50, cursor: null } }
      : "skip"
  );

  const activeThreadId = useMemo(() => {
    if (!pathname) return null;
    const match = pathname.match(/\/chat\/(.+)$/);
    return match ? match[1] : null;
  }, [pathname]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: "100vh" }}>
      <aside style={{ borderRight: "1px solid rgba(0,0,0,0.1)", padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong>Chats</strong>
          <Link href="/chat" prefetch>
            New Chat
          </Link>
        </div>
        {!isAuthenticated && (
          <div style={{ fontSize: 12, opacity: 0.7 }}>Sign in to start chatting.</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {(threads ?? []).map((t) => {
            const isActive = activeThreadId === t._id;
            return (
              <Link
                key={t._id}
                href={`/chat/${t._id}`}
                prefetch
                style={{
                  padding: 8,
                  borderRadius: 6,
                  textDecoration: "none",
                  background: isActive ? "rgba(0,0,0,0.06)" : "transparent",
                }}
              >
                {t.title ?? t.summary ?? t._id}
                <button onClick={() => void deleteThread({ threadId: t._id })}>x</button>
              </Link>
            );
          })}
          {threads === undefined && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>Loading…</div>
          )}
          {threads === null && user && (
            <div style={{ fontSize: 12, opacity: 0.6 }}>No threads yet.</div>
          )}
        </div>
      </aside>
      <section>{children}</section>
    </div>
  );
}


