"use client";

import { ReactNode, useMemo } from "react";
import { useConvexAuth } from "convex/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAction } from "convex/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { 
  MessageSquare, 
  Plus, 
  X, 
  User,
  Sparkles,
  Settings
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { Toaster } from "sonner";

export default function ChatLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const { signOut } = useAuthActions();
  const user = useQuery(api.chat.getUser);
  const deleteThread = useAction(api.chat.deleteThread);
  const threads = useQuery(
    api.chat.getThreads,
    { paginationOpts: { numItems: 50, cursor: null } }
  );

  const activeThreadId = useMemo(() => {
    if (!pathname) return null;
    const match = pathname.match(/\/chat\/(.+)$/);
    return match ? match[1] : null;
  }, [pathname]);

  return (
    <SidebarProvider className="h-full">
      <Toaster position="top-center" richColors />
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1">
            <Sparkles className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg group-data-[collapsible=icon]:hidden">Master Prompt</span>
          </div>
          <Button 
            asChild 
            className="w-full justify-start gap-2 bg-primary hover:bg-primary/90 text-primary-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
          >
            <Link href="/chat">
              <Plus className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">New Chat</span>
            </Link>
          </Button>
        </SidebarHeader>
        
        <Separator />
        
        <SidebarContent className="flex-1 overflow-hidden">
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/70 font-medium">
              Recent Chats
            </SidebarGroupLabel>
            <SidebarGroupContent>
              {!isAuthenticated ? (
                <div className="text-sm text-muted-foreground px-2 py-4">
                  Sign in to start chatting
                </div>
              ) : (
                <SidebarMenu>
                  {threads === undefined ? (
                    <div className="text-sm text-muted-foreground px-2 py-4" role="status" aria-label="Loading chats">
                      Loading chats...
                    </div>
                  ) : threads === null || threads.length === 0 ? (
                    <div className="text-sm text-muted-foreground px-2 py-4">
                      No chats yet
                    </div>
                  ) : (
                    threads.map((thread) => {
                      const isActive = activeThreadId === thread._id;
                      return (
                        <SidebarMenuItem key={thread._id}>
                          <SidebarMenuButton asChild isActive={isActive}>
                            <Link href={`/chat/${thread._id}`} className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4" />
                              <span className="truncate">
                                {thread.title ?? thread.summary ?? `Chat ${thread._id.slice(-6)}`}
                              </span>
                            </Link>
                          </SidebarMenuButton>
                          <SidebarMenuAction 
                            onClick={() => void deleteThread({ threadId: thread._id })}
                            className="opacity-0 group-hover/menu-item:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Delete chat: ${thread.title ?? thread.summary ?? `Chat ${thread._id.slice(-6)}`}`}
                          >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Delete chat</span>
                          </SidebarMenuAction>
                        </SidebarMenuItem>
                      );
                    })
                  )}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {user && (
          <>
            <Separator />
            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <ThemeToggle />
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link 
                      href={`/settings${activeThreadId ? `?returnChat=${activeThreadId}` : ''}`}
                      className="w-full justify-start gap-2"
                    >
                      <Settings className="h-4 w-4" />
                      <span className="group-data-[collapsible=icon]:hidden">Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    className="w-full justify-between" 
                    onClick={() => void signOut().then(() => router.push("/"))}
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span className="truncate">{user.name || user.email || "User"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Sign Out</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </>
        )}
      </Sidebar>
      
      <SidebarInset className="h-full flex flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </div>
        </header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}


