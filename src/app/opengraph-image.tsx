import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "널스넷 — 간호사 채용";

// ImageResponse는 인라인 스타일만 지원(요구사항). Korean 폰트 미내장 → 영문 워드마크 사용.
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 96, fontWeight: 800 }}>
          <span style={{ color: "#0d9488" }}>+</span>
          <span style={{ color: "#0f172a" }}>
            Nurse<span style={{ color: "#0d9488" }}>Net</span>
          </span>
        </div>
        <div style={{ fontSize: 40, fontWeight: 600, color: "#475569", marginTop: 28 }}>
          Nursing jobs, one search away
        </div>
      </div>
    ),
    size,
  );
}
