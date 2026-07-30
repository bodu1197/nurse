import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/data/user";
import { NOTICES } from "@/lib/customerContent";

export const metadata = {
  title: "공지사항 — 널스넷",
  description: "널스넷 공지사항. 서비스 변경과 점검 안내를 알려드립니다.",
  alternates: { canonical: "/notice" },
};

/**
 * 공지사항 — 구 널스넷 `/notice` 를 옮긴 것이다. 주소도 같으므로 옛 링크가 그대로 산다.
 *
 * 상세 페이지를 따로 두지 않고 **목록에서 본문까지 보여준다**. 글이 1건인데 목록 → 상세로
 * 한 번 더 누르게 할 이유가 없다. 옛 상세 주소(/notice/1259)는 여기로 돌린다(next.config.ts).
 */
export default async function NoticePage() {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <Link href="/customer" className="text-sm text-teal-700 hover:underline">← 고객센터</Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">공지사항</h1>
        <p className="mt-1 text-sm text-slate-500">전체 {NOTICES.length}건</p>

        {NOTICES.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
            등록된 공지가 없습니다.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {NOTICES.map((n) => (
              <article key={n.id} id={n.id} className="rounded-2xl border border-slate-200 bg-white p-6">
                <h2 className="font-bold text-slate-900">{n.title}</h2>
                <p className="mt-1 text-xs text-slate-400">
                  널스넷 운영팀 · <time dateTime={n.date}>{n.date.replace(/-/g, ".")}</time>
                </p>
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
                  {n.body.map((p) => <p key={p}>{p}</p>)}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
