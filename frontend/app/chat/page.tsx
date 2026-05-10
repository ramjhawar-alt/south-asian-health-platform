import { Suspense } from "react";
import ChatPageClient from "./chat-page-client";

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100vh-56px)] items-center justify-center text-sm text-[var(--muted-foreground)]">
          Loading…
        </div>
      }
    >
      <ChatPageClient />
    </Suspense>
  );
}
