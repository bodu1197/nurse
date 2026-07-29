/**
 * 증명사진(3:4) — 이력서·인재 목록·지원자 화면이 **같은 규칙**을 쓰게 한 곳에 모은다.
 *
 * 전에는 화면마다 `<img>` 를 복붙했더니 크기(96 vs 72)·모서리(rounded vs rounded-lg)·
 * 배경·alt 가 제각각으로 어긋났고, 모바일 축소 규칙은 어디에도 없었다.
 *
 * · 서명 URL 이라 `next/image` 를 쓰지 않는다 — 도메인마다 서명이 달라 캐시가 안 먹는다.
 * · `object-top` — 이관 사진은 비율이 제각각이라 가운데로 자르면 턱·목만 남는다.
 * · 모바일에선 72px 로 줄인다. 96px 를 그대로 두면 320px 화면에서 본문이 짓눌린다
 *   (TalentCard 가 `w-16 sm:w-20` 로 같은 판단을 이미 하고 있다).
 */
export default function IdPhoto({
  src,
  alt = "",
  lazy = false,
  keepSpace = false,
}: Readonly<{
  src: string | null;
  /** 이름이 바로 옆에 있으면 비운다(같은 내용을 두 번 읽게 하지 않는다). 아니면 누구 사진인지 적는다. */
  alt?: string;
  /**
   * 지금 화면에 **안 보이는** 자리(접힌 `<details>` 안 등)에 놓을 때 켠다.
   * 숨은 `<img>` 도 브라우저는 그냥 받아버려서, 안 켜면 한 장도 안 보이는 화면이 수 MB 를 내려받는다.
   * ponytail: 대신 한참 뒤에 펼치면 서명 URL(10분)이 만료돼 깨질 수 있다 —
   *   실제로 문제가 되면 펼침 시 재서명(서버 액션)으로 올린다.
   */
  lazy?: boolean;
  /** 사진이 없어도 자리를 남긴다. 목록에서 행마다 본문 시작 위치가 어긋나지 않게. */
  keepSpace?: boolean;
}>) {
  const box = "h-24 w-[4.5rem] shrink-0 rounded border border-slate-200 sm:h-32 sm:w-24";
  if (!src) return keepSpace ? <span aria-hidden className={`${box} block bg-slate-100`} /> : null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 서명 URL 이라 next/image 최적화 대상이 아니다
    <img
      src={src} alt={alt} width={96} height={128} loading={lazy ? "lazy" : undefined}
      className={`${box} bg-slate-100 object-cover object-top`}
    />
  );
}
