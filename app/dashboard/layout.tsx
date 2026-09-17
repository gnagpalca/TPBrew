import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";
import NavLink from "./nav-link";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-semibold tracking-tight hover:text-accent">
            TPBrew
          </Link>
          <nav className="flex items-center gap-5 text-sm text-muted">
            <NavLink href="/dashboard">Dashboard</NavLink>
            <NavLink href="/dashboard/opportunities">Opportunities</NavLink>
            <NavLink href="/dashboard/drafts">Drafts</NavLink>
            <NavLink href="/dashboard/news">News</NavLink>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
            <NavLink href="/dashboard/clients">Clients</NavLink>
            <NavLink href="/dashboard/documents">Documents</NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted">
          <NavLink href="/dashboard/activity">Activity</NavLink>
          <span className="text-sm">{user?.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 bg-background p-6">{children}</main>
    </div>
  );
}
