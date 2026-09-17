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
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-xs font-bold text-accent-foreground">
              TB
            </span>
            <span className="font-semibold tracking-tight">TPBrew</span>
          </div>
          <nav className="flex gap-5 text-sm text-muted">
            <NavLink href="/dashboard">Runs</NavLink>
            <NavLink href="/dashboard/news">News</NavLink>
            <NavLink href="/dashboard/opportunities">Opportunities</NavLink>
            <NavLink href="/dashboard/drafts">Drafts</NavLink>
            <NavLink href="/dashboard/clients">Clients</NavLink>
            <NavLink href="/dashboard/documents">Documents</NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>{user?.email}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1 bg-background p-6">{children}</main>
    </div>
  );
}
