"use client";

import { MailCheck } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ next, mailboxUrl }: { next: string; mailboxUrl?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-2xl border bg-card p-6 shadow-card">
        <span
          className="flex size-11 items-center justify-center rounded-xl bg-brand-soft"
          aria-hidden
        >
          <MailCheck className="size-5 text-brand" />
        </span>
        <p className="font-semibold">Check your inbox</p>
        <p className="text-sm text-ink-muted">
          We sent a sign-in link to {state.email}. It works once and expires in an hour.
        </p>
        {mailboxUrl ? (
          <a
            className="text-sm text-brand underline"
            href={mailboxUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open the local test mailbox
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="text-sm font-semibold">
        Email
      </label>
      <Input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" size="lg" variant="ink" disabled={pending}>
        {pending ? "Sending…" : "Send me a sign-in link"}
      </Button>
    </form>
  );
}
