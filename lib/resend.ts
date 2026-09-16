import { Resend } from "resend";

export const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

let client: Resend | null = null;

// Lazily constructed so the app still builds/deploys before RESEND_API_KEY
// is set — Resend's constructor throws immediately on a missing key, which
// would otherwise fail Next's build-time route analysis.
export function getResend(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}
