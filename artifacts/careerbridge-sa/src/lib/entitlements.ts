import type { UserProfile } from "@workspace/api-client-react";

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

export function defaultEntitlement(profileId = 0): Entitlement {
  return {
    profileId,
    plan: "free",
    planName: "Free",
    accessLevel: "free",
    features: { ...FREE_FEATURES },
    subscription: null,
    programme: null,
  };
}

export async function fetchEntitlement(profileId: number): Promise<Entitlement> {
  const response = await fetch(`/api/career/entitlements?profileId=${profileId}`);
  if (!response.ok) return defaultEntitlement(profileId);
  return (await response.json()) as Entitlement;
}

export function readStoredProfile(): UserProfile | null {
  try {
    const stored = sessionStorage.getItem("careerbridge-profile");
    return stored ? (JSON.parse(stored) as UserProfile) : null;
  } catch {
    return null;
  }
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
