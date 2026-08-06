"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AVATAR_ACCEPT, AVATAR_MAX_BYTES, AVATAR_MAX_EDGE } from "@/lib/avatarLimits";

/**
 * 이력서 사진 고르기 — 고른 사진을 **브라우저에서 줄여서** 보낸다.
 *
 * 왜 필요했나(실측 2026-07-29): 요즘 휴대폰 사진은 3~5MB다. 그대로 올리면 Next.js Server Action 의
 * 본문 상한에 먼저 막혀 우리 안내("2MB 이하만") 대신 **"A server error occurred" 회색 화면**이 뜬다.
 * 사용자는 뭘 잘못했는지 알 수 없고, 구 널스넷에서 이런 게 이탈 원인이었다(오너 지적).
 *
 * 그래서 캔버스로 긴 변 {@link AVATAR_MAX_EDGE}px 까지 줄이고 JPEG 로 다시 뽑는다.
 * 3:4 증명사진이 보통 60~120KB 가 되어 상한 근처에도 안 간다. 저장 용량도 같이 줄어든다.
 *
 * ponytail: 라이브러리를 쓰지 않는다 — canvas 는 브라우저 기본 기능이고 이게 전부다.
 *   · EXIF 회전은 보정하지 않는다. 요즘 브라우저는 `createImageBitmap` 이 방향을 반영해 준다.
 *   · 자바스크립트가 꺼져 있으면 원본이 그대로 올라간다 → 서버가 크기·형식을 다시 검사한다(이중).
 */
export default function PhotoPicker({ hasPhoto }: Readonly<{ hasPhoto: boolean }>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 공용 SubmitButton 을 쓰지 않는 이유: 이 버튼은 제출 중(pending)뿐 아니라 **줄이는 중(busy)**
  // 에도 잠겨야 하고, 라벨이 등록/교체로 갈린다. 잠금 자체는 같은 useFormStatus 를 쓴다.
  const { pending } = useFormStatus();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { setNote(null); return; }
    if (!AVATAR_ACCEPT.includes(file.type)) {
      setNote("JPG · PNG · WEBP 만 올릴 수 있습니다.");
      e.target.value = "";
      return;
    }
    // 이미 충분히 작으면 굳이 다시 뽑지 않는다(원본 화질 보존).
    if (file.size <= 400 * 1024) { setNote(`${kb(file.size)} — 그대로 올립니다.`); return; }

    setBusy(true);
    try {
      const shrunk = await shrink(file);
      if (!shrunk) {
        // 줄이지 못했는데 원본이 상한을 넘으면 올려봐야 서버가 되돌려보낸다 → 여기서 끝낸다.
        if (file.size > AVATAR_MAX_BYTES) {
          setNote(`${kb(file.size)} — 너무 큽니다. 2MB 이하 사진을 골라 주세요.`);
          e.target.value = "";
          return;
        }
        setNote(`${kb(file.size)} — 줄이지 못해 원본을 올립니다.`);
        return;
      }
      const dt = new DataTransfer();
      dt.items.add(shrunk);
      if (inputRef.current) inputRef.current.files = dt.files;
      setNote(`${kb(file.size)} → ${kb(shrunk.size)} 로 줄여서 올립니다.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label htmlFor="photo" className="sr-only">사진 파일 선택</label>
      <input
        ref={inputRef} id="photo" type="file" name="photo" accept={AVATAR_ACCEPT} required
        onChange={onPick}
        className="min-w-0 flex-1 text-base file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:text-base file:font-medium file:text-slate-700"
      />
      <button
        type="submit" disabled={busy || pending}
        className="inline-flex min-h-11 items-center rounded-lg bg-teal-600 px-4 text-base font-bold text-white transition hover:bg-teal-700 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
      >
        {busy ? "사진 줄이는 중…" : pending ? "올리는 중…" : hasPhoto ? "사진 교체" : "사진 등록"}
      </button>
      {/* aria-live 는 **항상 DOM 에 둔다** — 조건부로 나타나면 일부 스크린리더가 첫 변화를 놓친다. */}
      <p aria-live="polite" className={note ? "w-full text-xs text-slate-600" : "sr-only"}>{note ?? ""}</p>
    </>
  );
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);

/** 긴 변을 AVATAR_MAX_EDGE 로 맞춰 JPEG 로 다시 뽑는다. 실패하면 null(원본을 그대로 보낸다). */
async function shrink(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, AVATAR_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // 🔴 JPEG 은 투명도가 없다. 배경을 안 채우고 그리면 투명 PNG·WEBP(배경 지운 증명사진)의
    //    투명 영역이 **검은색**으로 굳는다. 흰색으로 먼저 덮는다.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size > AVATAR_MAX_BYTES) return null;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return null; // 브라우저가 못 다루는 형식 등 — 서버 검증에 맡긴다
  }
}
