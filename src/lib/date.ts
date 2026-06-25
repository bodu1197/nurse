const DAY_MS = 86_400_000;

// ISO 날짜 → "N일 전"의 N (0 이상).
export const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS));
