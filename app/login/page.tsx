"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setVerifyError("");

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

    setVerifying(false);
    if (error) {
      setVerifyError(error.message);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
      <div className="w-full max-w-sm rounded-lg border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold">TP News Intelligence</h1>
        <p className="mt-1 text-sm text-zinc-500">Sign in with a magic link sent to your work email.</p>

        {status === "sent" ? (
          <div className="mt-6 flex flex-col gap-4">
            <p className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              Check {email} for a sign-in link.
            </p>

            <div className="border-t border-black/10 pt-4 dark:border-white/10">
              <p className="text-xs text-zinc-500">
                Link not working (some email providers pre-scan and expire it)? Enter the 6-digit code from the same
                email instead:
              </p>
              <form onSubmit={handleVerifyCode} className="mt-2 flex gap-2">
                <input
                  inputMode="numeric"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="flex-1 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10"
                />
                <button
                  type="submit"
                  disabled={verifying || !code}
                  className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {verifying ? "Verifying…" : "Verify"}
                </button>
              </form>
              {verifyError && <p className="mt-1 text-sm text-red-600">{verifyError}</p>}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="you@firm.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/30 dark:border-white/10"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-md bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {status === "error" && <p className="text-sm text-red-600">{errorMessage}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
