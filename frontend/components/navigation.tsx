"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/chat", label: "Research Q&A" },
  { href: "/assess", label: "Risk Assessment (soon)" },
  { href: "/simulate", label: "Simulator" },
  { href: "/conditions", label: "Conditions" },
  { href: "/resources", label: "Resources" },
] as const;

function LotusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M16 26 C16 26 8 20 8 14 C8 10 11.5 8 16 12 C20.5 8 24 10 24 14 C24 20 16 26 16 26Z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M16 24 C16 24 5 17 5 10 C5 7 8 5 16 10 C24 5 27 7 27 10 C27 17 16 24 16 24Z"
        fill="currentColor"
        opacity="0.4"
      />
      <circle cx="16" cy="13" r="2.5" fill="white" opacity="0.9" />
    </svg>
  );
}

export function Navigation() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const homeIsActive = pathname === "/";

  return (
    <header
      className="sticky top-0 z-50 border-b border-[var(--nav-border)] bg-[var(--nav-bg)] shadow-[0_1px_0_rgba(55,48,163,0.06),0_10px_40px_-24px_rgba(55,48,163,0.18)] backdrop-blur-xl backdrop-saturate-150"
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <Link
          href="/"
          className={cn(
            "group flex flex-shrink-0 items-center gap-2 rounded-xl px-0.5 py-0.5 transition-shadow",
            homeIsActive && "shadow-[0_0_0_1px_var(--nav-active-ring)]"
          )}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--primary)] to-indigo-800 shadow-[0_4px_14px_-4px_var(--nav-glow)] transition-transform group-hover:scale-[1.02]">
            <LotusIcon className="h-5 w-5 text-white" />
          </div>
          <span
            className={cn(
              "hidden text-[0.9rem] font-semibold tracking-tight [font-family:var(--font-fraunces),Georgia,serif] sm:block",
              "text-[var(--nav-foreground)]"
            )}
          >
            South Asian Health
          </span>
        </Link>

        <nav
          className="hidden min-w-0 flex-1 items-stretch justify-stretch gap-0.5 md:flex"
          aria-label="Main"
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex min-w-0 flex-1 items-center justify-center rounded-lg px-1.5 py-1.5 text-center text-xs font-medium leading-tight transition-all lg:px-2 lg:text-[0.8rem] xl:text-sm",
                isActive(link.href)
                  ? "bg-[var(--nav-active)] text-[var(--primary)] shadow-[inset_0_0_0_1px_var(--nav-active-ring)]"
                  : "text-[var(--nav-muted)] hover:bg-[var(--nav-surface)] hover:text-[var(--nav-foreground)]"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <button
          className="ml-auto flex rounded-lg p-2 text-[var(--nav-muted)] transition hover:bg-[var(--nav-surface)] hover:text-[var(--nav-foreground)] md:hidden"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
          type="button"
        >
          {menuOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {menuOpen && (
        <div className="space-y-1 border-t border-[var(--nav-border)] bg-[var(--nav-bg)] px-4 py-3 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(link.href)
                  ? "bg-[var(--nav-active)] text-[var(--primary)]"
                  : "text-[var(--nav-foreground)] hover:bg-[var(--nav-surface)]"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
