import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 병원 자동완성 검색 (공개 HIRA 디렉터리). q≥2자, 최대 10건.
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const q = raw.replace(/[%,()]/g, "");
  if (q.length < 2) return NextResponse.json([]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hospitals")
    .select("id, name, region, address")
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(10);

  if (error) return NextResponse.json([]);
  return NextResponse.json(data ?? []);
}
