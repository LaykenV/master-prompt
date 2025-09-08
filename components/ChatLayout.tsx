"use client";

import { ReactNode, useMemo, useEffect, useState } from "react";
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
  useSidebar,
} from "@/components/ui/sidebar";

import { 
  MessageSquare, 
  X, 
  LogOut,
  Loader2,
  User,
} from "lucide-react";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { Toaster, toast } from "sonner";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { useThreadLoadingState } from "@/hooks/use-thread-loading-state";

export default function ChatLayout({
  children,
  initialSidebarOpen,
}: {
  children: ReactNode;
  initialSidebarOpen?: boolean;
}) {
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const { signOut, signIn } = useAuthActions();
  const user = useQuery(api.chat.getUser);
  const deleteThread = useAction(api.chat.deleteThread);
  const threads = useQuery(
    api.chat.getThreads,
    isAuthenticated ? { paginationOpts: { numItems: 50, cursor: null } } : "skip"
  );

  // Global generating thread ids for sidebar spinners
  const generatingIds = useQuery(
    api.chat.getGeneratingThreadIds,
    isAuthenticated ? {} : "skip"
  );
  const generatingSet = useMemo(() => new Set(generatingIds ?? []), [generatingIds]);
  const DATA_LOADING_TIMEOUT_MS = 15000;

  const [confirmDelete, setConfirmDelete] = useState<{
    threadId: string;
    label: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [threadsTimedOut, setThreadsTimedOut] = useState(false);

  const activeThreadId = useMemo(() => {
    if (!pathname) return null;
    const match = pathname.match(/\/chat\/(.+)$/);
    return match ? match[1] : null;
  }, [pathname]);

  const openDeleteDialog = (thread: {
    _id: string;
    title?: string | null;
    summary?: string | null;
  }) => {
    const label = thread.title ?? thread.summary ?? `Chat ${thread._id.slice(-6)}`;
    setConfirmDelete({ threadId: thread._id, label });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await deleteThread({ threadId: confirmDelete.threadId });
      if (activeThreadId === confirmDelete.threadId) {
        router.push("/");
      }
      toast.success("Chat deleted");
      setConfirmDelete(null);
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete chat");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && confirmDelete && !isDeleting) {
        setConfirmDelete(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, isDeleting]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (isAuthenticated && threads === undefined) {
      timeoutId = setTimeout(() => setThreadsTimedOut(true), DATA_LOADING_TIMEOUT_MS);
    } else {
      setThreadsTimedOut(false);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [threads, isAuthenticated]);

  return (
    <SidebarProvider className="h-full" defaultOpen={initialSidebarOpen}>
      <Toaster position="top-center" richColors />
      <Sidebar variant="inset" collapsible="icon" className="brand-sidebar">
        <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Image
            src="/image.png"
            alt="Mind Mesh"
            width={32}
            height={32}
          />
          <span className="font-semibold text-lg group-data-[collapsible=icon]:hidden text-primary font-bold text-xl">
            Mesh Mind
          </span>
        </div>
          <Link 
            href="/"
            className="btn-new-chat group-data-[collapsible=icon]:justify-center"
          >
            <span className="group-data-[collapsible=icon]:hidden">New Chat</span>
            <span className="hidden group-data-[collapsible=icon]:block">+</span>
          </Link>
        </SidebarHeader>
        
        <SidebarContent className="flex-1 overflow-hidden">
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/70 font-medium">
              Recent Chats
            </SidebarGroupLabel>
            <SidebarGroupContent className="chats-scroll max-h-[60vh]">
              {!isAuthenticated ? (
                <div className="text-sm text-muted-foreground px-2 py-4 group-data-[collapsible=icon]:hidden">
                  No chats yet
                </div>
              ) : (
                <SidebarMenu>
                  {threads === undefined ? (
                    threadsTimedOut ? (
                      <div className="text-sm text-muted-foreground px-2 py-4">
                        Unable to load chats. Please try again.
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground px-2 py-4" role="status" aria-label="Loading chats">
                        Loading chats...
                      </div>
                    )
                  ) : !threads || threads.length === 0 ? (
                    <div className="text-sm text-muted-foreground px-2 py-4">
                      No chats yet
                    </div>
                  ) : (
                    threads.map((thread) => (
                      <ThreadItem
                        key={thread._id}
                        thread={thread}
                        isActive={activeThreadId === thread._id}
                        generatingSet={generatingSet}
                        onDelete={() => openDeleteDialog(thread)}
                      />
                    ))
                  )}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <ThemeToggle />
            </SidebarMenuItem>
            {user ? (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link 
                      href={`/account${activeThreadId ? `?returnChat=${activeThreadId}` : ''}`}
                      className="w-full justify-start gap-2"
                    >
                      <User className="h-4 w-4" />
                      <span className="group-data-[collapsible=icon]:hidden">Account</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    className="w-full justify-start gap-2 hover:bg-destructive/70 hover:text-destructive-foreground cursor-pointer" 
                    onClick={() => void signOut().then(() => router.push("/"))}
                  >
                    <LogOut className="h-4 w-4" />
                    <span className="group-data-[collapsible=icon]:hidden">Sign Out</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            ) : (
              <SidebarMenuItem>
                <SidebarMenuButton 
                  className="w-full justify-start gap-2 cursor-pointer p-0"
                  onClick={() => void signIn("google")}
                >
                  <span className="w-full inline-flex items-center gap-2 btn-oauth btn-oauth--google">
                    <span className="oauth-icon">
                      <svg viewBox="0 0 533.5 544.3" width="14" height="14" aria-hidden="true">
                        <path fill="#4285F4" d="M533.5 278.4c0-17.4-1.6-34.1-4.6-50.4H272.1v95.3h147.1c-6.3 34-25 62.7-53.4 82v68h86.2c50.3-46.3 81.5-114.6 81.5-194.9z"/>
                        <path fill="#34A853" d="M272.1 544.3c72.7 0 133.7-24.1 178.2-65.7l-86.2-68c-23.9 16.1-54.6 25.6-92 25.6-70.6 0-130.4-47.7-151.9-111.7h-90.6v70.2c44.1 87.6 136.2 149.6 242.5 149.6z"/>
                        <path fill="#FBBC04" d="M120.2 324.5c-10.7-31.9-10.7-66.3 0-98.2V156H29.6C-8.2 229.2-8.2 315.3 29.6 388.5l90.6-64z"/>
                        <path fill="#EA4335" d="M272.1 107.7c39.6-.6 77.5 14.6 106.3 41.8l79.1-79.1C403.1 25.1 340.7 0 272.1 0 165.8 0 73.7 62 29.6 149.6l90.6 70.2c21.4-64 81.2-112.1 151.9-112.1z"/>
                      </svg>
                    </span>
                    <span className="group-data-[collapsible=icon]:hidden">Sign in with Google</span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
      
      <SidebarInset className="h-full flex flex-col brand-chat">
        {/* Mobile header */}
        <header className="md:hidden flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
          </div>
          <div>
            <Link 
              href="/"
              className="btn-new-chat w-10 h-10 p-0 flex items-center justify-center"
            >
              +
            </Link>
          </div>
        </header>
        
        {/* Desktop floating sidebar trigger */}
        <div className="hidden md:block absolute top-4 left-4 z-10">
          <SidebarTrigger className="bg-background/80 backdrop-blur-sm border border-border rounded-md shadow-lg hover:bg-background/90 transition-colors cursor-pointer" />
        </div>
        
        <main className="flex-1 overflow-hidden">{children}</main>
      </SidebarInset>
      {confirmDelete && (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!isDeleting) setConfirmDelete(null);
          }}
        >
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            aria-describedby="delete-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="delete-title" className="text-lg font-semibold">
                Delete chat?
              </h2>
              <Button
                variant="ghost"
                size="icon"
                className="modal-close cursor-pointer"
                onClick={() => setConfirmDelete(null)}
                disabled={isDeleting}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div id="delete-desc" className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete
              {" "}
              <span className="font-medium text-foreground">{confirmDelete.label}</span>?
              {" "}
              This action cannot be undone.
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={() => setConfirmDelete(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                className="btn-destructive px-3 py-2 rounded-md cursor-pointer"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SidebarProvider>
  );
}

function ThreadItem({ 
  thread, 
  isActive, 
  generatingSet,
  onDelete 
}: { 
  thread: { _id: string; title?: string | null; summary?: string | null };
  isActive: boolean;
  generatingSet: Set<string>;
  onDelete: () => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  // Local loading for active thread, global for inactive
  const localLoading = useThreadLoadingState(thread._id, isActive);
  const globalLoading = generatingSet.has(thread._id);
  const [globalTimedOut, setGlobalTimedOut] = useState(false);
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (globalLoading) {
      setGlobalTimedOut(false);
      timeoutId = setTimeout(() => setGlobalTimedOut(true), 350000);
    } else {
      setGlobalTimedOut(false);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [globalLoading]);
  const effectiveGlobalLoading = globalLoading && !globalTimedOut;
  const isLoading = isActive ? (localLoading || effectiveGlobalLoading) : effectiveGlobalLoading;
  const displayName = thread.title ?? thread.summary ?? `Chat ${thread._id.slice(-6)}`;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton 
        asChild 
        isActive={isActive}
        tooltip={displayName}
      >
        <Link 
          href={`/chat/${thread._id}`} 
          className="flex items-center gap-2"
          onClick={() => {
            if (isMobile) setOpenMobile(false);
          }}
        >
          {/* Show loading spinner when collapsed and loading, otherwise show chat icon */}
          <MessageSquare className={`h-4 w-4 ${isLoading ? 'group-data-[collapsible=icon]:hidden' : ''}`} />
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground hidden group-data-[collapsible=icon]:block" />
          )}
          <span className="truncate flex-1 group-data-[collapsible=icon]:hidden">
            {displayName}
          </span>
        </Link>
      </SidebarMenuButton>
      {isLoading ? (
        <SidebarMenuAction className="group-data-[collapsible=icon]:hidden">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </SidebarMenuAction>
      ) : (
        <SidebarMenuAction 
          onClick={onDelete}
          className="opacity-0 group-hover/menu-item:opacity-100 transition-opacity hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
          aria-label={`Delete chat: ${displayName}`}
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Delete chat</span>
        </SidebarMenuAction>
      )}
    </SidebarMenuItem>
  );
}


