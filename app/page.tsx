import { redirect } from "next/navigation";

// Middleware sends unauthenticated visitors to /login; anyone who reaches
// "/" is already signed in, so send them straight to the dashboard.
export default function Home() {
  redirect("/dashboard");
}
