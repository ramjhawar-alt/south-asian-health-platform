import { useState, useEffect, useCallback } from "react";
import type { ChatMessage } from "./api";

export interface SavedChat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "sah_chats";

function loadChats(): SavedChat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedChat[]) : [];
  } catch {
    return [];
  }
}

function persistChats(chats: SavedChat[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

export function useChatHistory() {
  const [chats, setChats] = useState<SavedChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setChats(loadChats());
  }, []);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  const createChat = useCallback((firstUserMessage: string): string => {
    const id = crypto.randomUUID();
    const title =
      firstUserMessage.length > 52
        ? firstUserMessage.slice(0, 52) + "…"
        : firstUserMessage;
    const now = Date.now();
    const newChat: SavedChat = {
      id,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setChats((prev) => {
      const updated = [newChat, ...prev];
      persistChats(updated);
      return updated;
    });
    setActiveChatId(id);
    return id;
  }, []);

  const updateChat = useCallback(
    (id: string, messages: ChatMessage[]): void => {
      setChats((prev) => {
        const updated = prev
          .map((c) =>
            c.id === id ? { ...c, messages, updatedAt: Date.now() } : c
          )
          .sort((a, b) => b.updatedAt - a.updatedAt);
        persistChats(updated);
        return updated;
      });
    },
    []
  );

  const deleteChat = useCallback((id: string): void => {
    setChats((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      persistChats(updated);
      return updated;
    });
    setActiveChatId((prev) => (prev === id ? null : prev));
  }, []);

  const switchChat = useCallback((id: string): void => {
    setActiveChatId(id);
  }, []);

  const newChat = useCallback((): void => {
    setActiveChatId(null);
  }, []);

  return {
    chats,
    activeChat,
    activeChatId,
    createChat,
    updateChat,
    deleteChat,
    switchChat,
    newChat,
  };
}
