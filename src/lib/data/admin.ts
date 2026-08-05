import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfile, getSessionUser, type MyProfile } from "@/lib/data/user";
// ponytail: 여기 있던 getAdminCounts/AdminCounts 는 **부르는 곳이 하나도 없는 죽은 코드**였다.
//   대시보드 숫자는 RPC admin_dashboard(20260804200000)가 만든다. 그 안의 '승인됐는데 닫힌 주문'
//   카운터는 술어가 `status='CANCELED' and imp_uid is not null` 이었는데, CANCELED 를 쓰는 곳은
//   abandonAdOrder 하나뿐이고 그 대상은 PREPARE(=거래번호가 없는 상태)라 **어떤 사고가 나도
//   영원히 0** 이었다. 고쳐서 되살리기보다 지운다 — 안 쓰는 화면의 거짓 숫자를 유지할 이유가 없다.

/**
 * 🔐 관리자 전용 화면·서버 액션의 문지기.
 *
 * 🔴 `role` 이 아니라 `isAdmin` 으로 판정한다.
 *    보기 전환(setViewAs) 쿠키가 `role` 을 병원·간호사로 바꿔 보이게 하므로, `role === 'admin'`
 *    으로 검사하면 관리자가 병원 화면을 확인하는 동안 자기 관리자 페이지에서 튕긴다.
 *    같은 함정을 lib/data/talent.ts 가 이미 주석으로 경고하고 있다.
 *
 * 🔴 redirect 가 아니라 notFound() 다.
 *    /mypage 로 되돌리면 "관리자 페이지가 있긴 있다"는 사실이 새어 나간다. 404 면 주소를 찍어본
 *    사람이 얻는 정보가 0이다.
 *
 * 🔴 layout 에 걸었더라도 **서버 액션에서 다시 불러야 한다.**
 *    서버 액션은 layout 을 지나지 않는다. 액션에서 빠뜨리면 로그인만 한 사람이 액션을 직접 호출할 수 있다.
 */
export async function requireAdmin(): Promise<MyProfile> {
  const p = await getMyProfile(); // cache() — 같은 요청에서 layout+page 가 함께 불러도 쿼리 1회
  if (!p?.isAdmin) notFound();
  return p;
}

export type AdminAction = {
  /** '대상.동작' 형태. 예: 'ad.free_activate' · 'review.hide' · 'user.suspend' */
  action: string;
  targetTable: string;
  targetId: string;
  /** 왜 했는가. DB 가 not null 로 강제한다 — 사유 없는 조치를 만들지 못하게. */
  reason: string;
};

/**
 * 관리자가 남의 데이터를 건드린 기록.
 *
 * 🔴 **먼저 남기고 그 다음에 실행한다.** 실패하면 throw 해서 작업을 중단시킨다.
 *    반대 순서(실행 후 기록)면 기록이 실패한 변경이 남는다 — 이 표가 막으려는 게 바로 그거다.
 *    기록만 남고 실행이 실패한 경우는 무해하다(안 일어난 일의 기록일 뿐, 추적은 가능하다).
 */
export async function logAdmin(entry: AdminAction): Promise<void> {
  const user = await getSessionUser();
  if (!user) throw new Error("logAdmin: 세션이 없다");
  const supabase = await createClient();
  // 🔴 actor_email 은 여기서 보내지 않는다. 계정이 지워지면 actor_id 가 null 이 되어(FK set null)
  //    이메일이 유일한 식별자로 남는데, 앱이 보낼 수 있으면 그게 곧 유일한 위조 지점이 된다.
  //    DB 트리거가 세션(JWT)에서 직접 찍는다 — 권한도 회수돼 있어 보내면 거절된다.
  const { error } = await supabase.from("admin_actions").insert({
    actor_id: user.id,
    action: entry.action,
    target_table: entry.targetTable,
    target_id: entry.targetId,
    reason: entry.reason,
  });
  if (error) throw new Error(`감사 로그 실패로 작업을 중단했다: ${error.message}`);
}

// ── 모더레이션 ────────────────────────────────────────────────

/**
 * 숨길 수 있는 대상. DB 함수 admin_set_hidden 의 화이트리스트와 **같은 목록이어야 한다.**
 * 여기만 늘리면 DB 함수가 '숨길 수 없는 대상입니다' 로 거절한다 — 조용히 어긋나지는 않는다.
 */
