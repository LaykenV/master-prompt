"use client";

import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { SunDim, Moon } from "lucide-react";
import { SidebarMenuButton } from "@/components/ui/sidebar";

// Theme toggle integrated with sidebar menu system
export default function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
  
    useEffect(() => setMounted(true), []);
  
    const toggle = () => {
      const isDark = (resolvedTheme ?? "dark") === "dark";
      setTheme(isDark ? "light" : "dark");
    };
  
    if (!mounted) {
      return (
        <SidebarMenuButton 
          onClick={toggle} 
          aria-label="Toggle theme" 
          title="Toggle theme"
          className="w-full justify-start gap-2"
        >
          <SunDim className="h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">Toggle Theme</span>
        </SidebarMenuButton>
      );
    }
  
    return (
      <SidebarMenuButton 
        onClick={toggle} 
        aria-label="Toggle theme" 
        title="Toggle theme"
        className="w-full justify-start gap-2 cursor-pointer"
      >
        {resolvedTheme === "dark" ? (
          <>
            <SunDim className="h-4 w-4" />
            <span className="group-data-[collapsible=icon]:hidden">Theme Toggle</span>
          </>
        ) : (
          <>
            <Moon className="h-4 w-4" />
            <span className="group-data-[collapsible=icon]:hidden">Theme Toggle</span>
          </>
        )}
      </SidebarMenuButton>
    );
  }