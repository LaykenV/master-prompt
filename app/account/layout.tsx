import React from "react";
import AccountTabs from "../../components/AccountTabs";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full account-gradient">
      <div className="mx-auto max-w-6xl h-full flex flex-col">
        <header className="account-header sticky top-0 z-10">
          <div className="px-4 sm:px-6 py-3">
            <AccountTabs />
          </div>
        </header>
        <main className="flex-1 overflow-auto px-4 sm:px-6 pb-8 pt-4">
          <div className="max-w-5xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}


