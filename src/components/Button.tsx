import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

// 공용 버튼 — 모서리·높이·색을 한 곳에서 관리(인라인 클래스 흩어짐 방지).
// 높이 티어: lg=h-12/text-base, md=h-11/text-sm, sm=h-9/text-xs. 같은 size = 같은 높이.
export type Variant = "primary" | "outline" | "ghost" | "danger";
export type Size = "lg" | "md" | "sm";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

const SIZES: Record<Size, string> = {
  lg: "h-12 px-7 text-base font-bold",
  md: "h-11 px-5 text-sm",
  sm: "h-9 px-3 text-xs",
};

const VARIANTS: Record<Variant, string> = {
  primary: "bg-teal-600 text-white hover:bg-teal-700",
  outline: "border border-slate-300 text-slate-700 hover:bg-slate-50",
  ghost: "text-teal-700 hover:bg-teal-50",
  danger: "text-red-600 hover:bg-red-50 focus-visible:ring-red-500",
};

// 컴포넌트를 못 쓰는 곳(useFormStatus 등)에서 클래스만 재사용.
export function buttonClass(variant: Variant = "primary", size: Size = "md", className = "") {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${className}`.trim();
}

type Common = { variant?: Variant; size?: Size; className?: string; children: ReactNode };
type AsButton = Common & { href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>;
type AsLink = Common & { href: string } & AnchorHTMLAttributes<HTMLAnchorElement>;

export default function Button(props: AsButton | AsLink) {
  const { variant, size, className, children, ...rest } = props;
  const cls = buttonClass(variant, size, className);
  if (typeof props.href === "string") {
    // 스프레드를 먼저 두고 href/className을 뒤에서 확정 — rest의 href를 버리는 미사용 변수가 필요 없다.
    return (
      <a {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} href={props.href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
