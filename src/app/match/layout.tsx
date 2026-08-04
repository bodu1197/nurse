import SiteHeader from "@/components/SiteHeader";
import { getMyProfile } from "@/lib/data/user";

// 헤더를 화면과 로딩(loading.tsx)이 공유한다. 페이지 안에서 그리면 로딩 중에는 헤더가 사라졌다가
// 다시 나타나 화면이 튄다(/jobs 와 같은 구성). getMyProfile 은 cache() 라 페이지가 다시 불러도 쿼리는 안 는다.
export default async function MatchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await getMyProfile();
  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
      {children}
    </>
  );
}
