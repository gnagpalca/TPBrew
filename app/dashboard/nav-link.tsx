"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`relative py-1 transition-colors ${
        active ? "text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      {children}
      {active && <span className="absolute -bottom-[13px] left-0 right-0 h-0.5 rounded-full bg-accent" />}
    </Link>
  );
}
