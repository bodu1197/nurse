import { createClient } from "@/lib/supabase/server";

export type Resume = {
  name: string | null;
  phone: string | null;
  license_type: string | null;
  license_no: string | null;
  experience_years: number | null;
  education: string | null;
  specialties: string[];
  desired_location: string | null;
  desired_employment_type: string | null;
  desired_salary: string | null;
  intro: string | null;
  is_public: boolean;
};

const COLS =
  "name,phone,license_type,license_no,experience_years,education,specialties,desired_location,desired_employment_type,desired_salary,intro,is_public";

export async function getMyResume(): Promise<Resume | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("resumes").select(COLS).eq("profile_id", user.id).limit(1).returns<Resume[]>();
  return data?.[0] ?? null;
}
