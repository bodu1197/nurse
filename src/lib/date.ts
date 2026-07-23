import { cache } from "react";

const DAY_MS = 86_400_000;

// 요청당 고정된 '지금'. 서버 컴포넌트가 렌더 중 Date.now()를 직접 읽으면 react-hooks/purity 경고가 나는데,
// 규칙을 끄는 대신 cache()로 감싼다 — 같은 요청 안에서는 항상 같은 값이라 화면 계산도 일관된다.
export const nowMs = cache(() => Date.now());

// ISO 날짜 → "N일 전"의 N (0 이상).
export const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));
