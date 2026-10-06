import { readStoredProfile } from "@/lib/entitlements";
import { authFetch, readProfile as readAuthProfile, isExplicitlySignedOut, persistProfile } from "@/lib/auth-session";

export type CareerProfile = {
  id: number | string;
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
  const existing = readStoredProfile() || readAuthProfile();
  if (!existing || isExplicitlySignedOut()) throw new Error("Please sign in to prepare your profile");
  const name = (
    partial?.name ||
  existing?.name ||
  ""
  ).trim();
  const email = (partial?.email || existing?.email || "")
    .trim()
    .toLowerCase();
  if (!email) throw new Error("Your profile needs an email address");
  const response = await authFetch("/api/career/profile", {
    method: "POST",
    credentials: "include",
    body: JSON.stringify({
      name,
      email,
      phone: (partial?.phone || existing?.phone || "").trim() || undefined,
      location:
        (partial?.location || existing?.location || "").trim() || undefined,
      targetRole:
        (partial?.targetRole || existing?.targetRole || "").trim() || undefined,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (payload as { error?: string }).error ||
        "Could not prepare your BonList profile",
    );
  }
  const profile = payload as CareerProfile;
  persistProfile({ ...profile, profileCount: profile.profileCount ?? 0 });
  return profile;
}
