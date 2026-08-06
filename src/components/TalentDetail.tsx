import Link from "next/link";
import IdPhoto from "@/components/IdPhoto";
import { SaveIcon } from "@/components/JobDetail";
import { toggleSaveTalent } from "@/app/talent/actions";
import { careerSummary } from "@/lib/resumeOptions";
import { fmtDay } from "@/lib/date";
import type { PublicTalentDetail } from "@/lib/data/talent";

// 인재 상세(우측 패널). 이름·전화·이메일·사진은 광고 병원(contact 전달 시)만 보인다.
// 사진도 같은 게이트를 탄다 — 얼굴은 이름보다 강한 식별자라 따로 열면 이름을 가린 의미가 없다.
type Contact = { name: string | null; phone: string | null; email: string | null; avatarUrl: string | null } | undefined;

function Row({ k, v }: Readonly<{ k: string; v: string | null }>) {
  if (!v) return null;
  return (
    <div className="flex gap-3 border-b border-slate-100 py-2 text-sm">
      <dt className="w-24 shrink-0 text-slate-500">{k}</dt>
      <dd className="min-w-0 flex-1 text-slate-800">{v}</dd>
    </div>
  );
}

const yesNo = (v: boolean | null) => (v ? "예" : null);
const list = (v: readonly string[]) => (v.length > 0 ? v.join(", ") : null);

