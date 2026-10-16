import { test } from "node:test";
import assert from "node:assert/strict";
import { CAREER_NEW, completeness, seeksNurseJobs, talentNoun } from "./resumeOptions.ts";

type Sheet = Parameters<typeof completeness>[0];
const sheet = (o: Partial<Sheet> = {}): Sheet => ({
  job_tracks: ["nurse"], career_level: CAREER_NEW,
  name: "가", phone: "010-0000-0000", license_type: "간호사", shift_types: ["3교대"], desired_location: "서울 종로구",
  email: "a@example.com", residence_region: "서울", license_year: 2020, certifications: ["BLS"], education_level: "4년제",
  education: "간호학과", specialties: ["내과"], desired_employment_type: "정규직", desired_salary: "협의",
  available_from: "즉시 가능", intro: "소개",
  ...o,
});

test("찾는 일자리 — 간호도 찾는가 / 이름이 가려졌을 때 부르는 말", () => {
  assert.equal(seeksNurseJobs(["nurse"]), true);
  assert.equal(seeksNurseJobs(["care"]), false);
  assert.equal(seeksNurseJobs(["nurse", "care"]), true, "간호사인데 간병도 하겠다는 사람");
  assert.equal(seeksNurseJobs([]), true, "비었으면 간호(이 칸이 생기기 전 이력서)");
  assert.equal(talentNoun(["care"]), "요양·간병");
  assert.equal(talentNoun(["nurse", "care"]), "간호사");
});

test("이력서 완성도 — 요양·간병만 찾으면 숨긴 간호 전용 항목(근무부서·자격증)은 빼고 센다", () => {
  assert.equal(completeness(sheet(), 0), 100);
  assert.equal(completeness(sheet({ job_tracks: ["care"], specialties: [], certifications: [] }), 0), 100,
    "채울 수 없는 칸 때문에 100%가 막히면 안 된다");
  assert.ok(completeness(sheet({ specialties: [], certifications: [] }), 0) < 100, "간호를 찾으면 그 칸도 센다");
  assert.ok(completeness(sheet({ job_tracks: ["nurse", "care"], specialties: [] }), 0) < 100, "둘 다면 간호와 같다");
});