export const HIDEABLE = ["reviews", "board_posts", "board_comments"] as const;
export type Hideable = (typeof HIDEABLE)[number];

/** 화면·서버 액션 양쪽에서 쓰는 런타임 검사. `as Hideable` 캐스팅을 한 곳으로 모은다. */
export function isHideable(v: string | undefined | null): v is Hideable {
  return HIDEABLE.includes(v as Hideable);
}

export const MODERATION_PER_PAGE = 30;

export type ModRow = {
  id: string;
  is_hidden: boolean;
  created_at: string;
  /** 화면에 보여줄 본문 요약 — 리뷰는 content, 글은 제목+본문, 댓글은 body */
  text: string;
  /** 리뷰면 병원 이름, 게시판이면 작성자 이름 */
  who: string;
};

const clip = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * 모더레이션 목록. `hidden` 으로 숨김만/보이는 것만 나눠 본다.
 *
 * 🔴 세 표를 한 함수로 받는 이유: 화면이 하는 일이 똑같다(목록 → 사유 적고 숨김).
 *    표마다 함수를 따로 두면 화면도 세 벌이 된다. 대신 표 이름은 HIDEABLE 로 좁혀 받는다.
 */
export async function getModerationRows(
  kind: Hideable,
  { hidden = false, page = 1 }: { hidden?: boolean; page?: number } = {},
): Promise<{ rows: ModRow[]; total: number }> {
  await requireAdmin();
  const supabase = await createClient();
  const from = (Math.max(1, page) - 1) * MODERATION_PER_PAGE;
  const to = from + MODERATION_PER_PAGE - 1;

  if (kind === "reviews") {
    type Raw = { id: string; is_hidden: boolean; created_at: string; rating: number; content: string; hospital: { name: string } | null };
    const { data, count, error } = await supabase
      .from("reviews").select("id,is_hidden,created_at,rating,content,hospital:hospitals(name)", { count: "exact" })
      .eq("is_hidden", hidden).order("created_at", { ascending: false }).range(from, to).returns<Raw[]>();
    if (error) console.error("getModerationRows(reviews):", error.message);
    return {
      rows: (data ?? []).map((r) => ({
        id: r.id, is_hidden: r.is_hidden, created_at: r.created_at,
        text: clip(r.content), who: `${r.hospital?.name ?? "(병원 없음)"} · 별점 ${r.rating}`,
      })),
      total: count ?? 0,
    };
  }

  if (kind === "board_posts") {
    type Raw = { id: string; is_hidden: boolean; created_at: string; title: string; body: string; legacy_nickname: string | null; author: { display_name: string | null } | null };
    const { data, count, error } = await supabase
      .from("board_posts").select("id,is_hidden,created_at,title,body,legacy_nickname,author:profiles(display_name)", { count: "exact" })
      .eq("is_hidden", hidden).order("created_at", { ascending: false }).range(from, to).returns<Raw[]>();
    if (error) console.error("getModerationRows(board_posts):", error.message);
    return {
      rows: (data ?? []).map((p) => ({
        id: p.id, is_hidden: p.is_hidden, created_at: p.created_at,
        text: clip(`${p.title} — ${p.body}`), who: p.author?.display_name ?? p.legacy_nickname ?? "탈퇴한 회원",
      })),
      total: count ?? 0,
    };
  }

  type Raw = { id: string; is_hidden: boolean; created_at: string; body: string; legacy_nickname: string | null; author: { display_name: string | null } | null };
  const { data, count, error } = await supabase
    .from("board_comments").select("id,is_hidden,created_at,body,legacy_nickname,author:profiles(display_name)", { count: "exact" })
    .eq("is_hidden", hidden).order("created_at", { ascending: false }).range(from, to).returns<Raw[]>();
  if (error) console.error("getModerationRows(board_comments):", error.message);
  return {
    rows: (data ?? []).map((c) => ({
      id: c.id, is_hidden: c.is_hidden, created_at: c.created_at,
      text: clip(c.body), who: c.author?.display_name ?? c.legacy_nickname ?? "탈퇴한 회원",
    })),
    total: count ?? 0,
  };
}
