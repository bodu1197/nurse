"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBusiness } from "@/lib/data/nts";

// 병원 사업자 진위확인 → 통과 시에만 business_verified(서버=service_role) 설정.
export async function verifyHospitalBusiness(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: prof } = await admin.from("profiles").select("role, business_verified").eq("id", user.id).maybeSingle();
  if (!prof || prof.role !== "hospital") redirect("/mypage");
  if (prof.business_verified) redirect("/mypage/verify?ok=1");

  const b_no = String(formData.get("b_no") ?? "");
  const start_dt = String(formData.get("start_dt") ?? "");
  const p_nm = String(formData.get("p_nm") ?? "");

  const res = await verifyBusiness(b_no, start_dt, p_nm);
  if (!res.ok) redirect(`/mypage/verify?error=${res.reason ?? "fail"}`);

  await admin
    .from("profiles")
    .update({ business_no: b_no.replace(/\D/g, ""), business_verified: true, business_verified_at: new Date().toISOString() })
    .eq("id", user.id);

  redirect("/mypage/verify?ok=1");
}
