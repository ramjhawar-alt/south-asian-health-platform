"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { SavedChat } from "@/lib/use-chat-history";

interface SidebarProps {
  chats: SavedChat[];
  activeChatId: string | null;
  onNewChat: () => void;
  onSwitchChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function Sidebar({
  chats,
  activeChatId,
  onNewChat,
  onSwitchChat,
  onDeleteChat,
}: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col bg-[var(--sidebar-bg)] border-r border-[var(--card-border)] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[var(--card-border)] flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-[var(--primary)] flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">SA</span>
          </div>
          <span className="text-[var(--foreground)] font-semibold text-sm tracking-tight">
            Saved Chats
          </span>
        </div>
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-sm font-medium transition-colors shadow-sm cursor-pointer"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            className="w-3.5 h-3.5 flex-shrink-0"
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto py-2 px-2">
        {chats.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)] border border-[var(--accent-border)] flex items-center justify-center mx-auto mb-3">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="w-5 h-5 text-[var(--primary)]"
              >
                <path
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
              No chats yet.
              <br />
              Ask your first question!
            </p>
          </div>
        ) : (
          <>
            <p className="px-2 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--sidebar-muted)]">
              Recent
            </p>
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={cn(
                  "group relative my-0.5 rounded-lg cursor-pointer transition-all",
                  activeChatId === chat.id
                    ? "bg-[var(--sidebar-active)] border border-[var(--sidebar-active-border)]"
                    : "hover:bg-[var(--sidebar-hover)] border border-transparent"
                )}
                onMouseEnter={() => setHoveredId(chat.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => onSwitchChat(chat.id)}
              >
                <div className="px-3 py-2.5 pr-8">
                  <p
                    className={cn(
                      "text-sm truncate leading-snug font-medium",
                      activeChatId === chat.id
                        ? "text-[var(--primary)]"
                        : "text-[var(--foreground)]"
                    )}
                  >
                    {chat.title}
                  </p>
                  <p className="text-[10px] text-[var(--sidebar-muted)] mt-0.5">
                    {timeAgo(chat.updatedAt)}
                  </p>
                </div>

                {/* Delete button — visible on hover */}
                {hoveredId === chat.id && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-[var(--sidebar-muted)] hover:text-red-500 hover:bg-red-50 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChat(chat.id);
                    }}
                    title="Delete chat"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      className="w-3.5 h-3.5"
                    >
                      <path
                        d="M18 6L6 18M6 6l12 12"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-[var(--card-border)] flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          <p className="text-[10px] text-[var(--sidebar-muted)]">
            Evidence-based · South Asian focused
          </p>
        </div>
      </div>
    </aside>
  );
}
