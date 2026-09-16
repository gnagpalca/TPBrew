import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// RLS-respecting client for use in server components / route handlers on
// behalf of the signed-in manager.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll called from a Server Component with no writable cookie
            // store — safe to ignore when middleware refreshes sessions.
          }
        },
      },
    }
  );
}
