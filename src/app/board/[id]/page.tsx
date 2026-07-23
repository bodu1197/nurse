import { redirect } from "next/navigation";

// 게시판은 /board 마스터-디테일(좌측 목록 + 우측 상세)로 통일했다.
// 예전 링크·공유 주소(/board/[id])는 그 화면의 선택 상태(?p=)로 넘겨준다.
export default async function BoardPostRedirect({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  redirect(`/board?p=${encodeURIComponent(id)}`);
}
