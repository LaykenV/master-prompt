import type { ReactNode } from "react";
import { cookies } from "next/headers";
import ChatLayout from "@/components/ChatLayout";

export default async function AppShellLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("sidebar_state")?.value;
  const initialSidebarOpen = raw === undefined ? true : raw === "true";
  return <ChatLayout initialSidebarOpen={initialSidebarOpen}>{children}</ChatLayout>;
}


