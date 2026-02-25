"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { Patient } from "@/lib/types";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

interface Source {
  document_id: string;
  filename: string;
  score: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  sources?: Source[];
}

interface ChatSession {
  id: number;
  created_at: string;
  first_message: string | null;
  message_count: number;
}

// Markdown component map — styles each element to look good inside the chat bubble
const mdComponents: Components = {
  p: ({ children }) => <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 text-sm">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 text-sm">{children}</ol>,
  li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h1 className="text-base font-semibold mb-1 mt-3 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold mb-1 mt-3 first:mt-0 text-gray-700">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-medium mb-1 mt-2 first:mt-0 text-gray-600">{children}</h3>,
  code: ({ children, className }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block bg-gray-200/70 rounded px-3 py-2 text-xs font-mono whitespace-pre-wrap overflow-x-auto">
          {children}
        </code>
      );
    }
    return <code className="bg-gray-200/70 rounded px-1 py-0.5 text-xs font-mono">{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="bg-gray-200/70 rounded p-3 text-xs font-mono overflow-x-auto mb-2 whitespace-pre-wrap">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-gray-400 pl-3 text-sm italic text-gray-600 mb-2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-gray-300 my-2" />,
  a: ({ href, children }) => (
    <a href={href} className="text-blue-600 underline hover:text-blue-800" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2">
      <table className="text-xs border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{children}</td>,
};

function SourceBadge({ source }: { source: Source }) {
  const pct = Math.round(source.score * 100);
  const label = source.filename
    .replace(/^patient-[^-]+-/, "")
    .replace(/-/g, " ")
    .replace(/\.txt$/, "");

  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-600"
      title={`${source.filename} — ${pct}% relevance`}
    >
      <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <span className="truncate max-w-[140px]">{label}</span>
      <span className="text-gray-400 flex-shrink-0">{pct}%</span>
    </span>
  );
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchPatient = useCallback(async () => {
    const res = await fetch(`/api/patients/${id}`);
    if (res.ok) {
      const data = await res.json();
      setPatient(data.patient);
    }
    setLoadingPatient(false);
  }, [id]);

  const fetchSessions = useCallback(async () => {
    const res = await fetch(`/api/chat?patient_id=${id}`);
    if (res.ok) {
      const data = await res.json();
      setSessions(data);
    }
  }, [id]);

  useEffect(() => {
    fetchPatient();
    fetchSessions();
  }, [fetchPatient, fetchSessions]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const userMessage = input.trim();
    setInput("");
    setSending(true);

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "", streaming: true }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: id, session_id: sessionId, message: userMessage }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let newSessionId = sessionId;
      let finalSources: Source[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              fullText += data.text;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: fullText,
                  streaming: true,
                };
                return updated;
              });
            }
            if (data.done) {
              newSessionId = data.session_id;
              setSessionId(data.session_id);
              finalSources = data.sources ?? [];
            }
          } catch {}
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: fullText,
          streaming: false,
          sources: finalSources,
        };
        return updated;
      });

      if (newSessionId !== sessionId) {
        fetchSessions();
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Sorry, an error occurred. Please try again.",
          streaming: false,
        };
        return updated;
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewSession = () => {
    setSessionId(null);
    setMessages([]);
    setShowSessions(false);
  };

  const SUGGESTED = [
    "Summarize this patient's active conditions",
    "What are the current medications and their indications?",
    "Are there any concerning lab results?",
    "What follow-up actions are recommended?",
    "Summarize the most recent clinical notes",
  ];

  if (loadingPatient) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex gap-5 h-[calc(100vh-8rem)]">
      {/* Sidebar */}
      <div className={`${showSessions ? "flex" : "hidden lg:flex"} flex-col w-64 flex-shrink-0`}>
        <div className="bg-white rounded-xl border border-gray-200 flex flex-col h-full overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <Link href={`/patients/${id}`} className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-700 text-xs font-semibold">
                  {patient?.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-600">
                  {patient?.name}
                </p>
                <p className="text-xs text-gray-400 font-mono">{patient?.mrn}</p>
              </div>
            </Link>
          </div>
          <div className="p-3 border-b border-gray-100">
            <button
              onClick={startNewSession}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <p className="text-xs font-medium text-gray-400 px-2 mb-2">Recent Chats</p>
            {sessions.length === 0 ? (
              <p className="text-xs text-gray-400 px-2">No previous sessions</p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSessionId(s.id);
                    setMessages([]);
                    setShowSessions(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors mb-1 ${
                    sessionId === s.id ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <p className="font-medium truncate">{s.first_message || "New session"}</p>
                  <p className="text-gray-400 mt-0.5">
                    {new Date(s.created_at).toLocaleDateString()} · {s.message_count} msgs
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSessions(!showSessions)}
              className="lg:hidden p-1.5 text-gray-400 hover:text-gray-600 rounded"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-sm font-medium text-gray-800">AI Assistant</span>
            </div>
            <span className="text-xs text-gray-400 hidden sm:block">
              claude-opus-4-6 · Tropicalia RAG
            </span>
          </div>
          <Link
            href={`/patients/${id}`}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </Link>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">Ask about {patient?.name}</h3>
              <p className="text-sm text-gray-400 mb-6 max-w-sm">
                The AI has full access to this patient&apos;s medical records, notes, vitals, and
                history via Tropicalia.
              </p>
              <div className="grid grid-cols-1 gap-2 w-full max-w-sm">
                {SUGGESTED.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(s);
                      textareaRef.current?.focus();
                    }}
                    className="text-left text-sm px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors text-gray-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                    </svg>
                  </div>
                )}

                <div className="max-w-[78%] flex flex-col gap-1.5">
                  <div
                    className={`rounded-xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {msg.content ? (
                      msg.role === "assistant" ? (
                        <>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={mdComponents}
                          >
                            {msg.content}
                          </ReactMarkdown>
                          {msg.streaming && (
                            <span className="inline-block w-0.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-middle" />
                          )}
                        </>
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                      )
                    ) : msg.streaming ? (
                      <div className="flex gap-1 items-center py-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                      </div>
                    ) : null}
                  </div>

                  {/* Tropicalia sources */}
                  {msg.role === "assistant" && !msg.streaming && msg.sources && msg.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-1">
                      <span className="text-xs text-gray-400 flex items-center gap-1 mr-0.5">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Sources
                      </span>
                      {msg.sources.map((src) => (
                        <SourceBadge key={src.document_id} source={src} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-gray-100 p-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1 border border-gray-200 rounded-xl bg-gray-50 focus-within:border-blue-400 focus-within:bg-white transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this patient..."
                rows={1}
                disabled={sending}
                className="w-full resize-none bg-transparent px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none max-h-32"
                style={{ minHeight: "44px" }}
              />
            </div>
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 px-1">
            Press Enter to send · Shift+Enter for new line · AI may make mistakes — always verify
            clinical information
          </p>
        </div>
      </div>
    </div>
  );
}
