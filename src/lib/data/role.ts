import type { Database } from "../../types/database";

// DB enum에서 파생 — 역할이 추가/변경되면 여기서 자동 반영(수기 중복 정의 금지).
export type Role = Database["public"]["Enums"]["user_role"];

// 관리자 보기 전환 판정 — 순수 함수(쿠키 위조 방어의 핵심이라 따로 떼서 테스트 가능하게 둠).
// DB 역할이 admin이 아니면 쿠키는 무조건 무시 → 일반 회원은 view_as 쿠키를 넣어도 권한이 안 바뀐다.
export function pickRole(dbRole: Role, cookieValue: string | undefined): Role {
  if (dbRole !== "admin") return dbRole;
  return cookieValue === "hospital" || cookieValue === "nurse" ? cookieValue : "admin";
}

// 역할 표시명 — 마이페이지/전환 배너 공용(같은 문구를 두 곳에 적지 않기 위해 여기 한 곳).
export const ROLE_LABEL: Record<Role, string> = {
  nurse: "간호사 회원",
  hospital: "병원 회원",
  admin: "관리자",
};
