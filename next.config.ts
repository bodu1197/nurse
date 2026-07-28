import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // public/ 은 Next 가 지문을 안 붙여 기본값이 `max-age=0` — 재방문마다 448KB 를
        // 다시 검증한다(옛 next/font 자리인 _next/static 은 1년 immutable 이었다).
        // 파일명에 내용 해시가 박혀 있으니(scripts/build-fonts.py) 폰트가 바뀌면 URL 이
        // 바뀐다 → 옛 캐시에 갇힐 걱정 없이 immutable 을 걸 수 있다.
        // :path+ (1개 이상) — :path* 로 두면 파일이 아닌 `/fonts` 자체에도 규칙이 걸린다.
        // 지금은 Next 의 404 가 private,no-store 로 덮어써서 문제가 안 되지만, 규칙이
        // 실제 파일에만 닿게 좁혀 두는 편이 그 동작에 기대지 않아 안전하다.
        source: "/fonts/:path+",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
