// 공용 워드마크 — 헤더/히어로/로그인/준비중 페이지에서 재사용 (DRY).
export default function Logo({ className = "text-2xl" }: Readonly<{ className?: string }>) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-extrabold tracking-tight ${className}`}>
      <span aria-hidden className="text-teal-600">✚</span>
      <span>
        널스<span className="text-teal-600">넷</span>
      </span>
    </span>
  );
}
