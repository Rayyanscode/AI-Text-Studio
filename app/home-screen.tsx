"use client";

import { authClient } from "@/lib/auth-client";
import Link from "next/link";
import { FormEvent, useState } from "react";

const pieces = [
  "Blog posts",
  "Product descriptions",
  "Emails",
  "Summaries",
  "Social posts",
];

export function HomeScreen() {
  const { data: session, isPending } = authClient.useSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
          })
        : await authClient.signIn.email({
            email: email.trim(),
            password,
          });

    setSubmitting(false);

    if (result.error) {
      setError(result.error.message ?? "Could not sign in. Try again.");
      return;
    }

    window.location.assign("/studio");
  }

  return (
    <div className="min-h-full bg-paper text-ink">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <p className="font-serif text-xl tracking-tight">Text Studio</p>
        {session ? (
          <Link
            href="/studio"
            className="rounded-full bg-ink px-4 py-2 text-sm text-paper"
          >
            Open studio
          </Link>
        ) : null}
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-12 px-6 pb-20 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,420px)] lg:items-start">
        <section className="pt-6 lg:pt-16">
          <p className="text-sm font-medium tracking-[0.18em] text-accent uppercase">
            Writing desk
          </p>
          <h1 className="mt-4 max-w-xl font-serif text-5xl leading-[1.05] tracking-tight sm:text-6xl">
            Finished copy, streamed as it is written.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-muted">
            Draft blog posts, product descriptions, emails, summaries, and
            social posts. Set the tone, language, and length, then keep every
            draft in your history.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {pieces.map((piece) => (
              <li
                key={piece}
                className="rounded-full border border-line bg-card px-3 py-1.5 text-sm"
              >
                {piece}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl border border-line bg-card p-6 shadow-[0_20px_60px_rgba(28,23,18,0.06)]">
          {isPending ? (
            <p className="text-sm text-muted">Checking your session…</p>
          ) : session ? (
            <div>
              <h2 className="font-serif text-3xl tracking-tight">
                Welcome back, {session.user.name}
              </h2>
              <p className="mt-3 text-muted">
                Your drafts are saved to this account.
              </p>
              <Link
                href="/studio"
                className="mt-8 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-white"
              >
                Continue writing
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 rounded-full bg-paper p-1 text-sm">
                <button
                  type="button"
                  className={`rounded-full px-3 py-2 ${mode === "sign-up" ? "bg-ink text-paper" : "text-muted"}`}
                  onClick={() => {
                    setMode("sign-up");
                    setError("");
                  }}
                >
                  Create account
                </button>
                <button
                  type="button"
                  className={`rounded-full px-3 py-2 ${mode === "sign-in" ? "bg-ink text-paper" : "text-muted"}`}
                  onClick={() => {
                    setMode("sign-in");
                    setError("");
                  }}
                >
                  Sign in
                </button>
              </div>

              <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                {mode === "sign-up" ? (
                  <label className="block text-sm">
                    <span className="text-muted">Name</span>
                    <input
                      required
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="mt-1.5 w-full rounded-2xl border border-line bg-paper px-3 py-2.5 outline-none focus:border-accent"
                      autoComplete="name"
                    />
                  </label>
                ) : null}
                <label className="block text-sm">
                  <span className="text-muted">Email</span>
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-line bg-paper px-3 py-2.5 outline-none focus:border-accent"
                    autoComplete="email"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-muted">Password</span>
                  <input
                    required
                    type="password"
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-line bg-paper px-3 py-2.5 outline-none focus:border-accent"
                    autoComplete={
                      mode === "sign-up" ? "new-password" : "current-password"
                    }
                  />
                </label>
                {error ? (
                  <p className="rounded-2xl bg-accent-soft px-3 py-2 text-sm text-accent" role="alert">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-11 w-full rounded-full bg-accent text-sm font-medium text-white disabled:opacity-60"
                >
                  {submitting
                    ? "Please wait…"
                    : mode === "sign-up"
                      ? "Create account"
                      : "Sign in"}
                </button>
                <p className="text-xs leading-5 text-muted">
                  Passwords need at least 8 characters. Each account keeps its
                  own generation history.
                </p>
              </form>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
