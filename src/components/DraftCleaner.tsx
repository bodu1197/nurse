"use client";

import { useEffect } from "react";
import { DRAFT_PREFIX } from "@/components/FormDraft";

/**
 * 로그아웃·회원 탈퇴 뒤 이 브라우저에 남은 이력서·공고 초안을 전부 지운다.
 *
 * 🔴 왜: 초안에는 이름·휴대폰·이메일·근무한 병원명·자기소개가 평문으로 들어 있다(FormDraft).
 *    서버에서는 탈퇴 시 profiles·resumes·증명사진까지 지우는데(처리방침 "지체 없이 파기") 정작
 *    같은 브라우저의 초안은 남아 있었다. 병동 공용 PC 에서 로그아웃한 다음 사람이 devtools 로
 *    읽을 수 있고, 키 자체가 그 사람의 이메일을 알려준다.
 *
 * 서버 액션은 localStorage 에 손댈 수 없으므로, 로그아웃·탈퇴가 **도착하는 화면**에서 지운다.
 */
export default function DraftCleaner({ keys }: Readonly<{ keys?: readonly string[] }>) {
  const only = keys?.join("|") ?? "";
  useEffect(() => {
    try {
      // keys 를 주면 그것만 — 지원을 마친 뒤 그 공고의 초안 하나만 거두는 식으로 쓴다.
      if (only) {
        for (const k of only.split("|")) localStorage.removeItem(k);
        return;
      }
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(DRAFT_PREFIX)) localStorage.removeItem(k);
      }
    } catch {
      // 시크릿 모드 등에서 접근이 막힐 수 있다 — 지울 게 없으므로 조용히 넘어간다.
    }
  }, [only]);
  return null;
}
