'use client';

// 🗂 지역 선택 팝업 — /shops·/jobs·/alba 공용(소유자 2026-07-22 "모든 페이지가 통일성을 띄어야지").
// 닫혀 있는 세그먼트 1개 + 열리는 팝업(단계별 드릴다운). 단계 수는 주입 — 상점은 4단(도>시군구>읍면동>리),
// 일자리·알바는 1단(평면 지역 목록). 버티컬이 달라도 **같은 코드**가 그리므로 모양이 갈릴 수 없다.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2';

// MobileBottomNav 가 z-9999 라 그보다 위여야 백드롭이 탭바를 덮는다. 낮으면 탭바가 모달 위에 떠서
// aria-modal 선언과 달리 클릭·탭 이동이 새어나간다(리뷰8 실증).
const MODAL_Z = 'z-[10000]';
const SKELETON_TILES = 9; // 3열 그리드 3행 — 결과와 같은 모양으로 자리를 잡아 레이아웃 이동 방지

export interface RegionOption {
  name: string;
  cnt?: number; // 있으면 타일에 건수 표시(상점). 없으면 이름만(일자리·알바)
}

export interface RegionStep<K extends string = string> {
  key: K; // onPick 에 넘길 레벨 키('sido'|'region'|…)
  label: string; // 팝업 제목('도·광역시'|'시·군·구'|'지역')
  value: string; // 현재 선택값
  options: RegionOption[];
}

const tile = (active: boolean) =>
  `flex min-h-11 items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition ${FOCUS_RING} ${
    active
      ? 'border-teal-700 bg-teal-700 font-semibold text-white'
      : 'border-slate-200 bg-white text-slate-700 hover:border-teal-500 hover:text-teal-700'
  }`;

