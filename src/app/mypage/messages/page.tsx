import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SubmitButton from "@/components/SubmitButton";
import { getMyProfile } from "@/lib/data/user";
import { getConversations, getThread, isUuid } from "@/lib/data/messages";
import { sendMessage } from "../actions";

export const metadata = { title: "메시지 — 널스넷", robots: { index: false } };

const fmt = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export default async function MessagesPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ with?: string; name?: string; error?: string }> }>) {
  const p = await getMyProfile();
  if (!p) redirect("/login");
  const { with: withId, name, error } = await searchParams;

  // 스레드 보기
  if (withId && isUuid(withId)) {
    const { messages, withName } = await getThread(withId);
    const counterpart = withName || name || "상대";
    return (
      <>
        <SiteHeader user={{ displayName: p.displayName }} />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">
          <a href="/mypage/messages" className="text-sm text-teal-700 hover:underline">← 메시지 목록</a>
          <h1 className="mt-2 text-xl font-bold text-slate-900">{counterpart}</h1>

          <div className="mt-4 flex-1 space-y-2">
            {messages.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-400">첫 메시지를 보내보세요.</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${m.mine ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                    <p className="whitespace-pre-line">{m.body}</p>
                    <span className={`mt-0.5 block text-[10px] ${m.mine ? "text-teal-100" : "text-slate-400"}`}>{fmt(m.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {error === "1" && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">메시지 전송에 실패했습니다. 다시 시도해 주세요.</div>}
          <form action={sendMessage} className="mt-4 flex items-end gap-2">
            <input type="hidden" name="recipient_id" value={withId} />
            <input type="hidden" name="recipient_name" value={counterpart} />
            <textarea name="body" required rows={2} maxLength={2000} placeholder="메시지를 입력하세요" className="flex-1 resize-none rounded-xl border border-slate-300 p-3 text-base outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40" />
            <SubmitButton pendingText="전송 중…">전송</SubmitButton>
          </form>
        </main>
      </>
    );
  }

  // 대화 목록
  const convs = await getConversations();
  return (
    <>
      <SiteHeader user={{ displayName: p.displayName }} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
        <a href="/mypage" className="text-sm text-teal-700 hover:underline">← 마이페이지</a>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">메시지</h1>

        {convs.length === 0 ? (
          <p className="py-20 text-center text-slate-500">아직 대화가 없습니다.</p>
        ) : (
          <ul className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {convs.map((c) => (
              <li key={c.withId}>
                <a href={`/mypage/messages?with=${c.withId}`} className="block px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{c.withName}</span>
                    <span className="shrink-0 text-xs text-slate-400">{fmt(c.lastAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-slate-500">{c.lastBody}</p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
