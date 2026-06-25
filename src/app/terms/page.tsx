import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/data/user";

export const metadata = {
  title: "이용약관 — 널스넷",
  description: "널스넷 서비스 이용약관.",
  robots: { index: false, follow: false },
};

export default async function TermsPage() {
  const user = await getCurrentUser();
  return (
    <>
      <SiteHeader user={user} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">이용약관</h1>
        <p className="mt-1 text-sm text-slate-500">시행일: 2026년 6월 26일</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
          <section>
            <h2 className="font-bold text-slate-900">제1조 (목적)</h2>
            <p className="mt-1">본 약관은 널스넷(이하 &quot;회사&quot;)이 제공하는 간호 인력 채용 중개 서비스(이하 &quot;서비스&quot;)의 이용에 관한 회사와 회원 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">제2조 (정의)</h2>
            <p className="mt-1">&quot;회원&quot;이란 본 약관에 동의하고 가입한 자로, 구직 활동을 하는 &quot;간호사 회원&quot;과 채용공고를 등록하는 &quot;병원 회원&quot;으로 구분합니다. &quot;게시물&quot;이란 회원이 등록한 채용공고, 이력서, 병원 리뷰, 메시지 등을 말합니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">제3조 (약관의 효력 및 변경)</h2>
            <p className="mt-1">본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다. 회사는 관련 법령을 위배하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 적용일자와 사유를 사전에 공지합니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">제4조 (회원가입)</h2>
            <p className="mt-1">이용자는 이메일 또는 제휴 소셜 계정으로 가입할 수 있으며, 1인 1계정을 원칙으로 합니다. 가입 시 정확한 정보를 제공해야 하며 타인의 정보를 도용할 수 없습니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">제5조 (서비스의 내용)</h2>
            <p className="mt-1">회사는 채용공고 검색·지원, 공고 등록, 병원 리뷰, 메시지 등의 기능을 제공합니다. 간호사 회원의 이력서 등록 및 공고 지원은 무료입니다. 병원 회원의 공고 등록은 사업자등록 진위확인을 거친 후 이용할 수 있습니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">제6조 (회원의 의무)</h2>
            <p className="mt-1">회원은 허위 정보 등록, 타인 권리 침해, 법령·공서양속 위반 행위를 해서는 안 됩니다. 채용공고와 리뷰는 사실에 근거하여 작성해야 합니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">제7조 (게시물의 관리)</h2>
            <p className="mt-1">게시물에 대한 책임은 작성한 회원에게 있습니다. 회사는 게시물이 관련 법령 또는 본 약관을 위반하는 경우 사전 통지 없이 삭제하거나 게시를 제한할 수 있습니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">제8조 (책임의 한계)</h2>
            <p className="mt-1">회사는 채용 정보를 중개하는 플랫폼으로서, 회원 간 체결되는 근로계약·근무조건·채용 결과에 대해 책임을 지지 않습니다. 회원은 거래 상대방의 정보를 스스로 확인할 책임이 있습니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">제9조 (준거법 및 관할)</h2>
            <p className="mt-1">본 약관은 대한민국 법령에 따라 해석되며, 서비스 이용과 관련한 분쟁은 민사소송법상의 관할 법원을 제1심 관할로 합니다.</p>
          </section>
          <section>
            <h2 className="font-bold text-slate-900">문의</h2>
            <p className="mt-1">약관 관련 문의: 널스넷 운영팀 (howtattoo@howtattoo.co.kr)</p>
          </section>
        </div>
      </main>
    </>
  );
}
