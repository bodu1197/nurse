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
  /**
   * 구 널스넷(라이믹스) 주소 → 새 주소.
   *
   * 🔴 도메인(nursenet.co.kr)을 이 앱으로 옮기면 레거시는 버린다(오너 확정 2026-07-30).
   *    그 순간 구글이 수년간 알고 있던 주소 6,209개가 전부 404 가 된다 — 문구만 옮기고
   *    주소를 버리면 쌓아둔 색인은 그대로 잃는다. 옮길 수 있는 것만이라도 이어준다.
   *    (전체 목록은 docs/legacy-urls.txt 에 받아뒀다. 레거시가 내려가면 다시 못 얻는다.)
   *
   * 상세 주소 처리(패턴별로 다르다):
   *  · /community_board/{id} 2,245 — **실제 글로 이어준다**. 게시글은 이관됐고 legacy_srl 에
   *    원본 번호가 남아 있다. DB 조회가 필요해 라우트 핸들러로 뺐다.
   *  · /job/person/view/{id} 3,544 · /job/job/view/{id} 384 — 대응할 글이 없다.
   *    인재는 원본 번호를 안 들고 왔고, 공고는 이관분이 43건뿐이다. 같은 성격의 목록으로 보낸다.
   *
   * 이 규칙은 도메인을 옮기기 전에도 무해하다 — 새 앱에는 이 주소들이 없다.
   */
  async redirects() {
    const to = (source: string, destination: string) => ({ source, destination, permanent: true });
    return [
      // 목록·정적 — 실제로 대응하는 화면이 있다
      to("/job/job/list", "/jobs"),
      to("/job/person/list", "/talent"),
      to("/community_board", "/board"),
      { source: "/community", destination: "/board", permanent: false }, // 흔한 이름 — 위와 같은 이유로 307
      to("/information_share", "/board"),
      to("/tos", "/terms"),
      to("/customer", "/contact"),
      to("/board_qna", "/contact"),
      to("/service_information", "/hospital"),
      // 상세 — 원본이 없어졌으니 같은 성격의 목록으로 보낸다
      to("/job/job/view/:id", "/jobs"),
      to("/job/person/view/:id", "/talent"),
      // /community_board/:id 는 여기 없다 — legacy_srl 로 실제 글을 찾아가야 해서
      //   라우트 핸들러로 분리했다(src/app/community_board/[id]/route.ts). config redirects 는 DB 를 못 본다.
      to("/information_share/:id", "/board"),
      to("/pic_board/:id", "/board"),
      to("/video_board/:id", "/board"),
      to("/board_qna/:id", "/contact"),
      // 새 사이트에 대응이 없는 것 — 홈으로.
      // 🔴 이 넷만 permanent:false(307). 흔한 이름이라 나중에 이 앱이 /notice(공지사항) 같은
      //    페이지를 만들 수 있는데, config redirects 는 파일시스템 라우트보다 **먼저** 돌아
      //    308 로 굳혀두면 그 페이지가 영원히 안 열린다(브라우저가 308 을 무기한 캐시한다).
      { source: "/schedule", destination: "/", permanent: false },
      { source: "/notice", destination: "/", permanent: false },
      { source: "/notice/:id", destination: "/", permanent: false },
      { source: "/event_board/:path*", destination: "/", permanent: false },
    ];
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
