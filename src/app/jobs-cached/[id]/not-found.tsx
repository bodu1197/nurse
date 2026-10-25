import { JobGone } from "@/app/jobs/[id]/not-found";

// 캐시본의 404 — /jobs/[id] 와 같은 안내. 비로그인만 오므로 '저장한 공고' 버튼은 없다(세션을 읽지 않는다).
export default function CachedJobNotFound() {
  return <JobGone nurse={false} />;
}
