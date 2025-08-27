"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import React from "react";

export default function AccountTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const returnChat = searchParams.get("returnChat");

  const tabs: Array<{ href: string; label: string; key: string }> = [
    { href: "/account", label: "Account", key: "account" },
    { href: "/account/usage", label: "Usage", key: "usage" },
    { href: "/account/subscription", label: "Subscription", key: "subscription" },
  ];

  const withReturnChat = (href: string) => {
    if (!returnChat) return href;
    const url = new URL(href, "http://local");
    url.searchParams.set("returnChat", returnChat);
    return `${url.pathname}?${url.searchParams.toString()}`;
  };

  const isActive = (href: string) => {
    if (href === "/account") return pathname === "/account";
    return pathname?.startsWith(href);
  };



  return (
    <div className="flex items-center justify-center w-full px-2">
      <nav className="route-tabs floating-header max-w-full" aria-label="Account sections">
        <Link href={returnChat ? `/chat/${returnChat}` : "/chat"} className="route-tab text-xs sm:text-sm">
          <ArrowLeft className="h-4 w-4 flex-shrink-0" />
          <span className="truncate hidden sm:inline">Chat</span>
        </Link>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={withReturnChat(tab.href)}
            className={
              "route-tab text-xs sm:text-sm " + (isActive(tab.href) ? "route-tab--active" : "")
            }
          >
            <span className="truncate">{tab.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}


