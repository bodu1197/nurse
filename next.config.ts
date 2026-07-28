import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 이력서 사진 때문에 기본값(1MB)에서 조금만 올린다.
    //
    // 왜 필요: 기본 상한에서는 사진이 서버 액션에 닿기도 전에 막혀, 우리 안내("2MB 이하만 …")
    // 대신 "A server error occurred" 회색 화면이 떴다(실측 5.6MB).
    //
    // 🔴 왜 크게 올리지 않는가: 이건 **전역 설정**이라 이 저장소의 서버 액션 38개 전부에 걸린다.
    //    Next 가 1MB 를 기본으로 둔 이유가 "과도한 자원 소모·DDoS 방지"라고 문서에 명시돼 있다.
    //    사진 상한(2MB) + multipart 오버헤드만 넘기면 충분하다.
    //    실제 사용자는 화면에서 캔버스로 줄여 보내므로(PhotoPicker) 보통 100~400KB 만 올라온다.
    serverActions: { bodySizeLimit: "3mb" },
  },
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
