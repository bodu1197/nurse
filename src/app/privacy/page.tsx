import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/data/user";

export const metadata = {
  title: "개인정보처리방침 — 널스넷",
  description: "널스넷 개인정보처리방침.",
  robots: { index: false, follow: false },
};

export default async function PrivacyPage() {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">개인정보처리방침</h1>
        <p className="mt-1 text-sm text-slate-500">시행일: 2026년 6월 26일</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
          <section>
            <h2 className="font-bold text-slate-900">1. 수집하는 개인정보 항목</h2>
            <p className="mt-1">회사는 서비스 제공을 위해 다음 정보를 수집합니다.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>공통: 이메일, 비밀번호(암호화 저장), 표시명</li>
              <li>간호사 회원: 이력서 정보(이름, 연락처, 경력, 희망 진료과·근무조건, 자기소개)</li>
              <li>병원 회원: 사업자등록번호, 대표자명, 개업일자(사업자 진위확인 목적)</li>
              <li>자동 수집: 서비스 이용 기록, 접속 로그</li>
            </ul>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">2. 개인정보의 이용 목적</h2>
            <p className="mt-1">회원 식별 및 인증, 채용 중개(지원·열람·메시지), 병원 사업자 진위확인, 서비스 운영 및 개선, 부정 이용 방지를 위해 이용합니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">3. 제3자 제공</h2>
            <p className="mt-1">회사는 원칙적으로 개인정보를 외부에 제공하지 않습니다. 다만 간호사 회원이 공고에 지원하는 경우, 해당 공고를 등록한 병원 회원에게 이력서 정보가 제공됩니다(서비스의 본질적 기능). 병원 사업자 진위확인을 위해 국세청 사업자등록 정보 진위확인 OpenAPI에 사업자등록번호·대표자명·개업일을 전송합니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">4. 처리 위탁</h2>
            <p className="mt-1">안정적인 서비스 제공을 위해 다음 업체에 개인정보 처리를 위탁합니다: Supabase(인증 및 데이터베이스 호스팅), Vercel(애플리케이션 호스팅).</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">5. 보유 및 이용 기간</h2>
            <p className="mt-1">회원 탈퇴 시 개인정보를 지체 없이 파기합니다. 다만 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">6. 이용자의 권리</h2>
            <p className="mt-1">이용자는 언제든지 자신의 개인정보를 열람·정정·삭제하거나 처리정지를 요청할 수 있으며, 회원 탈퇴를 통해 동의를 철회할 수 있습니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">7. 안전성 확보 조치</h2>
            <p className="mt-1">비밀번호는 암호화하여 저장하며, 데이터베이스 행 수준 보안(RLS)과 접근 통제를 통해 본인 또는 권한 있는 회원만 개인정보에 접근하도록 관리합니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">8. 개인정보 보호책임자 및 문의</h2>
            <p className="mt-1">개인정보 보호책임자: 널스넷 운영팀<br />문의: howtattoo@howtattoo.co.kr</p>
          </section>
        </div>
      </main>
    </>
  );
}
