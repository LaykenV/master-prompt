"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";

export default function Home() {
  const user = useQuery(api.chat.getUser);
  const sendMessage = useAction(api.chat.basicChat);
  const threads = useQuery(
    api.chat.getThreads,
    user
      ? { userId: user._id, paginationOpts: { numItems: 10, cursor: null } }
      : "skip"
  );
  console.log(threads);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [isSending, setIsSending] = useState(false);

  const onSend = async () => {
    if (!input.trim() || isSending) return;
    const userMessage = { role: "user" as const, content: input };
    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);
    try {
      const reply = await sendMessage({ message: input, userId: user?._id ?? "" });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }] );
      setInput("");
    } finally {
      setIsSending(false);
    }
  };
  return (
    <>
      <header className="sticky top-0 z-10 bg-background p-4 border-b-2 border-slate-200 dark:border-slate-800 flex flex-row justify-between items-center">
        <h1 className="text-4xl font-bold text-center">
          MASTER PROMPT
        </h1>
        <SignOutButton />
      </header>
      <main className="p-8 flex flex-col gap-8 mx-auto max-w-2xl w-full">
        <div className="flex flex-col gap-4">
          {(threads ?? []).map((t) => (
            <div key={t._id} className="flex flex-row justify-between items-center">
              <div>{t._id ?? "Untitled"}</div>
              <button className="bg-red-500 text-white rounded-md px-2 py-1 cursor-pointer">x</button>
            </div>
          ))}
        </div>
        {/* chat interface */}
        <div className="flex flex-col gap-4 bg-slate-200 dark:bg-slate-800 p-4 rounded-md">
          <div className="flex flex-col gap-3 max-h-[50vh] overflow-auto">
            {messages.map((m, idx) => (
              <div key={idx} className={m.role === "user" ? "self-end bg-background text-foreground px-3 py-2 rounded-md" : "self-start bg-background/60 text-foreground px-3 py-2 rounded-md"}>
                <span className="opacity-60 mr-2">{m.role === "user" ? "You" : "Assistant"}:</span>
                {m.content}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 bg-slate-200 dark:bg-slate-800 p-4 rounded-md">
            <input
              className="bg-background text-foreground rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
              type="text"
              placeholder="Message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSend();
              }}
              disabled={isSending}
            />
            <button
              className="bg-foreground text-background rounded-md px-2 py-1 disabled:opacity-50"
              onClick={onSend}
              disabled={isSending || !input.trim()}
            >
              {isSending ? "Sending..." : "Send"}
            </button>
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

