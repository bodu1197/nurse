import SiteHeader from "@/components/SiteHeader";

// 공고 상세 캐시본의 머리말 — /jobs 의 layout.tsx 와 같은 자리에 같은 헤더를 그리되 **세션을 읽지 않는다**(비로그인만 여기 온다).
// 🔴 getMyProfile 을 부르면 캐시하려던 페이지가 동적으로 되돌아가 비로그인 요청이 전부 500 이 된다(app/not-found.tsx 주석).
export default function CachedJobsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <SiteHeader user={null} />
      {children}
    </>
  );
}
