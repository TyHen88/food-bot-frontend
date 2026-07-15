"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, Bot, User, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { hapticImpact } from "@/lib/telegram";
import { useToast } from "@/components/ui/Toast";
import { TopBar, DesktopHeader } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/Card";
import { useAuth } from "@/contexts/AuthContext";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// Quick start suggestion prompts
const SUGGESTIONS = [
  "please count my order start from 2026-may-01 to today",
  "How many times did I order this month?",
  "What is my order history for last week?",
  "Can you list my orders in June 2026?",
];

// Helper component to render Telegram-style Markdown v1 safely
function TelegramMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  
  return (
    <div className="space-y-1.5 text-[14px] leading-relaxed" style={{ color: "var(--text)" }}>
      {lines.map((line, lineIdx) => {
        const isBullet = line.trim().startsWith("- ");
        const content = isBullet ? line.trim().slice(2) : line;

        const parts: React.ReactNode[] = [];
        let remaining = content;
        let tokenIdx = 0;

        while (remaining.length > 0) {
          const boldMatch = remaining.match(/\*([^*]+)\*/);
          const italicMatch = remaining.match(/_([^_]+)_/);

          if (!boldMatch && !italicMatch) {
            parts.push(remaining);
            break;
          }

          const boldIndex = boldMatch ? remaining.indexOf(boldMatch[0]) : Infinity;
          const italicIndex = italicMatch ? remaining.indexOf(italicMatch[0]) : Infinity;

          if (boldIndex < italicIndex) {
            if (boldIndex > 0) {
              parts.push(remaining.substring(0, boldIndex));
            }
            parts.push(<strong key={`b-${tokenIdx}`} className="font-semibold text-[var(--text)]">{boldMatch![1]}</strong>);
            remaining = remaining.substring(boldIndex + boldMatch![0].length);
          } else {
            if (italicIndex > 0) {
              parts.push(remaining.substring(0, italicIndex));
            }
            parts.push(<em key={`i-${tokenIdx}`} className="italic opacity-90">{italicMatch![1]}</em>);
            remaining = remaining.substring(italicIndex + italicMatch![0].length);
          }
          tokenIdx++;
        }

        if (isBullet) {
          return (
            <div key={lineIdx} className="flex gap-2 pl-1 my-0.5">
              <span className="text-[var(--color-primary)] select-none">•</span>
              <div className="flex-1">{parts}</div>
            </div>
          );
        }

        return (
          <p key={lineIdx} className="m-0 min-h-[1.25em]">
            {parts}
          </p>
        );
      })}
    </div>
  );
}

