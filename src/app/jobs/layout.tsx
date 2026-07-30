import SiteHeader from "@/components/SiteHeader";
import { getMyProfile } from "@/lib/data/user";

// 헤더를 목록·상세·404·로딩이 공유한다. 페이지마다 따로 그리면
// 로딩(loading.tsx) 중에는 헤더가 사라졌다가 다시 나타나 화면이 튄다.
// getMyProfile은 cache()라 페이지가 다시 불러도 쿼리는 늘지 않는다.
export default async function JobsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await getMyProfile();
  return (
    <>
      <SiteHeader user={profile ? { displayName: profile.displayName } : null} />
      {children}
    </>
  );
}
