"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { authClient } from "@/lib/auth-client";
import {
  CONTENT_TYPES,
  HOURLY_LIMIT,
  LANGUAGES,
  LENGTHS,
  MAX_PROMPT_LENGTH,
  MODEL_LABEL,
  TONES,
  formatCost,
  formatTokens,
  type ContentType,
  type Language,
  type Length,
  type Tone,
} from "@/lib/content";
import type { ConversationItem } from "@/lib/conversations";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HistoryResponse = {
  items: ConversationItem[];
  usedThisHour: number;
  hourlyLimit: number;
  error?: string;
};

const fieldClass =
  "mt-1.5 w-full rounded-2xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-accent";

function newConversationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function messageText(message: UIMessage) {
  return (message.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

export function StudioApp({
  user,
}: {
  user: { name: string; email: string };
}) {
  const [type, setType] = useState<ContentType>("blog");
  const [tone, setTone] = useState<Tone>("professional");
  const [language, setLanguage] = useState<Language>("English");
  const [length, setLength] = useState<Length>("medium");
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string>(newConversationId);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [usedThisHour, setUsedThisHour] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [formError, setFormError] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const wasLoading = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/generate" }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages, regenerate, error } =
    useChat({ transport });

  const isLoading = status === "submitted" || status === "streaming";

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/history");
    const data = (await response.json()) as HistoryResponse;
    if (!response.ok) {
      setHistoryError(data.error ?? "Could not load history.");
      return;
    }

    setHistoryError("");
    setConversations(data.items);
    setUsedThisHour(data.usedThisHour);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadHistory();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadHistory]);

  useEffect(() => {
    if (wasLoading.current && !isLoading) {
      void loadHistory();
    }
    wasLoading.current = isLoading;
  }, [isLoading, loadHistory]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, isLoading]);

  const typeMeta = CONTENT_TYPES.find((item) => item.id === type);
  const shownError = formError || error?.message || "";
  const quotaLeft = Math.max(HOURLY_LIMIT - usedThisHour, 0);

  const activeConversation = conversations.find(
    (item) => item.clientId === conversationId,
  );
  const lastAssistant = [...(activeConversation?.messages ?? [])]
    .reverse()
    .find((item) => item.role === "assistant" && item.inputTokens !== undefined);

  function send() {
    const text = input.trim();
    if (!text) {
      setFormError("Write a message before sending.");
      return;
    }
    if (text.length > MAX_PROMPT_LENGTH) {
      setFormError(
        `Keep each message under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`,
      );
      return;
    }
    if (isLoading) return;

    setFormError("");
    setInput("");
    void sendMessage(
      { text },
      { body: { type, tone, language, length, conversationId } },
    );
  }

  function newChat() {
    stop();
    setMessages([]);
    setConversationId(newConversationId());
    setInput("");
    setFormError("");
    setPendingDeleteId(null);
  }

  function openConversation(item: ConversationItem) {
    stop();
    setType(item.type);
    setTone(item.tone);
    setLanguage(item.language);
    setLength(item.length);
    setConversationId(item.clientId);
    setMessages(
      item.messages.map((message, index) => ({
        id: `${item.id}-${index}`,
        role: message.role,
        parts: [{ type: "text" as const, text: message.text }],
      })),
    );
    setInput("");
    setFormError("");
    setPendingDeleteId(null);
  }

  async function copyMessage(id: string, text: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(
        () => setCopiedId((current) => (current === id ? null : current)),
        1600,
      );
    } catch {
      setFormError("Could not copy. Select the text and copy it manually.");
    }
  }

  async function removeConversation(id: string, clientId: string) {
    const response = await fetch(`/api/history/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setHistoryError(data.error ?? "Could not delete that chat.");
      return;
    }

    if (clientId === conversationId) {
      newChat();
    }
    setPendingDeleteId(null);
    await loadHistory();
  }

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/");
  }

  const lastMessageId = messages[messages.length - 1]?.id;

  return (
    <div className="min-h-dvh bg-paper text-ink lg:grid lg:h-dvh lg:grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-6">
        <div>
          <p className="font-serif text-xl tracking-tight">Text Studio</p>
          <p className="text-xs text-muted">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={newChat}
            className="rounded-full border border-line px-3 py-1.5 text-sm"
          >
            New chat
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-full border border-line px-3 py-1.5 text-sm"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="lg:grid lg:min-h-0 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
        <aside className="space-y-5 border-b border-line p-4 sm:p-5 lg:overflow-y-auto lg:border-r lg:border-b-0">
          <fieldset>
            <legend className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
              Type
            </legend>
            <div className="mt-2 grid gap-2">
              {CONTENT_TYPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={type === item.id}
                  onClick={() => setType(item.id)}
                  className={`rounded-2xl border px-3 py-2 text-left text-sm ${
                    type === item.id
                      ? "border-ink bg-ink text-paper"
                      : "border-line bg-card"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-muted">Tone</span>
              <select
                className={fieldClass}
                value={tone}
                onChange={(event) => setTone(event.target.value as Tone)}
              >
                {TONES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted">Length</span>
              <select
                className={fieldClass}
                value={length}
                onChange={(event) => setLength(event.target.value as Length)}
              >
                {LENGTHS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-muted">Language</span>
            <select
              className={fieldClass}
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              {LANGUAGES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <p className="rounded-2xl border border-line bg-card p-3 text-xs leading-5 text-muted">
            These controls shape every reply. Change them anytime, then ask for
            a revision in the chat.
          </p>
        </aside>

        <section className="flex min-h-[60vh] flex-col lg:min-h-0">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <h1 className="font-serif text-2xl text-ink">
                  What should we write?
                </h1>
                <p className="mt-2 max-w-sm text-sm text-muted">
                  Start a conversation below. Reply again to refine the draft —
                  the chat keeps the full context.
                </p>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-2xl space-y-6">
                {messages.map((message) => {
                  const text = messageText(message);
                  const isUser = message.role === "user";
                  const isLast = message.id === lastMessageId;

                  if (isUser) {
                    return (
                      <div key={message.id} className="flex justify-end">
                        <div className="max-w-[85%] rounded-3xl rounded-br-md bg-accent-soft px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap">
                          {text}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={message.id} className="space-y-2">
                      <article className="font-serif text-lg leading-8 whitespace-pre-wrap">
                        {text}
                        {isLast && isLoading ? (
                          <span className="text-accent"> ▍</span>
                        ) : null}
                      </article>
                      {text && !(isLast && isLoading) ? (
                        <div className="flex gap-3 text-xs text-muted">
                          <button
                            type="button"
                            onClick={() => void copyMessage(message.id, text)}
                            className="hover:text-ink"
                          >
                            {copiedId === message.id ? "Copied" : "Copy"}
                          </button>
                          {isLast ? (
                            <button
                              type="button"
                              onClick={() =>
                                void regenerate({
                                  body: {
                                    type,
                                    tone,
                                    language,
                                    length,
                                    conversationId,
                                  },
                                })
                              }
                              className="hover:text-ink"
                            >
                              Regenerate
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {status === "submitted" ? (
                  <p className="text-sm text-muted">Starting the draft…</p>
                ) : null}
              </div>
            )}
          </div>

          <div className="border-t border-line px-4 py-4 sm:px-6">
            <form
              className="mx-auto w-full max-w-2xl"
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              {shownError ? (
                <p
                  className="mb-2 rounded-2xl bg-accent-soft px-3 py-2 text-sm text-accent"
                  role="alert"
                >
                  {shownError}
                </p>
              ) : null}
              <div className="rounded-3xl border border-line bg-card p-2 focus-within:border-accent">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send();
                    }
                  }}
                  rows={2}
                  maxLength={MAX_PROMPT_LENGTH}
                  placeholder={
                    messages.length === 0
                      ? typeMeta?.hint
                      : "Ask for a change, or write a new request…"
                  }
                  className="max-h-48 min-h-[44px] w-full resize-y bg-transparent px-2 py-1.5 text-sm leading-6 outline-none"
                />
                <div className="flex items-center justify-between gap-2 px-1 pt-1">
                  <span className="text-xs text-muted">
                    {input.length.toLocaleString()} /{" "}
                    {MAX_PROMPT_LENGTH.toLocaleString()} · {quotaLeft} of{" "}
                    {HOURLY_LIMIT} left this hour
                  </span>
                  {isLoading ? (
                    <button
                      type="button"
                      onClick={stop}
                      className="rounded-full border border-line px-4 py-1.5 text-sm"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim()}
                      className="rounded-full bg-accent px-5 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Send
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>

          <footer className="border-t border-line px-4 py-3 text-xs text-muted sm:px-6">
            {lastAssistant && !isLoading ? (
              <p>
                {formatTokens(lastAssistant.inputTokens ?? 0)} input ·{" "}
                {formatTokens(lastAssistant.outputTokens ?? 0)} output ·
                estimated {formatCost(lastAssistant.estimatedCostUsd ?? 0)} on{" "}
                {MODEL_LABEL}
              </p>
            ) : (
              <p>Token use and estimated cost appear after each reply.</p>
            )}
          </footer>
        </section>

        <aside className="border-t border-line p-4 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <h2 className="text-xs font-medium tracking-[0.16em] text-muted uppercase">
            History
          </h2>
          {historyError ? (
            <p className="mt-3 text-sm text-accent" role="alert">
              {historyError}
            </p>
          ) : null}
          {conversations.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Saved chats show up here.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {conversations.map((item) => {
                const label =
                  CONTENT_TYPES.find((entry) => entry.id === item.type)?.label ??
                  item.type;
                const active = item.clientId === conversationId;
                return (
                  <li
                    key={item.id}
                    className={`rounded-2xl border bg-card p-3 ${
                      active ? "border-ink" : "border-line"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => openConversation(item)}
                      className="w-full text-left"
                    >
                      <span className="text-xs text-muted">
                        {label} · {formatWhen(item.updatedAt)}
                      </span>
                      <span className="mt-1 block text-sm leading-5">
                        {item.title}
                      </span>
                    </button>
                    {pendingDeleteId === item.id ? (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void removeConversation(item.id, item.clientId)
                          }
                          className="text-xs text-accent"
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(null)}
                          className="text-xs text-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(item.id)}
                        className="mt-2 text-xs text-muted"
                      >
                        Delete
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
