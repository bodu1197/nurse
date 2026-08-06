import Link from "next/link";
import HospitalShell from "@/components/HospitalShell";
import TalentCard from "@/components/TalentCard";
import Button from "@/components/Button";
import { SaveIcon } from "@/components/JobDetail";
import { requireProfile } from "@/lib/data/user";
import { getSavedTalents, revealContacts, canRevealContacts, type RevealedContact } from "@/lib/data/talent";
import { toggleSaveTalent, saveTalentMemo } from "@/app/talent/actions";
import { fmtDay } from "@/lib/date";

export const metadata = { title: "찜한 간호사 — 널스넷", robots: { index: false } };
// 찜은 방금 누른 것이 바로 보여야 한다.
export const dynamic = "force-dynamic";

/**
 * 💾 찜한 간호사 — 병원이 인재 검색 중 담아 둔 후보를 다시 본다(오너 지시 2026-08-07:
 * "검색 도중 후보군을 저장해서 마이페이지에서 검토할 수 있어야 한다").
 *
 * 🔴 검색은 **찜한 것 안에서만** 돈다(getSavedTalents). 전체 인재를 뒤진 뒤 교집합을 내면
 *    상한에 걸려 정작 내가 찜한 사람이 조용히 빠진다.
 * 🔴 이름·연락처는 여기서도 광고 중인 병원에게만 열린다 — 찜했다고 게이트가 풀리지 않는다.
 *    담아 두는 것과 연락하는 것은 다른 일이다.
 */
