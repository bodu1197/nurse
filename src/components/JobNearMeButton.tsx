"use client";

// 📍 내 주변 간호사 채용 찾기 — talent(C:\dev\talent\src\components\ui\NearMeControl.tsx) 그대로 이식.
// 공고 근무지 좌표(jobs.lat/lng)는 등록·수정·워크넷 동기화 시 서버가 미리 채워둔다(오너 확정 2026-08-02)
// — 여기서는 내 위치만 구해 ?lat=&lng=&r= 로 실어 보내면 된다. talent 와 달리 잡·알바 두 버티컬을
// 공유할 필요가 없어(nurse-app 은 채용 하나) 별도 어댑터 없이 한 파일로 둔다.
//
// 지역 선택은 검색창(JobSearchBar 의 RegionPicker) 한 곳이다. 이 버튼은 '내 주변' 전용.
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { clampRadius, parseRadius, radiusLabel, JOB_NEAR_RADIUS } from "@/lib/location/radius";

const GEO_TIMEOUT_MS = 8000; // 위치 조회 최대 대기
const GEO_MAX_AGE_MS = 300_000; // 5분 내 캐시 위치 허용
const COORD_PRECISION = 1e4; // 좌표 4자리(~11m) — 반경 box 에 충분 + URL 간결·위치 미세노출 축소
const SLIDE_DEBOUNCE_MS = 300; // 드래그 중 매 틱마다 재조회하지 않도록

export default function JobNearMeButton() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  const active = !!(sp.get("lat") && sp.get("lng"));
  const radiusM = parseRadius(sp.get("r"), JOB_NEAR_RADIUS);

  const [radius, setRadius] = useState(() => clampRadius(radiusM, JOB_NEAR_RADIUS));
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");
  const findBtnRef = useRef<HTMLButtonElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 드래그 중에는 부모(URL)→로컬 동기화를 막는다 — URL 커밋이 수백ms 뒤라, 열어두면 사용자가
  // 20km 로 끌고 있는데 앞선 8km 응답이 도착해 썸이 되감긴다.
  const draggingRef = useRef(false);

  useEffect(() => {
    if (!draggingRef.current) setRadius(clampRadius(radiusM, JOB_NEAR_RADIUS));
  }, [radiusM]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  function go(coord: { lat: number; lng: number; radiusM: number } | null, replace: boolean) {
    const p = new URLSearchParams(sp.toString());
    p.delete("page"); // 조건이 바뀌었으니 1페이지부터
    if (coord) {
      p.set("lat", String(coord.lat));
      p.set("lng", String(coord.lng));
      p.set("r", String(coord.radiusM));
    } else {
      p.delete("lat");
      p.delete("lng");
      p.delete("r");
    }
    const s = p.toString();
    const url = pathname + (s ? `?${s}` : "");
    // 반경 조절은 같은 화면의 미세조정이라 replace + scroll:false — push 로 쌓으면 드래그 3번에
    // 뒤로가기가 3번 필요해지고, 기본 스크롤 복원이 목록을 맨 위로 되돌린다.
    startTransition(() => (replace ? router.replace(url, { scroll: false }) : router.push(url)));
  }

  function nearMe() {
    if (locating) return; // aria-disabled 라 클릭은 되지만 재진입 방지
    setGeoError("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("이 브라우저는 위치를 지원하지 않아요. 지역을 직접 선택해 주세요.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const round = (n: number) => Math.round(n * COORD_PRECISION) / COORD_PRECISION;
        setLocating(false);
        go({ lat: round(pos.coords.latitude), lng: round(pos.coords.longitude), radiusM: radius }, false);
        findBtnRef.current?.focus();
      },
      () => {
        setLocating(false);
        setGeoError("위치 권한이 필요해요. 허용하거나 지역을 직접 선택해 주세요.");
      },
      { timeout: GEO_TIMEOUT_MS, maximumAge: GEO_MAX_AGE_MS },
    );
  }

  function onSlide(v: number) {
    draggingRef.current = true;
    setRadius(v); // 즉시 시각 반영
    if (!active) return; // 아직 좌표가 없으면 값만 들고 있다가 "찾기" 누를 때 함께 보낸다
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      draggingRef.current = false;
      const lat = Number.parseFloat(sp.get("lat") ?? "");
      const lng = Number.parseFloat(sp.get("lng") ?? "");
      if (Number.isFinite(lat) && Number.isFinite(lng)) go({ lat, lng, radiusM: v }, true);
    }, SLIDE_DEBOUNCE_MS);
  }

  return (
    <div className={`w-full min-w-0 ${active ? "lg:w-auto lg:flex-[2]" : "lg:w-auto lg:shrink-0"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={findBtnRef}
          type="button"
          onClick={nearMe}
          aria-busy={locating}
          aria-disabled={locating}
          className="inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-teal-700 px-5 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 aria-disabled:opacity-60 lg:w-auto lg:min-w-[12rem] lg:flex-none"
        >
          {locating ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
          )}
          {active ? "내 주변 다시 찾기" : "내 주변 간호사 채용 찾기"}
        </button>

        {active && (
          <button
            type="button"
            onClick={() => { go(null, false); findBtnRef.current?.focus(); }}
            aria-label="내 주변 필터 해제"
            className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-full bg-teal-50 px-3 text-sm font-medium text-teal-700 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            해제
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        {active && (
          <label className="flex w-full items-center gap-3 rounded-full border border-slate-300 bg-white px-4 py-1.5 sm:w-auto sm:min-w-[15rem] sm:flex-1">
            <span className="whitespace-nowrap text-xs font-medium text-slate-500">반경</span>
            <input
              type="range"
              min={JOB_NEAR_RADIUS.min}
              max={JOB_NEAR_RADIUS.max}
              step={JOB_NEAR_RADIUS.step}
              value={radius}
              onChange={(e) => onSlide(Number(e.target.value))}
              aria-label="검색 반경"
              aria-valuetext={radiusLabel(radius)}
              className="h-11 min-w-0 flex-1 cursor-pointer accent-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1"
            />
            <span className="w-12 shrink-0 whitespace-nowrap text-right text-sm font-semibold text-teal-700">
              {radiusLabel(radius)}
            </span>
          </label>
        )}
      </div>

      <span aria-live="polite" className="sr-only">
        {locating ? "위치를 확인하는 중입니다" : ""}
      </span>
      <span role="alert" className={`block max-w-[18rem] text-sm text-rose-700 ${geoError ? "mt-2" : ""}`}>
        {geoError}
      </span>
    </div>
  );
}