export default function AIPage() {
  const { profile, user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("fb_ai_chat");
      if (stored) {
        const parsed = JSON.parse(stored);
        setMessages(parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp)
        })));
      }
    } catch (_) {}
  }, []);

  // Save chat history to localStorage
  const saveMessages = (newMsgs: Message[]) => {
    setMessages(newMsgs);
    try {
      localStorage.setItem("fb_ai_chat", JSON.stringify(newMsgs));
    } catch (_) {}
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;
    hapticImpact("light");

    const userMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role: "user",
      content: textToSend.trim(),
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    saveMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const data = await api.post<{ response: string }>("/ai", {
        query: textToSend.trim()
      });

      const aiMessage: Message = {
        id: Math.random().toString(36).substring(7),
        role: "assistant",
        content: data?.response ?? "Sorry, no response received.",
        timestamp: new Date(),
      };

      saveMessages([...updatedMessages, aiMessage]);
    } catch (e: any) {
      toast(e.message || "Failed to call AI assistant", "error");
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    hapticImpact("medium");
    saveMessages([]);
  };

  const name = user?.first_name || profile?.full_name || "User";

  return (
    <>
      <TopBar
        title="AI Assistant"
        actions={
          messages.length > 0 && (
            <button
              onClick={clearChat}
              className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--surface-2)] text-red-500 border-0 bg-transparent cursor-pointer"
              aria-label="Clear chat"
            >
              <Trash2 size={16} />
            </button>
          )
        }
      />
      <main className="page-content flex flex-col h-[calc(100vh-var(--topbar-h)-var(--bottom-nav-h)-16px)] md:h-[calc(100vh-32px)]">
        <div className="hidden md:flex justify-between items-center mb-4">
          <DesktopHeader title="AI Assistant" subtitle="Ask questions about your order history" />
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="flex items-center gap-1.5 px-3 h-9 text-xs font-semibold rounded-[var(--radius-md)] border border-red-200/60 dark:border-red-900/30 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 bg-transparent cursor-pointer transition-colors"
            >
              <Trash2 size={13} />
              Clear Conversation
            </button>
          )}
        </div>

        {/* Chat window */}
        <Card variant="default" className="flex-1 flex flex-col overflow-hidden p-0 mb-4 h-full relative" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center overflow-y-auto">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-[var(--color-primary-light)] text-[var(--color-primary)]">
                <Sparkles size={24} className="animate-pulse" />
              </div>
              <h2 className="text-base font-bold mb-1" style={{ color: "var(--text)" }}>
                Ask Foodbot AI
              </h2>
              <p className="text-xs mb-6 max-w-sm" style={{ color: "var(--text-muted)" }}>
                Ask me to count or summarize your orders, check your past history, or even ask general culinary questions!
              </p>

              {/* Suggestions */}
              <div className="grid grid-cols-1 gap-2 w-full max-w-md">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="text-left text-xs p-3 rounded-[var(--radius-md)] border border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors bg-transparent text-[var(--text-2)] cursor-pointer"
                  >
                    "{s}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((m) => {
                const isAI = m.role === "assistant";
                return (
                  <div key={m.id} className={`flex gap-3 max-w-[85%] ${isAI ? "" : "ml-auto flex-row-reverse"}`}>
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: isAI ? "var(--color-primary-light)" : "var(--surface-2)",
                        color: isAI ? "var(--color-primary)" : "var(--text-2)",
                        border: `1px solid ${isAI ? "var(--color-primary-light)" : "var(--border)"}`,
                      }}
                    >
                      {isAI ? <Bot size={15} /> : <User size={15} />}
                    </div>

                    <div
                      className={`rounded-[var(--radius-lg)] px-4 py-3 text-sm shadow-sm ${
                        isAI
                          ? "rounded-tl-none border border-[var(--border)]"
                          : "rounded-tr-none text-white"
                      }`}
                      style={{
                        background: isAI ? "var(--surface)" : "var(--color-primary)",
                      }}
                    >
                      {isAI ? (
                        <TelegramMarkdown text={m.content} />
                      ) : (
                        <p className="m-0 leading-relaxed text-white text-[14px]">{m.content}</p>
                      )}
                      <span
                        className="block text-[9px] mt-1 text-right"
                        style={{ color: isAI ? "var(--text-muted)" : "rgba(255,255,255,0.7)" }}
                      >
                        {m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex gap-3 max-w-[80%]">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--color-primary-light)] text-[var(--color-primary)]">
                    <Bot size={15} />
                  </div>
                  <div className="rounded-[var(--radius-lg)] rounded-tl-none border border-[var(--border)] px-4 py-3 bg-[var(--surface)] text-sm shadow-sm flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Input field */}
          <div className="p-4 bg-[var(--surface)]" style={{ borderTop: "1px solid var(--border)" }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
              className="flex items-center gap-2 pl-4 pr-1.5 py-1 rounded-full border transition-all focus-within:border-[var(--color-primary)] focus-within:ring-1 focus-within:ring-[var(--color-primary)]"
              style={{
                backgroundColor: "var(--surface-2)",
                borderColor: "var(--border)",
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask AI something..."
                className="flex-1 h-9 bg-transparent border-0 text-sm focus:outline-none focus:ring-0"
                style={{
                  color: "var(--text)",
                }}
                disabled={loading}
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="w-8 h-8 flex items-center justify-center rounded-full border-0 text-white transition-all disabled:opacity-30 disabled:scale-100 cursor-pointer active:scale-95"
                style={{
                  background: "var(--color-primary)",
                }}
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </Card>
      </main>
    </>
  );
}
