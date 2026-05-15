"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Navigation } from "@/components/navigation";

/**
 * Hides the global header on `/` (mandala home); all other routes keep the default nav.
 */
export function ConditionalChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showNav = pathname !== "/";

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--card)] focus:px-4 focus:py-2 focus:text-sm focus:shadow"
      >
        Skip to main content
      </a>
      {showNav && <Navigation />}
      <main
        id="main-content"
        className={cn("flex min-h-0 w-full flex-col", showNav ? "flex-1" : "min-h-[100dvh] flex-1")}
      >
        {children}
      </main>
    </>
  );
}
