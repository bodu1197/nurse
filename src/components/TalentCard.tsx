import { careerSummary } from "@/lib/resumeOptions";
import { timeAgo } from "@/lib/date";
import type { PublicTalent } from "@/lib/data/talent";

/**
 * 인재 목록 행 — 구 널스넷 카드 구성을 그대로 옮겼다.
 *   [사진 + 이름·성별·나이]  |  제목 / 자기소개 / 구분선 / 메타(경력·희망부서·형태·지역) + 경과시간
 *
 * 이름·사진은 광고 중인 병원에게만 온다(contactName·contactAvatar). 그 외에는 "간호사 회원" + 기본 아바타.
 * 얼굴은 이름보다 강한 식별자라 이름만 가리는 건 의미가 없어 같은 게이트를 태운다(오너 확정).
 * 성별·나이는 전원 공개지만 아직 비어 있는 회원이 있다 — 없으면 그 자리를 빼고 레이아웃이 안 무너지게 한다.
 */
export default function TalentCard({
  t,
  contactName,
  contactAvatar,
  compact = false,
  reserveAction = false,
}: Readonly<{
  t: PublicTalent;
  contactName?: string | null;
  contactAvatar?: string | null;
  compact?: boolean;
  /** 카드 오른쪽 아래에 찜 버튼이 겹쳐 놓일 때 그만큼 자리를 비운다(JobCard 와 같은 계약).
      없으면 좁은 화면에서 버튼이 "n일 전" 을 덮는다. */
  reserveAction?: boolean;
}>) {
  // compact: 인재 상세의 좁은 사이드바(약 320px)용. 자기소개·경과시간을 빼고 메타도 둘만 남긴다.
  const meta: { label: string; value: string }[] = (
    compact
      ? [
          { label: "경력", value: careerSummary(t.career_level, t.experience_years) },
          { label: "희망근무지역", value: t.desired_location ?? "" },
        ]
      : [
          { label: "경력", value: careerSummary(t.career_level, t.experience_years) },
          { label: "희망근무부서", value: t.specialties.join(", ") },
          { label: "희망근무형태", value: t.desired_employment_type ?? "" },
          { label: "희망근무지역", value: t.desired_location ?? "" },
        ]
  ).filter((m) => m.value);

  if (compact) {
    return (
      // 🔴 이름을 헤드라인으로 쓰지 않는다. 병원이 목록에서 찾는 것은 "어떤 사람인가"(제목·경력·희망조건)이지
      //    이름이 아니다. 예전에는 이름이 카드 맨 위에 굵게 박혀 '이름표'처럼 보였고, 목록 카드와
      //    정보 순서도 달랐다(목록은 제목이 먼저다). 두 카드의 순서를 맞춘다 — 이름은 상세에서 본다.
      <div className="flex items-center gap-3">
        <Avatar src={contactAvatar ?? null} name={contactName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-bold leading-snug text-slate-900">
            {t.resume_title ?? "간호사 인재"}
          </p>
          <p className="mt-1 truncate text-xs text-slate-400">
            {meta.map((m) => m.value).join(" · ")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 sm:gap-4">
      {/* 왼쪽: 사진 + 이름. 모바일에선 사진을 줄여 본문 폭을 지킨다. */}
      <div className="flex w-16 shrink-0 flex-col items-center gap-1.5 sm:w-20">
        <Avatar src={contactAvatar ?? null} name={contactName} />
        <div className="text-center leading-tight">
          <span className="block truncate text-sm font-bold text-slate-900">{contactName ?? "간호사 회원"}</span>
          {(t.gender || t.age !== null) && (
            <span className="mt-0.5 block text-xs text-slate-500">
              {[t.gender, t.age !== null ? `${t.age}세` : ""].filter(Boolean).join(" · ")}
            </span>
          )}
        </div>
      </div>

      {/* 오른쪽: 제목 → 자기소개 → 구분선 → 메타 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-1 font-bold leading-snug text-slate-900 sm:text-base">
          {t.resume_title ?? "간호사 인재"}
        </p>
        {t.intro && (
          <p className="mt-1 line-clamp-1 text-sm text-slate-600">{t.intro}</p>
        )}

        {/* mt-auto 를 쓰지 않는다 — 카드 높이가 왼쪽(사진) 열에 끌려가며 소개와 메타 사이가 벌어진다.
            메타와 경과시간은 형제로 두고 메타만 줄바꿈시킨다(한 흐름이면 메타가 2줄일 때
            경과시간만 혼자 새 줄 오른쪽 끝에 떨어져 붕 뜬다). */}
        <div className="mt-2">
          <div className={`flex items-start justify-between gap-3 border-t border-slate-100 pt-2 ${reserveAction ? "pb-9 sm:pb-0 sm:pr-32" : ""}`}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {meta.map((m) => (
                <span key={m.label} className="text-xs text-slate-600">
                  <span className="text-slate-400">{m.label}: </span>
                  {m.value}
                </span>
              ))}
            </div>
            {/* 🔴 updated_at 이 아니라 created_at 을 보여준다. 이관·보정 배치가 8,070명의 updated_at 을
                한꺼번에 오늘로 밀어놔서, 그대로 쓰면 "8,070명이 오늘 활동했다"는 거짓이 된다.
                작성일은 사람이 실제로 쓴 날이라 배치 작업에 안 흔들린다. */}
            <span className="shrink-0 text-xs text-slate-400">{timeAgo(t.last_edited_at ?? t.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 프로필 사진. 없으면 이름 첫 글자, 이름도 가려져 있으면 중립 실루엣.
 * 이 프로젝트는 아이콘 라이브러리를 두지 않고 필요한 도형만 인라인으로 그린다(런타임 의존성 5개 유지).
 */
function Avatar({ src, name, size = "md" }: Readonly<{ src: string | null; name?: string | null; size?: "sm" | "md" }>) {
  const box = size === "sm"
    ? "h-11 w-11 shrink-0 overflow-hidden rounded-full"
    : "h-14 w-14 shrink-0 overflow-hidden rounded-full sm:h-16 sm:w-16";
  if (src) {
    // 이관 사진은 비율이 제각각이라 object-cover 로 원형에 맞추되, 인물 사진은 얼굴이 위쪽에 있으므로
    // object-top 으로 잘라 얼굴이 날아가지 않게 한다(가운데 크롭은 턱·목만 남는 경우가 생긴다).
    //
    // 🔴 lazy 를 쓰지 않는다. 사진 주소는 수명 10분짜리 서명 URL 이라, 화면을 열어둔 채 방치했다가
    //    한참 뒤 스크롤하면 그제서야 받으려는 사진의 서명이 이미 만료돼 깨진다.
    //    320px WebP 로 줄여둬서 20장을 다 받아도 약 140KB — lazy 로 아낄 게 없다.
    // eslint-disable-next-line @next/next/no-img-element -- 서명 URL 이라 next/image 최적화 대상이 아니다
    return <img src={src} alt="" className={`${box} bg-slate-100 object-cover object-top`} />;
  }
  if (name) {
    return (
      <span className={`${box} grid place-items-center bg-teal-50 font-bold text-teal-700 ${size === "sm" ? "text-sm" : "text-xl"}`} aria-hidden>
        {name.trim().charAt(0)}
      </span>
    );
  }
  return (
    <span className={`${box} grid place-items-center bg-slate-100 text-slate-300`} aria-hidden>
      <svg width={size === "sm" ? 20 : 30} height={size === "sm" ? 20 : 30} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="8.5" r="4" />
        <path d="M3.5 21c0-4.2 3.8-7 8.5-7s8.5 2.8 8.5 7z" />
      </svg>
    </span>
  );
}