export default async function SavedTalentPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string }> }>) {
  const p = await requireProfile("/mypage/saved-talent", "hospital");
  const q = (await searchParams).q ?? "";

  const { rows, closed, truncated } = await getSavedTalents(q);
  const canSeeContacts = await canRevealContacts(p);
  // 연락처는 **지금도 공개 중인 사람**에게만 붙는다(revealContacts 가 is_public 을 한 번 더 본다).
  const live = rows.filter((r) => r.talent);
  const contacts = canSeeContacts && live.length
    ? await revealContacts(live.map((r) => r.talentId))
    : new Map<string, RevealedContact>();

  const here = `/mypage/saved-talent${q ? `?q=${encodeURIComponent(q)}` : ""}`;

  return (
    <HospitalShell displayName={p.displayName} active="/mypage/saved-talent">
      <h1 className="mt-3 text-2xl font-bold text-slate-900">찜한 간호사</h1>
      <p className="mt-1 text-sm text-slate-500">
        인재정보에서 찜한 후보입니다. 찜한 순서로 보이고, 이력서 제목·지역·근무부서·내 메모로 좁혀 찾을 수 있습니다.
      </p>

      {/* 🔔 **통보** — 찜해 둔 사이 이력서를 내린 사람이 있으면 맨 위에서 먼저 말한다.
          오너 지시 2026-08-07: "비공개로 내리면 병원에도 통보가 되어야 헛발짓을 안 한다."
          목록 아래쪽에만 표시하면 위에서부터 연락을 돌리다 뒤늦게 알게 된다. */}
      {closed > 0 && (
        <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">
          찜해 두신 후보 중 <b>{closed.toLocaleString()}명</b>이 이력서를 내렸습니다 — 지금은 구직 중이 아닙니다.
          <span className="mt-0.5 block text-sm">연락하셔도 닿지 않을 수 있습니다. 아래 목록에서 회색으로 표시했습니다.</span>
        </p>
      )}

      {/* 🔴 500명을 넘겨 잘렸으면 그 사실을 말한다 — 조용히 자르면 "다 봤다" 고 착각한다. */}
      {truncated && (
        <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-800">
          찜한 후보가 많아 <b>최근 500명</b>만 보여 드립니다. 필요 없는 후보는 찜을 해제해 주세요.
        </p>
      )}

      {/* 🔴 이름·연락처가 잠긴 상태면 그 사실을 먼저 말한다 — 후보는 모아 뒀는데 연락은 못 하는
          상황에서 "왜 이름이 안 보이지" 를 혼자 추측하게 두지 않는다. */}
      {!canSeeContacts && rows.length > 0 && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900">
          <span>후보는 그대로 보관됩니다. <b>이름·연락처·사진은 광고 중인 병원에게만</b> 열립니다.</span>
          <Link href="/hospital" className="font-semibold underline">광고 안내 →</Link>
        </p>
      )}

      <form action="/mypage/saved-talent" method="get" className="mt-4 flex flex-wrap gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">찜한 간호사 검색</span>
          {/* key: 앱 라우터가 input 을 재사용해 주소의 검색어와 칸이 어긋나는 것을 막는다(관리자 SearchBox 와 같은 이유). */}
          <input key={q} name="q" defaultValue={q} placeholder="이력서 제목 · 지역 · 근무부서 · 내 메모"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600" />
        </label>
        <Button type="submit" size="md">검색</Button>
        {q.trim() && <Button href="/mypage/saved-talent" variant="outline" size="md">검색 해제</Button>}
      </form>

      <p className="mt-3 text-sm text-slate-500">
        <b className="text-slate-700">{rows.length.toLocaleString()}명</b>
        {q.trim() && " (검색 결과)"}
        {/* 내린 사람도 자리는 남긴다 — 조용히 빼면 병원은 자기가 지운 줄 알고 다시 찾아 나선다. */}
        {closed > 0 && ` · 그중 ${closed.toLocaleString()}명은 이력서를 내렸습니다`}
      </p>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-base text-slate-500">
            {q.trim() ? "검색 조건에 맞는 후보가 없습니다." : "아직 찜한 간호사가 없습니다."}
          </p>
          <Link href="/talent" className="mt-2 inline-block font-semibold text-teal-700 hover:underline">인재 검색하러 가기 →</Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((t) => (
            <li key={t.talentId} className={`rounded-xl border p-4 ${t.talent ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                {/* 🔴 이력서를 내린 사람은 **내용을 그리지 않는다.** 비공개는 "선택받고 싶지 않다" 는
                    뜻이라(오너 확정 2026-08-07), 찜해 뒀다는 이유로 계속 보여주면 그 뜻을 뒤집는 것이다.
                    링크도 떼어 낸다 — 상세는 어차피 404 라 누르면 막다른 길이다. */}
                {t.talent ? (
                  <Link href={`/talent/${t.talentId}`} className="min-w-0 flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                    <TalentCard t={t.talent} contactName={contacts.get(t.talentId)?.name} contactAvatar={contacts.get(t.talentId)?.avatarUrl} compact />
                  </Link>
                ) : (
                  <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-4">
                    <p className="font-semibold text-slate-600">이력서를 내린 후보</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      지금은 구직 중이 아니라 이력서를 볼 수 없습니다. 누구였는지는 아래 메모로 확인하세요.
                    </p>
                  </div>
                )}
                <form action={toggleSaveTalent} className="shrink-0">
                  <input type="hidden" name="talent_id" value={t.talentId} />
                  <input type="hidden" name="next" value={here} />
                  <button type="submit" aria-label="찜 해제"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 text-sm font-semibold text-teal-700 transition hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">
                    <SaveIcon filled /> 찜 해제
                  </button>
                </form>
              </div>

              {/* 후보를 왜 담았는지 한 줄. 병원만 본다 — 간호사에게는 어떤 경로로도 가지 않는다. */}
              <form action={saveTalentMemo} className="mt-3 flex flex-wrap items-center gap-2">
                <input type="hidden" name="talent_id" value={t.talentId} />
                <input type="hidden" name="next" value={here} />
                <label className="min-w-0 flex-1">
                  <span className="sr-only">메모</span>
                  <input name="memo" defaultValue={t.memo ?? ""} maxLength={500} placeholder="메모 (예: 3교대 가능 · 8월 중 면접)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600" />
                </label>
                <Button type="submit" variant="outline" size="sm">메모 저장</Button>
                <span className="text-sm text-slate-400">{fmtDay(t.savedAt)} 찜</span>
              </form>
            </li>
          ))}
        </ul>
      )}
    </HospitalShell>
  );
}