const iconBtn = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 ${FOCUS_RING}`;

/**
 * 화면에 표시할 선택 경로. 값은 URL 쿼리에서 무검증으로 들어오므로 서버가 준 목록에 실제로 존재하는
 * 것만 노출한다 — 임의 문자열이 사이트 UI 에 그대로 찍히는 콘텐츠 스푸핑 차단. 상위가 가짜면 하위도 불신.
 */
function visiblePath(steps: readonly RegionStep<string>[], allLabel: string): string {
  const parts: string[] = [];
  for (const s of steps) {
    if (!s.value || !s.options.some((o) => o.name === s.value)) break;
    parts.push(s.value);
  }
  return parts.length > 0 ? parts.join(' › ') : allLabel;
}

function TileGrid({
  options,
  active,
  loading,
  allLabel,
  onPick,
}: Readonly<{
  options: RegionOption[];
  active: string;
  loading: boolean;
  allLabel: string;
  onPick: (v: string) => void;
}>) {
  // 로딩 중이면 목록을 무조건 신뢰 불가로 본다. `options.length === 0` 만 보면 상위 지역을 A→B 로
  // 바꿨을 때 아직 남아 있는 A 의 하위 목록이 B 의 것인 양 클릭 가능하게 노출된다(리뷰8 실증).
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="status">
        <span className="sr-only">지역 목록을 불러오는 중</span>
        {Array.from({ length: SKELETON_TILES }, (_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-500">
        더 좁힐 하위 지역이 없어요. 이대로 결과를 확인하세요.
      </p>
    );
  }

  // 3열 상한 — 4열은 "서울특별시 537,488"이 타일 폭을 넘겨 이름이 잘린다(실측).
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <button
        type="button"
        onClick={() => onPick('')}
        aria-pressed={active === ''}
        className={tile(active === '')}
      >
        {allLabel}
      </button>
      {options.map((o) => (
        <button
          key={o.name}
          type="button"
          onClick={() => onPick(o.name)}
          aria-pressed={active === o.name}
          className={tile(active === o.name)}
        >
          <span className="truncate">{o.name}</span>
          {o.cnt !== undefined && (
            <span
              className={`shrink-0 tabular-nums text-xs ${active === o.name ? 'text-teal-100' : 'text-slate-500'}`}
            >
              {o.cnt.toLocaleString()}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// K 제네릭 — 호출부의 레벨 키 유니온(예: RegionLevel)을 그대로 받아 onPick 에 흘린다.
// 이게 없으면 어댑터가 `level as RegionLevel` 단언을 써야 하고, 단언은 오타를 컴파일에서 못 잡는다.
export default function RegionPicker<K extends string>({
  steps,
  loading = false,
  allLabel = '전체',
  emptyLabel = '지역 전체',
  onPick,
}: Readonly<{
  steps: readonly RegionStep<K>[];
  loading?: boolean;
  allLabel?: string; // 각 단계 첫 타일 문구
  emptyLabel?: string; // 아무것도 안 골랐을 때 트리거 문구
  onPick: (levelKey: K, value: string) => void;
}>) {
  const lastStep = steps.length - 1;
  // 열 때 시작 단계 = 아직 안 고른 첫 단계(다 골랐으면 마지막). 닫으면 단계는 보존하지 않는다.
  const firstEmpty = steps.findIndex((s) => !s.value);
  const depth = firstEmpty === -1 ? lastStep : firstEmpty;

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(depth);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId(); // 한 화면에 두 개가 떠도 id 가 겹치지 않게

  // 열림 동안: Escape 닫기 + 배경 스크롤 잠금(ConfirmDialog 와 동일 규약). 닫을 때 트리거로 포커스 복귀.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      triggerRef.current?.focus();
    };
  }, [open]);

  // 단계가 바뀌면 방금 누른 타일이 언마운트되며 포커스가 body 로 떨어진다 → 제목으로 옮긴다.
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, step]);

  // aria-modal 은 보조기술 가상 커서만 막고 Tab 순서는 막지 못한다 → 패널 안에서 순환시킨다.
  function trapTab(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const items = panelRef.current?.querySelectorAll<HTMLElement>('button');
    if (!items || items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function pick(value: string) {
    const cur = steps[step];
    // 같은 값 재선택은 "변경 없음" — 그냥 넘기면 부모가 하위를 리셋해 이미 고른 값이 날아가고
    // 무거운 재조회도 한 번 더 나간다(리뷰8).
    if (value && value === cur.value) {
      if (step < lastStep) setStep(step + 1);
      return;
    }
    onPick(cur.key, value);
    if (!value) return; // '전체' = 이 단계 해제. 더 내려가지 않는다.
    if (step < lastStep) setStep(step + 1);
    else setOpen(false); // 마지막 단계까지 골랐으면 팝업을 붙잡아 둘 이유가 없다
  }

  const label = visiblePath(steps, emptyLabel);
  const hasSelection = steps.some((s) => s.value);

  return (
    // 검색 pill 안에 들어가는 세그먼트(테두리 없음 — 핀 아이콘 + 값 + 구분선은 pill 이 제공).
    // lg:w-[22rem] = 4단 경로가 text-base 로 안 잘리는 실측 폭. 세 버티컬 공통 폭이라 정렬이 갈리지 않는다.
    <div className="flex w-full min-w-0 items-center gap-1 px-1 lg:w-[22rem] lg:shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setStep(depth);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`지역 선택, 현재 ${label}`}
        title={label}
        // min-w-0 — flex 기본 min-width:auto 는 텍스트 전체 폭까지 버텨 truncate 를 무력화한다.
        // cursor-pointer — Tailwind v4 preflight 가 button 기본 커서를 없앴다. 테두리 없는 세그먼트라
        // hover 배경까지 있어야 '누를 수 있음'이 보인다.
        className={`flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg bg-transparent px-1 text-left text-base transition hover:bg-slate-100 ${FOCUS_RING} ${
          hasSelection ? 'font-semibold text-teal-800' : 'text-slate-700'
        }`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="shrink-0 text-teal-600"
          aria-hidden="true"
        >
          <path d="M12 21s-7-6.3-7-11a7 7 0 1114 0c0 4.7-7 11-7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
        <span className="truncate">{label}</span>
        <span aria-hidden className="ml-auto shrink-0 text-slate-500">
          ▾
        </span>
      </button>

      {hasSelection && (
        // 최상위 단계를 비우면 부모가 하위까지 캐스케이드 리셋한다. 클릭 즉시 이 버튼 자신이 사라지므로
        // 포커스를 트리거로 넘겨야 키보드 사용자가 위치를 잃지 않는다.
        // w-8(32px) — pill 안이라 좁게 잡되 높이 44px 로 SC 2.5.8(24×24) 여유 충족.
        <button
          type="button"
          onClick={() => {
            onPick(steps[0].key, '');
            triggerRef.current?.focus();
          }}
          aria-label="지역 선택 해제"
          className={`flex h-11 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-teal-700 ${FOCUS_RING}`}
        >
          <span aria-hidden className="text-base leading-none">
            ×
          </span>
        </button>
      )}

      {open &&
        createPortal(
          <div className={`fixed inset-0 ${MODAL_Z} flex items-end justify-center sm:items-center`}>
            {/* 백드롭은 클릭 닫기 전용 장식 — 버튼으로 만들면 닫기 버튼과 접근명이 중복된다. */}
            <div
              aria-hidden
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-slate-900/50"
            />
            <div
              ref={panelRef}
              onKeyDown={trapTab}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="relative flex max-h-[80vh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
                <div className="flex min-w-0 items-center gap-1">
                  {step > 0 && (
                    <button
                      type="button"
                      onClick={() => setStep(step - 1)}
                      aria-label="이전 단계"
                      className={iconBtn}
                    >
                      <span aria-hidden>‹</span>
                    </button>
                  )}
                  <div className="min-w-0">
                    <h2
                      id={titleId}
                      ref={headingRef}
                      tabIndex={-1}
                      className="text-base font-bold text-slate-900"
                    >
                      {steps[step].label}
                    </h2>
                    <p className="truncate text-xs text-slate-500">{label}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="닫기"
                  className={iconBtn}
                >
                  <span aria-hidden className="text-xl leading-none">
                    ×
                  </span>
                </button>
              </div>

              <div className="overflow-y-auto px-5 py-4" aria-busy={loading}>
                <TileGrid
                  options={steps[step].options}
                  active={steps[step].value}
                  loading={loading}
                  allLabel={allLabel}
                  onPick={pick}
                />
              </div>

              <div className="border-t border-slate-200 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className={`min-h-11 w-full cursor-pointer rounded-lg bg-teal-700 px-4 text-sm font-bold text-white transition hover:bg-teal-800 ${FOCUS_RING}`}
                >
                  결과 보기
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
