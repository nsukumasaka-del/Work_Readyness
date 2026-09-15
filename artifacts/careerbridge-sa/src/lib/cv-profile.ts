import { readStoredProfile } from "@/lib/entitlements";

export type CareerProfile = {
  id: number;
  name: string;
  email: string;
  phone?: string;
  location?: string;
  targetRole?: string;
  createdAt: string;
  profileCount?: number;
};

/** Upsert a real career_profiles row and sync local storage. Never invent profileId: 1. */
export async function ensureCvProfile(partial?: {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  targetRole?: string;
}): Promise<CareerProfile> {
  const existing = readStoredProfile();
  const name = (partial?.name || existing?.name || "Professional Candidate").trim();
  const email = (partial?.email || existing?.email || "candidate@bonlist.co.za")
    .trim()
    .toLowerCase();
  const response = await fetch("/api/career/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name,
      email,
      phone: (partial?.phone || existing?.phone || "").trim() || undefined,
      location: (partial?.location || existing?.location || "").trim() || undefined,
      targetRole: (partial?.targetRole || existing?.targetRole || "").trim() || undefined,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (payload as { error?: string }).error || "Could not prepare your BonList profile",
    );
  }
  const profile = payload as CareerProfile;
  try {
    sessionStorage.setItem("careerbridge-profile", JSON.stringify(profile));
    localStorage.setItem("careerbridge-profile", JSON.stringify(profile));
    sessionStorage.removeItem("bonlist-profile");
    localStorage.removeItem("bonlist-profile");
  } catch {
    // ignore storage failures
  }
  window.dispatchEvent(new Event("careerbridge-profile-updated"));
  return profile;
}
