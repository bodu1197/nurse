"use client";

import { useRef, useState } from "react";

export type Hosp = { id: string; name: string; region: string | null; address: string | null };

/** 검색을 걸기 전 기다리는 시간. 한 글자마다 서버를 부르지 않게. */
const DEBOUNCE_MS = 250;
/**
 * 이 시간을 넘기면 "오래 걸린다" 고 본다. 명부에 있으면 수백ms 라(실측 176~939ms),
 * 여기까지 왔다는 건 서버가 심사평가원까지 물어보러 갔다는 뜻이다(그쪽은 5~10초).
 */
const SLOW_MS = 2500;

/**
 * 결과가 비었을 때 보여줄 문구 — **왜 비었는지에 따라 달라야 한다.**
 * "없습니다" 는 정말 없을 때만 할 수 있는 말이고, 못 찾아본 것을 없다고 하면 거짓말이다.
 * 🔴 비로그인 안내(skipped-anonymous)만 로그인 링크가 필요해 화면이 직접 만든다.
 */
export function emptyMessage(reason: string | null): string {
  if (reason === "capped") return "지금은 새로 생긴 병원 조회가 몰려 잠시 쉬고 있습니다. 잠시 후 다시 검색해 주세요.";
  if (reason === "unavailable") return "지금은 심사평가원 조회가 되지 않습니다. 잠시 후 다시 검색해 주세요.";
  return "일치하는 병원이 없습니다.";
}

/**
 * 🏥 병원 이름 자동완성 — 두 화면(리뷰 검색·광고 등록)이 같은 규칙으로 돌게 한다.
 *
 * 🔴 이걸 훅으로 뺀 이유: 종전에는 디바운스·요청순번·중단·지연안내가 두 컴포넌트에 **통째로
 *    복제**돼 있었다. 한쪽만 고치면 두 화면이 다르게 동작하는데 그 사실이 화면에 안 드러난다
 *    (/review8 지적 2026-08-14). 고르는 방식은 화면마다 다르니 그건 각자 두고, **부르는 규칙만**
 *    여기 모은다.
 */
export function useHospitalSearch() {
  const [results, setResults] = useState<Hosp[]>([]);
  const [loading, setLoading] = useState(false);
  /** 서버가 심사평가원까지 갔다 — 안내 문구를 바꿔야 할 만큼 오래 걸린다. */
  const [slow, setSlow] = useState(false);
  /**
   * 결과가 비었을 때 **왜 비었는지**(응답 헤더). 빈 목록은 서로 다른 사실을 뭉뚱그린다:
   *   null                 정말 그런 병원이 없다
   *   "skipped-anonymous"  비로그인이라 심사평가원에 안 물어봤다
   *   "capped"             오늘 조회가 몰려 지금은 못 물어본다
   *   "unavailable"        물어보려다 실패했다(원천이 죽었거나 저장이 막혔다)
   * 화면이 이걸 구분해야 실재하는 신규 병원을 "없습니다" 라고 단정하지 않는다.
   */
  const [reason, setReason] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 🔴 타이핑 중 지나간 요청을 끊는다. 명부에 없는 이름이면 서버가 외부 API 를 최대 12초 붙잡는데,
  //    안 끊으면 글자 수만큼 그 요청이 겹쳐 쌓인다(서버 동시 실행·비용에 그대로 얹힌다).
  const ctrl = useRef<AbortController | null>(null);
  // 요청 순번 — 먼저 보낸 느린 응답이 나중에 도착해 최신 결과를 덮어쓰면,
  // 방금 지운 검색어의 병원이 목록에 남아 **엉뚱한 병원을 고를 수 있다**.
  const seq = useRef(0);

  /** 검색어가 바뀔 때 부른다. 2자 미만이면 결과를 비우고 아무것도 안 부른다. */
  function search(raw: string) {
    const v = raw.trim();
    clearTimeout(timer.current);
    clearTimeout(slowTimer.current);
    ctrl.current?.abort();
    setSlow(false);
    setReason(null);
    if (v.length < 2) {
      seq.current++; // 돌아오는 중인 응답이 결과를 되살리지 못하게
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    timer.current = setTimeout(async () => {
      const ac = new AbortController();
      ctrl.current = ac;
      slowTimer.current = setTimeout(() => { if (mine === seq.current) setSlow(true); }, SLOW_MS);
      try {
        const r = await fetch(`/api/hospitals/search?q=${encodeURIComponent(v)}`, { signal: ac.signal });
        const data = r.ok ? await r.json() : [];
        if (mine === seq.current) {
          setResults(data); // 최신 요청의 응답만 반영
          setReason(r.headers.get("X-Registry-Lookup"));
        }
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        // 🔴 내 것일 때만 정리한다. 중단된 요청이 뒤늦게 여기 오면서 **새 요청이 방금 건 타이머**를
        //    지우면, 오래 걸려도 안내가 안 바뀐다.
        if (mine === seq.current) {
          clearTimeout(slowTimer.current);
          setLoading(false);
          setSlow(false);
        }
      }
    }, DEBOUNCE_MS);
  }

  /** 병원을 골랐을 때 — 목록을 닫고 돌아오는 응답도 무시한다. */
  function clear() {
    clearTimeout(timer.current);
    clearTimeout(slowTimer.current);
    ctrl.current?.abort();
    seq.current++;
    setResults([]);
    setLoading(false);
    setSlow(false);
  }

  return { results, loading, slow, reason, search, clear };
}
