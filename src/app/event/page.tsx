import Link from "next/link";
import Image from "next/image";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/data/user";
import { EVENTS } from "@/lib/customerContent";

export const metadata = {
  title: "이벤트 — 널스넷",
  description: "널스넷에서 진행했거나 진행 중인 이벤트를 확인하세요.",
  alternates: { canonical: "/event" },
};

/**
 * 이벤트 — 구 널스넷 `/event_board` 를 옮긴 것이다.
 *
 * 레거시 이벤트 글은 본문이 포스터 이미지 한 장뿐이라, 목록에서 포스터를 그대로 보여주고
 * 상세 페이지는 두지 않는다(공지사항과 같은 이유 — 누를 곳이 하나뿐인 목록은 목록이 아니다).
 *
 * 🔴 끝난 이벤트를 지우지 않고 '종료' 배지를 달아 남긴다. 지우면 그 이벤트를 보고 가입한 사람이
 *    나중에 확인할 방법이 없어지고, 검색으로 들어온 사람은 404 를 받는다.
 *    끝났다는 사실을 **글자로** 알려야 한다 — 포스터에는 종료 표시가 없다.
 */
export default async function EventPage() {
  const user = await getCurrentUser();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <Link href="/customer" className="text-sm text-teal-700 hover:underline">← 고객센터</Link>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">이벤트</h1>
        <p className="mt-1 text-sm text-slate-500">전체 {EVENTS.length}건</p>

        {EVENTS.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
            진행 중인 이벤트가 없습니다.
          </p>
        ) : (
          <ul className="mt-6 space-y-4">
            {EVENTS.map((e) => {
              const ended = e.endedAt < today;
              return (
                <li key={e.id} id={e.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-4">
                    <h2 className="font-bold text-slate-900">{e.title}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ended ? "bg-slate-100 text-slate-500" : "bg-teal-50 text-teal-700"}`}>
                      {ended ? "종료" : "진행 중"}
                    </span>
                    <time dateTime={e.date} className="ml-auto text-xs text-slate-400">{e.date.replace(/-/g, ".")}</time>
                  </div>
                  {/* 종료된 이벤트는 포스터를 흐리게 — 지금 신청할 수 있는 것처럼 보이지 않게 한다 */}
                  <Image
                    src={e.image}
                    alt={e.alt}
                    width={e.width}
                    height={e.height}
                    sizes="(max-width: 768px) 100vw, 768px"
                    className={`h-auto w-full ${ended ? "opacity-60" : ""}`}
                  />
                  {ended && (
                    <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
                      이 이벤트는 {e.endedAt.replace(/-/g, ".")} 종료되었습니다.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
