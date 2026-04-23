"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { streamChat, type ChatMessage, type Citation } from "@/lib/api";
import { useChatHistory } from "@/lib/use-chat-history";
import { CitationPanel } from "@/components/citation-panel";
import { Sidebar } from "@/components/sidebar";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Category-based suggested questions
// ---------------------------------------------------------------------------

const CATEGORIES = [
  {
    label: "Diabetes",
    icon: "🩸",
    color: "bg-red-50 border-red-200 text-red-700",
    questions: [
      "Why are South Asians at higher risk for type 2 diabetes at lower BMI?",
      "What are the recommended BMI thresholds for South Asian adults?",
    ],
  },
  {
    label: "Heart Health",
    icon: "❤️",
    color: "bg-rose-50 border-rose-200 text-rose-700",
    questions: [
      "How does cardiovascular disease risk differ in South Asians vs. white Europeans?",
      "What blood pressure targets are recommended for South Asian patients?",
    ],
  },
  {
    label: "Women's Health",
    icon: "🌸",
    color: "bg-pink-50 border-pink-200 text-pink-700",
    questions: [
      "How does PCOS present differently in South Asian women?",
      "What are the risks of gestational diabetes in South Asian pregnancies?",
    ],
  },
  {
    label: "Diet & Lifestyle",
    icon: "🌿",
    color: "bg-green-50 border-green-200 text-green-700",
    questions: [
      "What are the best dietary approaches for managing metabolic syndrome in South Asians?",
      "How does the traditional South Asian diet affect cardiometabolic risk?",
    ],
  },
];

// ---------------------------------------------------------------------------
// Markdown → HTML formatter
// ---------------------------------------------------------------------------

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(
      /\[(\d+)\]/g,
      '<sup class="text-[var(--primary)] font-semibold">[$1]</sup>'
    );
}

function formatAnswer(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];
  let inUl = false;
  let inOl = false;
  let paraLines: string[] = [];

  const flushPara = () => {
    if (paraLines.length === 0) return;
    const content = paraLines.join(" ").trim();
    if (content) output.push(`<p>${content}</p>`);
    paraLines = [];
  };

  const closeList = () => {
    if (inUl) { output.push("</ul>"); inUl = false; }
    if (inOl) { output.push("</ol>"); inOl = false; }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^### /.test(line)) { flushPara(); closeList(); output.push(`<h3>${inlineFormat(line.slice(4))}</h3>`); continue; }
    if (/^## /.test(line)) { flushPara(); closeList(); output.push(`<h2>${inlineFormat(line.slice(3))}</h2>`); continue; }
    if (/^# /.test(line)) { flushPara(); closeList(); output.push(`<h2>${inlineFormat(line.slice(2))}</h2>`); continue; }
    if (/^[-*•] /.test(line)) {
      flushPara();
      if (!inUl) { if (inOl) { output.push("</ol>"); inOl = false; } output.push("<ul>"); inUl = true; }
      output.push(`<li>${inlineFormat(line.replace(/^[-*•] /, ""))}</li>`);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      flushPara();
      if (!inOl) { if (inUl) { output.push("</ul>"); inUl = false; } output.push("<ol>"); inOl = true; }
      output.push(`<li>${inlineFormat(line.replace(/^\d+\. /, ""))}</li>`);
      continue;
    }
    if (line.trim() === "") { flushPara(); closeList(); continue; }
    closeList();
    paraLines.push(inlineFormat(line));
  }
  flushPara();
  closeList();
  return output.join("\n");
}

// ---------------------------------------------------------------------------
// Message components
// ---------------------------------------------------------------------------

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex gap-3 justify-end">
      <div className="max-w-[70%] rounded-2xl rounded-br-none px-4 py-3 text-sm bg-[var(--primary)] text-white shadow-sm">
        <p className="leading-relaxed">{content}</p>
      </div>
      <div className="w-8 h-8 rounded-full bg-[var(--muted)] border border-[var(--card-border)] flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-1 text-[var(--muted-foreground)]">
        You
      </div>
    </div>
  );
}

