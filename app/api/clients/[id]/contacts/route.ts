import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, email, role } = (await request.json()) as { name?: string; email?: string; role?: string };

  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .insert({ client_id: id, name, email, role })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
