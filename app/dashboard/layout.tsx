import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-black/10 px-6 py-3 dark:border-white/10">
        <div className="flex items-center gap-6">
          <span className="font-semibold">TP News Intelligence</span>
          <nav className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
            <Link href="/dashboard" className="hover:text-black dark:hover:text-white">
              Runs
            </Link>
            <Link href="/dashboard/drafts" className="hover:text-black dark:hover:text-white">
              Drafts
            </Link>
            <Link href="/dashboard/clients" className="hover:text-black dark:hover:text-white">
              Clients
            </Link>
            <Link href="/dashboard/documents" className="hover:text-black dark:hover:text-white">
              Documents
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span>{user?.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 bg-zinc-50 p-6 dark:bg-black">{children}</main>
    </div>
  );
}
