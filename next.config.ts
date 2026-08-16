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
    // 🔴 **호스트 규칙이 맨 앞이어야 한다.** 아래 레거시 규칙이 먼저 걸리면 들어온 호스트를 그대로
    //    유지한 채 접혀서, www 로 들어온 사람이 영영 www 안에 갇힌다(실측 2026-08-06:
    //    www.nursenet.co.kr/community_board/20113 → www.nursenet.co.kr/board?p=… — route.ts 가
    //    request 의 origin 을 그대로 쓰기 때문이다).
    // 🔴 **`/api` 는 반드시 제외한다.** 호스트 정규화는 크롤러가 보는 *문서* 경로에만 필요한데,
    //    `/:path*` 로 두면 빌드된 정규식이 `^(?!/_next)…` 라 `/_next` 만 빠지고 `/api/*` 가 통째로 걸린다
    //    (.next/routes-manifest.json 으로 확인). 그러면 두 가지가 조용히 죽는다:
    //     · vercel.json 의 크론 3개 — Vercel 은 크론을 배포 URL(…vercel.app)로 호출하는데, 308 만 받고
    //       라우트에 닿지 못한다. 3xx 는 실패가 아니라 **크론 로그에는 성공처럼 남는다.**
    //       그중 guard-avatars-bucket 은 avatars 버킷을 비공개로 되돌리는 **유일한 강제 장치**다
    //       (간호사 얼굴 사진 1,487장). sync-worknet 이 멈추면 /jobs 데이터가 굳는다.
    //     · 포트원 웹훅(/api/iamport/webhook, POST) — 웹훅 발신자는 3xx 를 따라가지 않는 경우가 흔하다.
    //       그 라우트가 "복귀 화면을 놓친 손님에게는 광고를 켜는 유일한 경로" 다.
    const canonicalHost = (host: string) => ({
      source: "/:path((?!api/).*)",
      has: [{ type: "host" as const, value: host }],
      destination: `https://nursenet.co.kr/:path`,
      permanent: true,
    });
    return [
      // 🔴 정본 호스트는 nursenet.co.kr 하나다. 실측(2026-08-06) 세 호스트가 전부 200 을 돌려주고 있었다 —
      //    apex · www · nurse-app-nine.vercel.app. canonical 태그는 **힌트일 뿐**이라 크롤러는 세 벌을
      //    다 가져간 뒤에야 그걸 읽고, 무시하면 vercel.app 이 브랜드 도메인 대신 검색결과에 뜬다.
      //    (네이버는 canonical 처리가 구글보다 약해 위험이 더 크다.)
      //    🔴 값을 정확히 적는다 — `nurse-app-nine.vercel.app` 만 잡고 `nurse-app-*.vercel.app` 형태의
      //       **미리보기 배포는 건드리지 않는다.** 넓게 잡으면 미리보기가 전부 운영으로 튕겨 못 쓰게 된다.
      canonicalHost("www.nursenet.co.kr"),
      canonicalHost("nurse-app-nine.vercel.app"),
      // 목록·정적 — 실제로 대응하는 화면이 있다
      to("/job/job/list", "/jobs"),
      to("/job/person/list", "/talent"),
      to("/community_board", "/board"),
      { source: "/community", destination: "/board", permanent: false }, // 흔한 이름 — 위와 같은 이유로 307
      to("/information_share", "/board"),
      to("/tos", "/terms"),
      // /customer 는 이제 실제 페이지다(고객센터 허브) — 리다이렉트를 걷었다.
      to("/board_qna", "/faq"),
      to("/service_information", "/ads"),
      // 상세 — 원본이 없어졌으니 같은 성격의 목록으로 보낸다
      to("/job/job/view/:id", "/jobs"),
      to("/job/person/view/:id", "/talent"),
      // /community_board/:id 는 여기 없다 — legacy_srl 로 실제 글을 찾아가야 해서
      //   라우트 핸들러로 분리했다(src/app/community_board/[id]/route.ts). config redirects 는 DB 를 못 본다.
      to("/information_share/:id", "/board"),
      to("/pic_board/:id", "/board"),
      to("/video_board/:id", "/board"),
      to("/board_qna/:id", "/faq"),
      // 🔴 여기부터 permanent:false(307). 흔한 이름이라 나중에 이 앱이 같은 이름의 페이지를
      //    만들 수 있는데, config redirects 는 파일시스템 라우트보다 **먼저** 돌아
      //    308 로 굳혀두면 그 페이지가 영원히 안 열린다(브라우저가 308 을 무기한 캐시한다).
      //    실제로 /notice 가 그렇게 됐다 — 307 로 둔 덕분에 지금 공지사항 페이지를 열 수 있었다.
      // 🔴 게시판을 사용자에게 닫는다(오너 지시 2026-08-16). 글 2,857건 중 2,856건이 레거시
      //    이관분 — 운영자가 지어 쓴 가짜 글이라 사람에게 보이면 안 된다. 메뉴에서 빼는 것만으로는
      //    부족하다: 주소를 직접 치거나 옛 링크(/community_board/:id → /board?p=…, /information_share/:id,
      //    /pic_board/:id, /video_board/:id 전부 /board 로 접힌다)로 들어오면 그대로 보인다.
      //    글은 지우지 않는다 — 관리자는 /admin/moderation 에서 계속 본다.
      //    307 이어야 한다(위 주석과 같은 이유).
      // 🔴 되살릴 땐 **아래 규칙 3개를 전부** 지운다(/board · /board/:path* · /community_board/:path*)
      //    + board/actions.ts 의 BOARD_CLOSED 를 false 로. 세 개 중 하나라도 남기면 그만큼이 계속 죽는다
      //    (특히 /community_board/:path* 를 남기면 레거시 게시글 주소 2,245개가 글로 못 돌아간다).
      { source: "/board", destination: "/customer", permanent: false },
      { source: "/board/:path*", destination: "/customer", permanent: false },
      // 🔴 레거시 게시글 주소도 여기서 끊는다. 이게 없으면 /community_board/:id 라우트 핸들러가
      //    **요청마다 service-role 로 DB 를 뒤져** 글 id 를 찾은 뒤 /board?p=<uuid> 로 보내고,
      //    그게 다시 위 규칙에 걸려 /customer?p=<uuid> 가 된다. 셋 다 손해다:
      //     · 목적지가 닫혔는데 도는 무의미한 조회(레거시 URL 2,245개 + 봇 트래픽)
      //     · 비인증 공개 엔드포인트가 글 존재 여부와 내부 UUID 를 알려준다
      //     · 색인 대상인 /customer 에 ?p= 변종 주소가 최대 2,856개 생긴다
      //    config redirects 는 파일시스템 라우트보다 먼저 돌아 핸들러를 통째로 가린다 —
      //    그래서 route.ts 는 지우지 않고 남겨 둔다(되살릴 땐 이 규칙만 지우면 그대로 살아난다).
      { source: "/community_board/:path*", destination: "/customer", permanent: false },
      { source: "/schedule", destination: "/", permanent: false },
      // 🔴 하위 경로도 잡는다. 위 규칙은 **정확히 /schedule 만** 맞아서
      //    /schedule/selected_month/:id/selected_day/:id/insert 같은 구 널스넷 주소가 404 였다.
      //    접속 통계의 봇 칸이 이걸 드러냈다 — 30일간 봇 5,869회 + 사람 155회가 없는 페이지로 갔다
      //    (2026-08-06 실측). 크롤러가 404 를 계속 긁으면 색인 예산만 태운다.
      { source: "/schedule/:path*", destination: "/", permanent: false },
      // 공지·이벤트는 글이 몇 건뿐이라 목록에서 본문까지 보여준다 → 옛 상세 주소는 목록으로.
      // /notice 자체는 리다이렉트가 없다 — 같은 주소에 실제 페이지가 생겼다.
      { source: "/notice/:id", destination: "/notice", permanent: false },
      { source: "/event_board", destination: "/event", permanent: false },
      { source: "/event_board/:path*", destination: "/event", permanent: false },
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
