// /jobs 데모용 mock 공고 (Indeed 구조 검증용). 추후 Supabase jobs 조회로 교체.
export type JobSource = "direct" | "worknet" | "public_data";

export type Job = {
  id: string;
  title: string;
  hospital: string;
  rating?: number;
  reviews?: number;
  location: string;
  specialty: string;
  employmentType: string;
  salary: string;
  source: JobSource;
  postedDays: number;
  benefits: string[];
  description: string;
};

export const MOCK_JOBS: Job[] = [
  {
    id: "j1", title: "중환자실(ICU) 간호사 모집 — 경력 우대", hospital: "서울중앙병원",
    rating: 4.6, reviews: 128, location: "서울 송파구", specialty: "중환자실", employmentType: "정규직",
    salary: "연 4,200~5,000만원", source: "direct", postedDays: 1,
    benefits: ["기숙사 제공", "4대보험", "신규 지원금", "교육비 지원"],
    description: "중환자실(ICU) 간호 업무를 담당합니다. 환자 모니터링, 투약, 처치 보조 및 기록. 3교대 근무이며 신규·경력 모두 지원 가능합니다.",
  },
  {
    id: "j2", title: "수술실(OR) 간호사 — 신입/경력", hospital: "부산세계로병원",
    rating: 4.2, reviews: 54, location: "부산 해운대구", specialty: "수술실", employmentType: "정규직",
    salary: "월 320~380만원", source: "worknet", postedDays: 2,
    benefits: ["경력 우대", "인센티브", "중식 제공"],
    description: "수술실 소독·순환 간호 업무. 수술 준비 및 기구 관리, 수술 중 보조. 신입 교육 프로그램 운영.",
  },
  {
    id: "j3", title: "병동 간호사 (요양) — 야간 전담 가능", hospital: "대전우리요양병원",
    rating: 4.0, reviews: 31, location: "대전 유성구", specialty: "요양병원", employmentType: "계약직",
    salary: "월 360만원~", source: "public_data", postedDays: 3,
    benefits: ["야간전담", "주 3일 근무", "퇴직금"],
    description: "요양병원 병동 간호 업무. 어르신 케어, 투약, 기록. 야간 전담 선택 가능.",
  },
  {
    id: "j4", title: "응급실(ER) 간호사 정규직 채용", hospital: "연세그린병원",
    rating: 4.8, reviews: 210, location: "서울 서대문구", specialty: "응급실", employmentType: "정규직",
    salary: "연 4,500만원~", source: "direct", postedDays: 1,
    benefits: ["복지 우수", "교육 지원", "신규 지원금", "명절 상여"],
    description: "응급실 간호 업무. 응급환자 분류(트리아지), 응급처치 보조, 모니터링. 3교대.",
  },
  {
    id: "j5", title: "외래 간호사 (Day) — 상근", hospital: "인천나래의원",
    location: "인천 연수구", specialty: "외래", employmentType: "정규직",
    salary: "월 280~330만원", source: "worknet", postedDays: 5,
    benefits: ["주 5일", "정시 퇴근", "4대보험"],
    description: "외래 진료 보조 및 환자 안내, 처치, 접수 지원. 주간 상근 근무.",
  },
  {
    id: "j6", title: "정신과 병동 간호사 — 경력 무관", hospital: "경기365정신건강병원",
    rating: 4.3, reviews: 42, location: "경기 수원시", specialty: "정신과", employmentType: "정규직",
    salary: "연 3,900~4,400만원", source: "direct", postedDays: 4,
    benefits: ["경력 무관", "기숙사", "교육비 지원"],
    description: "정신건강의학과 병동 간호. 환자 관찰, 투약, 프로그램 보조. 신규 교육 제공.",
  },
];

export const SOURCE_LABEL: Record<JobSource, string> = {
  direct: "병원 직접",
  worknet: "워크넷",
  public_data: "공공데이터",
};
