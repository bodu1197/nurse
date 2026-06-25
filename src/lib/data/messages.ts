import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

export type Conversation = { withId: string; withName: string; lastBody: string; lastAt: string };

export async function getConversations(): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("messages")
    .select("sender_id,recipient_id,sender_name,recipient_name,body,created_at")
    .order("created_at", { ascending: false });
  const seen = new Set<string>();
  const convs: Conversation[] = [];
  for (const m of data ?? []) {
    const mine = m.sender_id === user.id;
    const withId = mine ? m.recipient_id : m.sender_id;
    if (seen.has(withId)) continue;
    seen.add(withId);
    convs.push({ withId, withName: (mine ? m.recipient_name : m.sender_name) ?? "상대", lastBody: m.body, lastAt: m.created_at });
  }
  return convs;
}

export type Msg = { id: string; body: string; created_at: string; mine: boolean };

export async function getThread(withId: string): Promise<{ messages: Msg[]; withName: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isUuid(withId)) return { messages: [], withName: "" };
  // 문자열 보간 대신 파라미터 바인딩(.eq) 두 쿼리로 양방향 수집 — 필터 주입 원천 차단.
  const cols = "id,sender_id,recipient_id,sender_name,recipient_name,body,created_at";
  const [sent, recv] = await Promise.all([
    supabase.from("messages").select(cols).eq("sender_id", user.id).eq("recipient_id", withId),
    supabase.from("messages").select(cols).eq("sender_id", withId).eq("recipient_id", user.id),
  ]);
  const rows = [...(sent.data ?? []), ...(recv.data ?? [])].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const messages: Msg[] = rows.map((m) => ({ id: m.id, body: m.body, created_at: m.created_at, mine: m.sender_id === user.id }));
  let withName = "";
  for (const m of rows) {
    const cand = m.sender_id === withId ? m.sender_name : m.recipient_name;
    if (cand) { withName = cand; break; }
  }
  return { messages, withName };
}
