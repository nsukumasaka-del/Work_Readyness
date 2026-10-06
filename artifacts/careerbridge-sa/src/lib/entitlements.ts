import type { UserProfile } from "@workspace/api-client-react";
import { authFetch, readProfile } from "@/lib/auth-session";

export type PlanId = "free" | "job_seeker" | "career_pro";

export type Entitlement = {
  profileId: number;
  plan: PlanId;
  planName: string;
  accessLevel: PlanId;
  features: {
    premiumJobs: boolean;
    advancedMatching: boolean;
    advancedCvTools: boolean;
    interviewTools: boolean;
    premiumAiTools: boolean;
    programmeContent: boolean;
  };
  subscription: {
    id: number;
    plan: PlanId;
    status: string;
    startedAt: string;
    endsAt: string | null;
  } | null;
  programme: {
    id: number;
    status: "active" | "expired" | "cancelled";
    startDate: string;
    endDate: string;
    daysRemaining: number;
    currentMonth: 1 | 2 | 3;
    completedLessons: string[];
    currentLessonId: string | null;
    progressPercent: number;
    amountPaid: number;
  } | null;
};

const FREE_FEATURES: Entitlement["features"] = {
  premiumJobs: false,
  advancedMatching: false,
  advancedCvTools: false,
  interviewTools: false,
  premiumAiTools: false,
  programmeContent: false,
};

function numericProfileId(profileId: string | number): number {
  const parsed = Number(profileId);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function defaultEntitlement(
  profileId: string | number = 0,
): Entitlement {
  return {
    profileId: numericProfileId(profileId),
    plan: "free",
    planName: "Free",
    accessLevel: "free",
    features: { ...FREE_FEATURES },
    subscription: null,
    programme: null,
  };
}

export async function fetchEntitlement(
  profileId: string | number,
): Promise<Entitlement> {
  const id = numericProfileId(profileId);
  if (!id) return defaultEntitlement();
  const response = await authFetch(`/api/career/entitlements?profileId=${id}`);
  if (!response.ok) return defaultEntitlement(id);
  return (await response.json()) as Entitlement;
}

export function readStoredProfile(): UserProfile | null {
  return readProfile();
}

export function formatZar(amount: number) {
  if (amount === 0) return "R0";
  return `R${amount.toLocaleString("en-ZA")}`;
}

export function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
