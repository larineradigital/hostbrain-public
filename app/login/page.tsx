import type { Metadata } from "next";
import { Suspense } from "react";

import { Logo } from "@/components/brand/logo";
import { safeNext } from "@/lib/auth";
import { copy } from "@/lib/copy";
import { readServerEnv } from "@/lib/env";

import { DemoLogin } from "./demo-login";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Host login" };

const LOCAL_MAILBOX = "http://127.0.0.1:54324";

async function LoginBody({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : undefined);
  const failed = params.error === "link";
  // Local Supabase delivers mail to Mailpit; link to it so local sign-in is one click.
  const mailboxUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1")
    ? LOCAL_MAILBOX
    : undefined;
  return (
    <>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          That sign-in link has expired or was already used. Request a new one below.
        </p>
      ) : null}
      {readServerEnv().DEMO_MODE && (
        <>
          <DemoLogin next={next} />
          <p className="text-center text-sm text-ink-muted">{copy.login.or}</p>
        </>
      )}
      <LoginForm next={next} mailboxUrl={mailboxUrl} />
    </>
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-16">
      <div className="flex flex-col gap-3">
        <Logo className="mb-4" />
        <h1 className="text-display">Sign in to your properties</h1>
        <p className="text-lg text-ink-muted">We&apos;ll email you a link. No password needed.</p>
      </div>
      <Suspense>
        <LoginBody {...props} />
      </Suspense>
    </main>
  );
}
