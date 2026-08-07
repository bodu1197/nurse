import Link from "next/link";
import { Pager } from "@/components/MasterDetail";
import { getHospitalsToFix, PER_PAGE } from "@/lib/data/adminLists";
import { PageTitle, SearchBox, TableWrap, TH, TD, EmptyOrFailed, Notice } from "@/components/admin/Ui";
import { renameHospital } from "@/app/admin/actions";

export const metadata = { title: "병원명 확인 — 관리자" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  "1": "병원 이름을 바꿨습니다. 이 병원의 공고에도 바로 반영됩니다.",
  name: "이름을 두 글자 이상 적어야 합니다.",
  target: "대상 병원을 찾을 수 없습니다.",
  save: "저장에 실패했습니다.",
};

/**
 * 🏥 병원명 확인 — 이름 자리에 아이디·직함이 들어간 병원을 사람이 보고 고치는 화면.
 *
 * 구 널스넷 이관 때 141곳이 이렇게 들어왔다(`eyessg2022` · `hama` · `김원장` · `010-5054-1454`).
 * 주소와 공고 제목이 함께 맞아떨어지는 44곳은 이미 자동으로 바로잡았고, 여기 남은 것은
 * 기계가 확신할 수 없는 것들이다 — 같은 건물에 병원이 여럿이거나(주소만으로는 못 고른다),
 * 산후조리원·교육원처럼 심사평가원 명부에 아예 없다.
 *
 * 🔴 그래서 **판단에 필요한 것을 한 줄에 다 놓는다** — 지금 이름, 주소, 그 병원이 올린 공고 제목,
 *    같은 주소의 명부 후보. 후보를 누르면 입력칸이 채워지고, 없으면 직접 적는다.
 */
export default async function AdminHospitalsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; page?: string; ok?: string; error?: string }> }>) {
  const sp = await searchParams;
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, failed } = await getHospitalsToFix({ q, page });
  const here = `/admin/hospitals?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page) })}`;

  return (
    <>
      <PageTitle
        title="병원명 확인"
        desc={`${total.toLocaleString()}곳 — 이름 자리에 아이디·직함이 들어간 병원입니다. 구직자 화면에 그대로 나가므로 진짜 병원 이름으로 고쳐 주세요. 고치면 그 병원의 공고에도 바로 반영됩니다.`}
      />
      <Notice ok={sp.ok} error={sp.error} messages={MESSAGES} />

      <SearchBox action="/admin/hospitals" value={q} placeholder="병원 이름" />

      {rows.length === 0 ? (
        <EmptyOrFailed failed={failed}>
          {q ? "해당 조건에 맞는 병원이 없습니다." : "확인이 필요한 병원이 없습니다 — 전부 정리됐습니다."}
        </EmptyOrFailed>
      ) : (
        <TableWrap>
          <thead>
            <tr><TH>지금 이름</TH><TH>주소</TH><TH>이 병원이 올린 공고</TH><TH>고치기</TH></tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <TD className="font-medium">
                  {h.name}
                  {/* 관리자 테스트 계정은 고칠 대상이 아니다 — 모르고 바꾸면 테스트 화면이 헷갈린다. */}
                  {h.isTest && <span className="ml-1.5 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-semibold text-white">테스트</span>}
                </TD>
                <TD className="text-sm text-slate-600">{h.address ?? <span className="text-slate-400">주소 없음</span>}</TD>
                <TD>
                  {/* 🔴 공고 제목이 가장 좋은 단서다 — 대개 여기에 진짜 병원 이름이 들어 있다. */}
                  {h.jobTitles.length === 0 ? (
                    <span className="text-sm text-slate-400">공고 없음</span>
                  ) : (
                    <ul className="space-y-0.5 text-sm text-slate-700">
                      {h.jobTitles.map((t) => <li key={t}>· {t}</li>)}
                    </ul>
                  )}
                </TD>
                <TD>
                  <form action={renameHospital} className="flex flex-col gap-2">
                    <input type="hidden" name="id" value={h.id} />
                    <input type="hidden" name="back" value={here} />
                    {/* 같은 주소의 명부 병원 — 누르면 입력칸이 채워진다(라디오라 자바스크립트가 필요 없다). */}
                    {h.candidates.length > 0 && (
                      <fieldset className="flex flex-wrap gap-1.5">
                        <legend className="sr-only">같은 주소의 명부 병원</legend>
                        {h.candidates.map((c) => (
                          <label key={c} className="cursor-pointer">
                            <input type="radio" name="name" value={c} className="peer sr-only" />
                            <span className="inline-flex min-h-11 items-center rounded-full border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50 peer-checked:border-teal-500 peer-checked:bg-teal-50 peer-checked:font-semibold peer-checked:text-teal-700 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-600">
                              {c}
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="min-w-0 flex-1">
                        <span className="sr-only">직접 입력</span>
                        {/* 🔴 라디오와 **다른 이름**을 쓴다. 같은 name 이면 둘 다 전송돼 먼저 온
                            라디오 값이 이기고, 애써 입력한 글자가 아무 말 없이 버려진다. */}
                        <input name="typed" maxLength={100} placeholder="진짜 병원 이름 직접 입력"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600" />
                      </label>
                      <button type="submit"
                        className="inline-flex min-h-11 items-center rounded-lg bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
                        저장
                      </button>
                    </div>
                  </form>
                </TD>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      <Pager page={page} totalPages={Math.max(1, Math.ceil(total / PER_PAGE))}
        href={(n) => `/admin/hospitals?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) })}`} />

      <p className="mt-6 text-sm text-slate-500">
        여기 없는 병원도 이름이 틀렸다면 <Link href="/admin/ads" className="font-semibold text-teal-700 hover:underline">공고 관리</Link>에서 병원명으로 찾아 확인하실 수 있습니다.
      </p>
    </>
  );
}
