"use client";

import { useCompletion } from "@ai-sdk/react";
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
  type GenerationItem,
  type Language,
  type Length,
  type Tone,
} from "@/lib/content";
import { useCallback, useEffect, useRef, useState } from "react";

type HistoryResponse = {
  items: GenerationItem[];
  usedThisHour: number;
  hourlyLimit: number;
  error?: string;
};

const fieldClass =
  "mt-1.5 w-full rounded-2xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-accent";

export function StudioApp({
  user,
}: {
  user: { name: string; email: string };
}) {
  const [type, setType] = useState<ContentType>("blog");
  const [tone, setTone] = useState<Tone>("professional");
  const [language, setLanguage] = useState<Language>("English");
  const [length, setLength] = useState<Length>("medium");
  const [prompt, setPrompt] = useState("");
  const [items, setItems] = useState<GenerationItem[]>([]);
  const [usedThisHour, setUsedThisHour] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [formError, setFormError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const wasLoading = useRef(false);
  const selectLatest = useRef(false);

  const { completion, complete, error, isLoading, setCompletion, stop } =
    useCompletion({
      api: "/api/generate",
    });

  const loadHistory = useCallback(async () => {
    const response = await fetch("/api/history");
    const data = (await response.json()) as HistoryResponse;
    if (!response.ok) {
      setHistoryError(data.error ?? "Could not load history.");
      return;
    }

    setHistoryError("");
    setItems(data.items);
    setUsedThisHour(data.usedThisHour);
    if (selectLatest.current) {
      setSelectedId(data.items[0]?.id ?? null);
      selectLatest.current = false;
    }
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

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const typeMeta = CONTENT_TYPES.find((item) => item.id === type);
  const shownError = formError || error?.message || "";
  const quotaLeft = Math.max(HOURLY_LIMIT - usedThisHour, 0);

  async function generate() {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) {
      setFormError("Add a prompt before generating.");
      return;
    }
    if (nextPrompt.length > MAX_PROMPT_LENGTH) {
      setFormError(
        `Keep the prompt under ${MAX_PROMPT_LENGTH.toLocaleString()} characters.`,
      );
      return;
    }

    setFormError("");
    setSelectedId(null);
    selectLatest.current = true;
    await complete(nextPrompt, {
      body: { type, tone, language, length },
    });
  }

  async function copyOutput() {
    if (!completion) return;
    try {
      await navigator.clipboard.writeText(completion);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setFormError("Could not copy. Select the text and copy it manually.");
    }
  }

  function openItem(item: GenerationItem) {
    setType(item.type);
    setTone(item.tone);
    setLanguage(item.language);
    setLength(item.length);
    setPrompt(item.prompt);
    setCompletion(item.output);
    setSelectedId(item.id);
    setFormError("");
    setPendingDeleteId(null);
  }

  async function removeItem(id: string) {
    const response = await fetch(`/api/history/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setHistoryError(data.error ?? "Could not delete that draft.");
      return;
    }

    if (selectedId === id) {
      setSelectedId(null);
      setCompletion("");
    }
    setPendingDeleteId(null);
    await loadHistory();
  }

  async function signOut() {
    await authClient.signOut();
    window.location.assign("/");
  }

  return (
    <div className="min-h-dvh bg-paper text-ink lg:grid lg:h-dvh lg:grid-rows-[auto_minmax(0,1fr)]">
      <header className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 sm:px-6">
        <div>
          <p className="font-serif text-xl tracking-tight">Text Studio</p>
          <p className="text-xs text-muted">{user.email}</p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-full border border-line px-3 py-1.5 text-sm"
        >
          Sign out
        </button>
      </header>

      <div className="lg:grid lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
        <form
          className="space-y-5 border-b border-line p-4 sm:p-5 lg:overflow-y-auto lg:border-r lg:border-b-0"
          onSubmit={(event) => {
            event.preventDefault();
            void generate();
          }}
        >
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

          <label className="block text-sm">
            <span className="text-muted">Prompt</span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={8}
              maxLength={MAX_PROMPT_LENGTH}
              placeholder={typeMeta?.hint}
              className={`${fieldClass} resize-y leading-6`}
            />
            <span className="mt-1 block text-xs text-muted">
              {prompt.length.toLocaleString()} / {MAX_PROMPT_LENGTH.toLocaleString()}
              {" · "}
              {quotaLeft} of {HOURLY_LIMIT} left this hour
            </span>
          </label>

          <button
            type="submit"
            disabled={isLoading}
            className="h-11 w-full rounded-full bg-accent text-sm font-medium text-white disabled:opacity-60"
          >
            {isLoading ? "Writing…" : "Generate"}
          </button>
        </form>

        <section className="flex min-h-[50vh] flex-col lg:min-h-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => void copyOutput()}
              disabled={!completion}
              className="rounded-full border border-line px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => void generate()}
              disabled={isLoading || !prompt.trim()}
              className="rounded-full border border-line px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Regenerate
            </button>
            {isLoading ? (
              <button
                type="button"
                onClick={stop}
                className="rounded-full border border-line px-3 py-1.5 text-sm"
              >
                Stop
              </button>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
            {shownError ? (
              <p className="mb-4 rounded-2xl bg-accent-soft px-3 py-2 text-sm text-accent" role="alert">
                {shownError}
              </p>
            ) : null}
            {completion ? (
              <article
                className="max-w-2xl font-serif text-lg leading-8 whitespace-pre-wrap"
                aria-live="polite"
              >
                {completion}
                {isLoading ? <span className="text-accent"> ▍</span> : null}
              </article>
            ) : (
              <p className="max-w-md text-muted">
                {isLoading
                  ? "Starting the draft…"
                  : "Your draft will appear here as it streams in."}
              </p>
            )}
          </div>

          <footer className="border-t border-line px-4 py-3 text-xs text-muted sm:px-6">
            {selected && !isLoading ? (
              <p>
                {formatTokens(selected.inputTokens)} input ·{" "}
                {formatTokens(selected.outputTokens)} output · estimated{" "}
                {formatCost(selected.estimatedCostUsd)} on {MODEL_LABEL}
              </p>
            ) : (
              <p>Token use and estimated cost appear after a draft is saved.</p>
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
          {items.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Saved drafts show up here.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((item) => {
                const label =
                  CONTENT_TYPES.find((entry) => entry.id === item.type)?.label ??
                  item.type;
                return (
                  <li key={item.id} className="rounded-2xl border border-line bg-card p-3">
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className="w-full text-left"
                    >
                      <span className="text-xs text-muted">
                        {label} · {formatWhen(item.createdAt)}
                      </span>
                      <span className="mt-1 block text-sm leading-5">
                        {preview(item.prompt)}
                      </span>
                    </button>
                    {pendingDeleteId === item.id ? (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void removeItem(item.id)}
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

function preview(value: string) {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

function formatWhen(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
