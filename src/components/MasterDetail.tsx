import type { ReactNode } from "react";

// 좌측 목록 + 우측 상세 — /jobs 와 같은 구조를 인재정보·리뷰·게시판이 함께 쓴다.
// selecting: URL에 선택 항목이 있는가(?t=·?r=·?p=). 모바일에서는 선택 시 상세만, 아니면 목록만 보인다.
//   데스크톱은 항상 목록+상세를 나란히 보여준다.
export default function MasterDetail({
  selecting,
  list,
  detail,
}: Readonly<{ selecting: boolean; list: ReactNode; detail: ReactNode }>) {
  return (
    <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,470px)_1fr] lg:gap-4">
      <div className={selecting ? "hidden lg:block" : ""}>{list}</div>
      {detail && (
        <section className={`${selecting ? "" : "hidden lg:block"} lg:self-start`}>{detail}</section>
      )}
    </div>
  );
}

// 목록 카드 공통 래퍼 — 선택된 카드는 teal 테두리로 강조(/jobs 와 동일).
export function ListCard({ href, on, children }: Readonly<{ href: string; on: boolean; children: ReactNode }>) {
  return (
    <a href={href} className={`block rounded-lg border bg-white p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${on ? "border-teal-600 ring-1 ring-teal-600" : "border-slate-200 hover:border-slate-300 hover:shadow-sm"}`}>
      {children}
    </a>
  );
}

// 목록 하단 페이지 나누기 — 세 화면이 같은 모양.
export function Pager({ page, totalPages, href, nofollow = false }: Readonly<{
  page: number;
  totalPages: number;
  href: (n: number) => string;
  /** 크롤러가 이 쪽 넘김을 따라가지 않게 한다. **색인 대상 페이지에 붙은 곁다리 페이저**용.
      예: /talent/{id} 의 왼쪽 사이드바 — 이력서 7,770건 × 389쪽 ≈ 300만 주소가 생긴다.
      canonical 이 색인은 막아주지만 크롤 예산과 매 요청의 count 쿼리는 그대로 나간다.
      사람은 그대로 누를 수 있다(nofollow 는 크롤러에게만 하는 말이다). */
  nofollow?: boolean;
}>) {
  if (totalPages <= 1) return null;
  const link = "inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";
  const rel = nofollow ? "nofollow" : undefined;
  return (
    <nav className="mt-4 flex items-center justify-center gap-3 text-sm" aria-label="페이지">
      {page > 1 ? <a href={href(page - 1)} rel={rel} className={link}>← 이전</a> : <span />}
      <span className="text-slate-500">{page} / {totalPages}</span>
      {page < totalPages ? <a href={href(page + 1)} rel={rel} className={link}>다음 →</a> : <span />}
    </nav>
  );
}