export default function TalentDetail({
  t,
  contact,
  contactGated,
  asH1,
  canSave,
  saved,
  selfHref,
}: Readonly<{
  t: PublicTalentDetail; contact: Contact; contactGated: boolean; asH1?: boolean;
  /** 병원 회원일 때만 찜 버튼을 그린다 — 간호사에게 "인재 찜" 은 뜻이 없다. */
  canSave?: boolean;
  saved?: boolean;
  /** 찜한 뒤 돌아올 자리(검색 조건이 붙은 지금 주소). 공고 상세와 같은 계약. */
  selfHref?: string;
}>) {
  // 단독 상세(/talent/[id])에선 h1, 목록 안에선 h2 (문서 헤딩 계층 유지) — JobDetail과 동일 패턴.
  const Heading = asH1 ? "h1" : "h2";
  return (
    <article className="relative rounded-lg border border-slate-200 bg-white p-6">
      {/* 💾 찜 — 공고 상세의 저장 버튼과 같은 자리·같은 모양이다(오너 지시 2026-08-07:
          "인재정보에는 저장 기능이 없다"). 담아 두는 것에는 광고 자격을 걸지 않는다 —
          연락처를 여는 것과 다른 일이고, 후보를 모아 두고 그다음에 결제하는 것이 자연스럽다. */}
      {canSave && (
        <form action={toggleSaveTalent} className="absolute right-4 top-4">
          <input type="hidden" name="talent_id" value={t.profile_id} />
          <input type="hidden" name="next" value={selfHref ?? `/talent/${t.profile_id}`} />
          <button type="submit" aria-label={saved ? "찜 해제" : "찜하기"}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${saved ? "border-teal-200 bg-teal-50 text-teal-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            <SaveIcon filled={!!saved} /> {saved ? "찜함" : "찜하기"}
          </button>
        </form>
      )}
      {/* 🔴 머리말에는 **가려야 할 것을 두지 않는다.** 예전에는 이름이 제목 자리에, 사진이 그 옆에
          따로 있어서 가리는 곳이 세 군데(이름·사진·연락처)로 흩어졌다 — 한 곳만 놓치면 새는 구조다.
          이름·사진·전화·이메일은 전부 아래 '연락' 한 블록으로 모아 **한 번에** 잠근다.
          머리말은 이력서 제목(무엇을 하는 사람인가)이 대신한다 — 병원이 목록에서 찾는 것도 그쪽이다. */}
      <div className="min-w-0">
        <Heading className={`text-2xl font-bold leading-snug text-slate-900 ${canSave ? "pr-28" : ""}`}>{t.resume_title ?? "간호사 인재"}</Heading>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {t.license_type && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{t.license_type}</span>}
          <span className="text-slate-600">{careerSummary(t.career_level, t.experience_years)}</span>
          {t.night_available && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">나이트 전담 가능</span>}
        </div>
        {/* 카드(TalentCard)와 같은 기준 — 이관 배치가 밀어놓은 updated_at 은 쓰지 않는다. */}
        <p className="mt-1 text-xs text-slate-400">{fmtDay(t.last_edited_at ?? t.created_at)} 갱신</p>
      </div>

      {/* 연락 — 이름·사진·전화·이메일을 한 블록에. 광고 병원만 보이고, 그 외엔 통째로 잠긴다. */}
      <div className="mt-4 rounded-[12px] border border-slate-200 bg-slate-50 p-3 text-sm">
        <p className="font-semibold text-slate-700">연락</p>
        {contact ? (
          <div className="mt-2 flex items-start gap-4">
            {/* 사진도 이 블록 안이다 — 얼굴은 이름보다 강한 식별자라 같은 게이트를 태운다 */}
            <IdPhoto src={contact.avatarUrl ?? null} />
            <div className="min-w-0 flex-1">
              <p className="text-xl font-bold text-slate-900">{contact.name ?? "간호사 회원"}</p>
              {/* 전화·이메일 둘 다 — 전화를 안 적었거나 안 받는 사람에게 닿는 유일한 수단이 이메일이다. */}
              {contact.phone || contact.email ? (
                <div className="mt-1 flex flex-col gap-1">
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="inline-flex min-h-11 items-center gap-1.5 text-lg font-bold text-teal-700 hover:underline">📞 {contact.phone}</a>
                  )}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="inline-flex min-h-11 items-center gap-1.5 break-all font-semibold text-teal-700 hover:underline">✉️ {contact.email}</a>
                  )}
                </div>
              ) : <p className="mt-1 text-slate-500">연락처 미입력</p>}
            </div>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-500">🔒 이름·연락처·사진은 광고 중인 병원만 볼 수 있습니다.</span>
            {contactGated && <Link href="/hospital" className="shrink-0 rounded font-semibold text-teal-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">광고 안내 →</Link>}
          </div>
        )}
      </div>

      <h3 className="mt-5 font-bold text-slate-900">면허 · 자격</h3>
      <dl className="mt-2">
        <Row k="면허 구분" v={t.license_type} />
        <Row k="취득연도" v={t.license_year != null ? `${t.license_year}년` : null} />
        <Row k="면허신고" v={yesNo(t.license_reported)} />
        <Row k="보유 자격증" v={list(t.certifications)} />
        <Row k="전문간호사" v={t.apn_field} />
      </dl>

      <h3 className="mt-5 font-bold text-slate-900">학력</h3>
      <dl className="mt-2">
        <Row k="최종 학력" v={[t.education_level, t.graduation_status].filter(Boolean).join(" · ") || null} />
        <Row k="학교 · 전공" v={t.education} />
      </dl>

      <h3 className="mt-5 font-bold text-slate-900">경력</h3>
      <dl className="mt-2">
        <Row k="구분" v={t.career_level} />
        <Row k="총 경력" v={t.experience_years != null ? `${t.experience_years}년` : null} />
        <Row k="간호간병통합" v={yesNo(t.has_integrated_care)} />
        <Row k="차지 가능" v={yesNo(t.can_charge)} />
      </dl>
      {t.work.length > 0 && (
        <ul className="mt-3 space-y-3">
          {t.work.map((w) => (
            <li key={w.id} className="border-l-2 border-slate-300 pl-3 text-sm">
              <p className="font-semibold text-slate-900">
                {w.hospital_name}
                {w.hospital_type && <span className="ml-1 text-xs font-normal text-slate-600">{w.hospital_type}{w.bed_range ? ` · ${w.bed_range}` : ""}</span>}
              </p>
              <p className="text-xs text-slate-600">
                {w.start_ym} ~ {w.is_current ? "재직중" : w.end_ym ?? "-"}
                {w.department && ` · ${w.department}`}{w.position && ` · ${w.position}`}{w.shift_type && ` · ${w.shift_type}`}
              </p>
              {w.duties && <p className="mt-1 whitespace-pre-line text-slate-700">{w.duties}</p>}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-5 font-bold text-slate-900">희망 근무조건</h3>
      <dl className="mt-2">
        <Row k="근무형태" v={list(t.shift_types)} />
        <Row k="나이트 전담" v={yesNo(t.night_available)} />
        <Row k="희망 근무지" v={t.desired_location} />
        <Row k="희망 진료과" v={list(t.specialties)} />
        <Row k="희망 기관종별" v={list(t.desired_hospital_types)} />
        <Row k="희망 고용형태" v={t.desired_employment_type} />
        <Row k="희망 급여" v={t.desired_salary} />
        <Row k="입사 가능일" v={t.available_from} />
        <Row k="기숙사 필요" v={yesNo(t.needs_dormitory)} />
      </dl>

      {t.intro && (
        <>
          <h3 className="mt-5 font-bold text-slate-900">자기소개</h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{t.intro}</p>
        </>
      )}
    </article>
  );
}
