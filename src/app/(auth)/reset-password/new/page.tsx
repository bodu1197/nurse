import Link from "next/link";
import { cookies } from "next/headers";
import DismissibleError from "@/components/DismissibleError";
import SubmitButton from "@/components/SubmitButton";
import Button from "@/components/Button";
import { authErrorMessage, INPUT_CLASS, LINK_CLASS, MIN_PASSWORD, RECOVERY_COOKIE } from "@/lib/constants";
import { getSessionUser } from "@/lib/data/user";
import { updatePassword } from "../../actions";

export const metadata = {
  title: "새 비밀번호 설정 — 널스넷",
  robots: { index: false, follow: false },
};

function Expired() {
  return (
    <>
      <h1 className="mt-8 text-center text-xl font-bold text-slate-900">링크가 만료되었습니다</h1>
      <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">
        재설정 링크는 메일을 받은 뒤 1시간 동안만 쓸 수 있고, 한 번 사용하면 끝납니다. 다시 받아 주세요.
      </p>
      <div className="mt-6 flex justify-center">
        <Button href="/reset-password" size="lg">재설정 링크 다시 받기</Button>
      </div>
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className={LINK_CLASS}>로그인으로 돌아가기</Link>
      </p>
    </>
  );
}

// 메일 링크 → /auth/confirm 에서 세션 + 표시 쿠키가 만들어진 뒤 이 화면으로 온다.
// 쿠키가 없다면 링크가 만료됐거나, 그냥 로그인한 사람이 주소를 직접 친 것이다.
// (로그인만으로 통과시키면 기존 비밀번호를 몰라도 바꿀 수 있게 된다.)
export default async function NewPasswordPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ error?: string; ok?: string }> }>) {
  const { error, ok } = await searchParams;

  if (ok === "1") {
    return (
      <>
        <h1 className="mt-8 text-center text-xl font-bold text-slate-900">비밀번호를 바꿨습니다</h1>
        <p className="mt-2 text-center text-sm text-slate-500">다음 로그인부터 새 비밀번호를 쓰세요.</p>
        <div className="mt-6 flex justify-center">
          <Button href="/mypage" size="lg">마이페이지로</Button>
        </div>
      </>
    );
  }

  // 쿠키부터 본다 — 없으면 어차피 만료 화면이라 세션 조회(네트워크)까지 갈 이유가 없다.
  const recoveredId = (await cookies()).get(RECOVERY_COOKIE)?.value;
  if (!recoveredId) return <Expired />;
  const user = await getSessionUser();
  if (!user || user.id !== recoveredId) return <Expired />;

  return (
    <>
      <h1 className="mt-8 text-center text-xl font-bold text-slate-900">새 비밀번호 설정</h1>
      {user.email && <p className="mt-2 text-center text-sm text-slate-500">{user.email}</p>}

      {error && <DismissibleError message={authErrorMessage(error) ?? "저장에 실패했습니다. 다시 시도해 주세요."} />}

      <form action={updatePassword} className="mt-6 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            새 비밀번호 <span className="text-slate-500">({MIN_PASSWORD}자 이상)</span>
          </label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required className={INPUT_CLASS} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="password_confirm" className="text-sm font-medium text-slate-700">새 비밀번호 확인</label>
          <input id="password_confirm" name="password_confirm" type="password" autoComplete="new-password" minLength={MIN_PASSWORD} required className={INPUT_CLASS} />
        </div>
        <SubmitButton pendingText="저장 중…">비밀번호 바꾸기</SubmitButton>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className={LINK_CLASS}>로그인으로 돌아가기</Link>
      </p>
    </>
  );
}
