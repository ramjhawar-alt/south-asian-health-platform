"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Home", exact: true },
  { href: "/chat", label: "Research Q&A", exact: false },
  { href: "/assess", label: "Risk Assessment", exact: false },
  { href: "/simulate", label: "Simulator", exact: false },
  { href: "/conditions", label: "Conditions", exact: false },
];

function LotusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Stylised lotus: three petals */}
      <path d="M16 26 C16 26 8 20 8 14 C8 10 11.5 8 16 12 C20.5 8 24 10 24 14 C24 20 16 26 16 26Z" fill="currentColor" opacity="0.9" />
      <path d="M16 24 C16 24 5 17 5 10 C5 7 8 5 16 10 C24 5 27 7 27 10 C27 17 16 24 16 24Z" fill="currentColor" opacity="0.4" />
      <circle cx="16" cy="13" r="2.5" fill="white" opacity="0.9" />
    </svg>
  );
}

export function Navigation() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (link: typeof NAV_LINKS[0]) =>
    link.exact ? pathname === link.href : pathname.startsWith(link.href);

  return (
    <header className="border-b border-[var(--card-border)] bg-white sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center h-14 gap-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0 group">
          <div className="w-8 h-8 rounded-xl bg-[var(--primary)] flex items-center justify-center group-hover:bg-[var(--primary-hover)] transition-colors">
            <LotusIcon className="w-5 h-5 text-white" />
          </div>
          <span className="text-sm font-bold text-[var(--foreground)] hidden sm:block">
            South Asian Health
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                isActive(link)
                  ? "bg-[var(--sidebar-active)] text-[var(--primary)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop right side CTA */}
        <div className="hidden md:flex items-center gap-3 ml-auto">
          <Link
            href="/assess"
            className="px-3 py-1.5 rounded-lg bg-[var(--saffron)] text-white text-sm font-semibold hover:bg-[var(--saffron-hover)] transition-colors"
          >
            Check My Risk
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden ml-auto p-2 rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {menuOpen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden border-t border-[var(--card-border)] bg-white px-4 py-3 space-y-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
                isActive(link)
                  ? "bg-[var(--sidebar-active)] text-[var(--primary)]"
                  : "text-[var(--foreground)] hover:bg-[var(--muted)]"
              )}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-2 border-t border-[var(--card-border)]">
            <Link
              href="/assess"
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-center px-4 py-2.5 rounded-xl bg-[var(--saffron)] text-white text-sm font-semibold hover:bg-[var(--saffron-hover)] transition-colors"
            >
              Check My Risk →
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