function AssistantBubble({
  content,
  citations,
  lowConfidence,
  streaming = false,
  numSources,
}: {
  content: string;
  citations?: Citation[];
  lowConfidence?: boolean;
  streaming?: boolean;
  numSources?: number;
}) {
  return (
    <div className="flex gap-3 justify-start">
      <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1">
        SA
      </div>
      <div className="flex-1 min-w-0 rounded-2xl rounded-bl-none px-5 py-4 bg-white border border-[var(--card-border)] shadow-sm">
        {/* Research badge */}
        {!streaming && numSources !== undefined && numSources > 0 && (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--sidebar-active)] border border-[var(--sidebar-active-border)] text-[11px] font-semibold text-[var(--primary)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Based on {numSources} research paper{numSources !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {lowConfidence && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 flex-shrink-0 mt-0.5">
              <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span><strong>Limited evidence coverage</strong> — the research library has weak coverage of this exact question. Treat this answer as general context and consult a healthcare provider.</span>
          </div>
        )}

        <div className="chat-answer" dangerouslySetInnerHTML={{ __html: formatAnswer(content) }} />

        {streaming && (
          <span className="inline-block w-1.5 h-4 bg-[var(--primary)] animate-pulse ml-0.5 rounded-sm align-middle" />
        )}

        {citations && citations.length > 0 && <CitationPanel citations={citations} />}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 justify-start">
      <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1">SA</div>
      <div className="rounded-2xl rounded-bl-none px-4 py-3 bg-white border border-[var(--card-border)] shadow-sm flex gap-1 items-center">
        <span className="w-2 h-2 rounded-full bg-[var(--muted-foreground)] animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-[var(--muted-foreground)] animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-[var(--muted-foreground)] animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function FollowUpChips({ questions, onAsk }: { questions: string[]; onAsk: (q: string) => void }) {
  if (!questions.length) return null;
  return (
    <div className="flex gap-3 justify-start">
      <div className="w-8 flex-shrink-0" />
      <div className="flex flex-wrap gap-2">
        {questions.map((q) => (
          <button
            key={q}
            onClick={() => onAsk(q)}
            className="text-xs px-3 py-1.5 rounded-full border border-[var(--sidebar-active-border)] bg-[var(--sidebar-active)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors font-medium"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main chat page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const { chats, activeChatId, createChat, updateChat, deleteChat, switchChat, newChat } = useChatHistory();
  const searchParams = useSearchParams();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamContent, setCurrentStreamContent] = useState("");
  const [followUpsByIndex, setFollowUpsByIndex] = useState<Record<number, string[]>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeChatIdRef = useRef<string | null>(activeChatId);
  activeChatIdRef.current = activeChatId;

  const prevActiveChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeChatId === prevActiveChatIdRef.current) return;
    prevActiveChatIdRef.current = activeChatId;
    const chat = chats.find((c) => c.id === activeChatId);
    setMessages(chat ? chat.messages : []);
    setCurrentStreamContent("");
    setFollowUpsByIndex({});
  }, [activeChatId, chats]);

  // Auto-submit if a ?q= query param is provided (e.g. from conditions pages)
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      handleSubmit(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentStreamContent]);

  const handleSubmit = useCallback(
    async (question: string) => {
      if (!question.trim() || isStreaming) return;

      const userMessage: ChatMessage = { role: "user", content: question };
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInput("");
      setIsStreaming(true);
      setCurrentStreamContent("");

      let chatId = activeChatIdRef.current;
      if (!chatId) {
        chatId = createChat(question);
        activeChatIdRef.current = chatId;
      }

      let fullContent = "";
      let finalCitations: Citation[] = [];
      let lowConfidence = false;
      let followUps: string[] = [];

      try {
        for await (const event of streamChat(question, messages)) {
          if (event.type === "token") {
            fullContent += event.content;
            setCurrentStreamContent(fullContent);
          } else if (event.type === "citations") {
            finalCitations = event.citations;
          } else if (event.type === "retrieval_info") {
            lowConfidence = event.info.low_confidence;
          } else if (event.type === "follow_ups") {
            followUps = event.questions;
          } else if (event.type === "error") {
            fullContent = `Error: ${event.message}`;
            setCurrentStreamContent(fullContent);
          }
        }
      } catch {
        fullContent = "Sorry, I encountered a connection error. Please ensure the backend server is running.";
        setCurrentStreamContent(fullContent);
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: fullContent,
        citations: finalCitations,
        retrieval_info: lowConfidence ? { expanded_queries: [], top_score: 0, low_confidence: true, num_candidates: 0 } : undefined,
      };

      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);
      setCurrentStreamContent("");
      setIsStreaming(false);

      const assistantIndex = finalMessages.length - 1;
      if (followUps.length > 0) {
        setFollowUpsByIndex((prev) => ({ ...prev, [assistantIndex]: followUps }));
      }

      if (chatId) updateChat(chatId, finalMessages);
    },
    [messages, isStreaming, createChat, updateChat]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(input); }
  };

  const handleNewChat = () => { newChat(); setMessages([]); setInput(""); setCurrentStreamContent(""); setFollowUpsByIndex({}); };

  const isEmpty = messages.length === 0 && !isStreaming;

  return (
    <div className="flex h-[calc(100vh-56px)]">
      <Sidebar chats={chats} activeChatId={activeChatId} onNewChat={handleNewChat} onSwitchChat={switchChat} onDeleteChat={deleteChat} />

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full px-6 gap-8 max-w-3xl mx-auto py-8">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-[var(--sidebar-active)] border border-[var(--sidebar-active-border)] flex items-center justify-center mx-auto mb-4">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-8 h-8 text-[var(--primary)]">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
                  South Asian Health Research Q&A
                </h1>
                <p className="text-[var(--muted-foreground)] text-sm leading-relaxed max-w-md mx-auto">
                  Ask any health question. Every answer is grounded in peer-reviewed research with specific attention to how conditions present in South Asian populations.
                </p>
              </div>

              {/* Category grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {CATEGORIES.map((cat) => (
                  <div key={cat.label} className="bg-white border border-[var(--card-border)] rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">{cat.icon}</span>
                      <span className="text-sm font-semibold text-[var(--foreground)]">{cat.label}</span>
                    </div>
                    <div className="space-y-2">
                      {cat.questions.map((q) => (
                        <button
                          key={q}
                          onClick={() => handleSubmit(q)}
                          className="w-full text-left text-xs px-3 py-2 rounded-lg border border-[var(--card-border)] bg-[var(--muted)] hover:bg-[var(--accent)] hover:border-[var(--accent-border)] transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)] leading-relaxed"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <Link
                href="/assess"
                className="flex items-center gap-2 text-sm text-[var(--primary)] border border-[var(--sidebar-active-border)] bg-[var(--sidebar-active)] px-4 py-2 rounded-xl hover:bg-[var(--primary)] hover:text-white transition-colors font-medium"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Or check your personal health risk →
              </Link>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
              {messages.map((msg, i) =>
                msg.role === "user" ? (
                  <UserBubble key={i} content={msg.content} />
                ) : (
                  <div key={i} className="space-y-2">
                    <AssistantBubble
                      content={msg.content}
                      citations={msg.citations}
                      lowConfidence={msg.retrieval_info?.low_confidence}
                      numSources={msg.citations?.length}
                    />
                    {followUpsByIndex[i] && (
                      <FollowUpChips questions={followUpsByIndex[i]} onAsk={handleSubmit} />
                    )}
                  </div>
                )
              )}

              {isStreaming && currentStreamContent && (
                <AssistantBubble content={currentStreamContent} streaming={true} />
              )}
              {isStreaming && !currentStreamContent && <TypingIndicator />}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-[var(--card-border)] bg-white px-6 py-3 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex gap-2 items-end rounded-2xl border border-[var(--card-border)] bg-[var(--muted)] px-4 py-2 focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary)]/20 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question about South Asian health…"
                rows={1}
                className="flex-1 bg-transparent resize-none outline-none text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] max-h-32 overflow-auto"
                style={{ fieldSizing: "content" } as React.CSSProperties}
              />
              <button
                onClick={() => handleSubmit(input)}
                disabled={!input.trim() || isStreaming}
                className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center transition-all flex-shrink-0",
                  input.trim() && !isStreaming
                    ? "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]"
                    : "bg-[var(--card-border)] text-[var(--muted-foreground)] cursor-not-allowed"
                )}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
                  <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M22 2L15 22l-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p className="text-center text-xs text-[var(--muted-foreground)] mt-2">
              For educational purposes only. Not a substitute for professional medical advice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
