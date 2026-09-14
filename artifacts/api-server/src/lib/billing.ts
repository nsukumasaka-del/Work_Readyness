import { db, programmesTable, subscriptionsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";

export type PlanId = "free" | "job_seeker" | "career_pro";

export const PLAN_CATALOG = [
  {
    id: "free" as const,
    name: "Free",
    priceZar: 0,
    billing: "month" as const,
    tagline: "Start building your foundation.",
    features: [
      "Profile and career basics",
      "CV upload and core diagnostic",
      "Standard job matches",
      "Interview prep introduction",
    ],
  },
  {
    id: "job_seeker" as const,
    name: "Job Seeker",
    priceZar: 149,
    billing: "month" as const,
    tagline: "Search smarter and unlock stronger matches.",
    features: [
      "Everything in Free",
      "Premium 90%+ job matches",
      "Advanced job matching",
      "Enhanced CV feedback",
      "Application strategy tips",
    ],
  },
  {
    id: "career_pro" as const,
    name: "Career Pro",
    priceZar: 299,
    billing: "month" as const,
    tagline: "Full AI career toolkit for serious candidates.",
    features: [
      "Everything in Job Seeker",
      "Advanced CV and cover-letter tools",
      "Full interview preparation suite",
      "Premium AI career tools",
      "Strategic AI usage guidance",
      "All relevant platform resources",
    ],
  },
] as const;

export const PROGRAMME = {
  id: "career_accelerator" as const,
  name: "3-Month Career & Interview Coaching Programme",
  shortName: "Career Accelerator",
  priceZar: 2000,
  billing: "once" as const,
  durationMonths: 3,
  headline: "STOP SOUNDING LIKE EVERYONE ELSE.",
  tagline: "A 3-Month Career Transformation Programme.",
  badge: "3 MONTHS · FULL PLATFORM ACCESS · STRUCTURED CAREER & INTERVIEW TRAINING",
  disclaimer:
    "Designed to help you become interview-ready and improve your chances of securing interviews. Does not guarantee employment, a job offer, a specific salary, or an interview.",
  includes: [
    "Full Free features",
    "Full Job Seeker features",
    "Full Career Pro features",
    "All premium AI career tools",
    "Advanced job matching and CV tools",
    "Interview preparation tools",
    "Structured 3-month training curriculum",
    "No extra subscription required during the programme",
  ],
} as const;

export type Lesson = {
  id: string;
  month: 1 | 2 | 3;
  week: number;
  title: string;
  type: "lesson" | "exercise" | "interview" | "ai_strategy" | "task";
  summary: string;
};

export const PROGRAMME_CURRICULUM: Lesson[] = [
  // Month 1 — Build your foundation
  {
    id: "m1-w1-value",
    month: 1,
    week: 1,
    title: "Understand your professional value",
    type: "lesson",
    summary: "Map strengths, proof points, and what you uniquely bring.",
  },
  {
    id: "m1-w1-transferable",
    month: 1,
    week: 1,
    title: "Identify transferable skills",
    type: "exercise",
    summary: "Translate past experience into language recruiters recognise.",
  },
  {
    id: "m1-w2-direction",
    month: 1,
    week: 2,
    title: "Clarify career direction and suitable roles",
    type: "lesson",
    summary: "Choose roles worth your energy and avoid scattershot applications.",
  },
  {
    id: "m1-w2-recruiters",
    month: 1,
    week: 2,
    title: "What recruiters actually look for",
    type: "lesson",
    summary: "Learn the signals that get you shortlisted — and what gets ignored.",
  },
  {
    id: "m1-w3-cv",
    month: 1,
    week: 3,
    title: "CV positioning and professional profile",
    type: "task",
    summary: "Rebuild your CV around evidence, not buzzwords.",
  },
  {
    id: "m1-w3-search",
    month: 1,
    week: 3,
    title: "Job-search strategy foundation",
    type: "lesson",
    summary: "Build a weekly search rhythm that compounds.",
  },
  {
    id: "m1-w4-ai",
    month: 1,
    week: 4,
    title: "Use AI strategically (without losing your voice)",
    type: "ai_strategy",
    summary: "Use AI as a tool. Don't let AI become your voice.",
  },
  // Month 2 — Stand out from the crowd
  {
    id: "m2-w5-generic",
    month: 2,
    week: 5,
    title: "Stop sounding like everyone else",
    type: "lesson",
    summary: "Spot generic AI phrases and replace them with lived detail.",
  },
  {
    id: "m2-w5-voice",
    month: 2,
    week: 5,
    title: "Develop an authentic professional voice",
    type: "exercise",
    summary: "Write like yourself — confident, natural, memorable.",
  },
  {
    id: "m2-w6-stories",
    month: 2,
    week: 6,
    title: "Turn real experiences into career stories",
    type: "exercise",
    summary: "Craft stories that are specific, human, and hard to copy.",
  },
  {
    id: "m2-w6-applications",
    month: 2,
    week: 6,
    title: "Stronger applications and authentic cover letters",
    type: "task",
    summary: "Write applications that feel tailored — not templated.",
  },
  {
    id: "m2-w7-buzzwords",
    month: 2,
    week: 7,
    title: "Cut overused buzzwords",
    type: "lesson",
    summary: "Replace corporate filler with proof and plain language.",
  },
  {
    id: "m2-w7-brand",
    month: 2,
    week: 7,
    title: "Personal branding and LinkedIn positioning",
    type: "task",
    summary: "Present a coherent professional story online.",
  },
  {
    id: "m2-w8-psychology",
    month: 2,
    week: 8,
    title: "Recruiter psychology and memorable applications",
    type: "lesson",
    summary: "Understand how shortlisting decisions are made under pressure.",
  },
  {
    id: "m2-w8-ai",
    month: 2,
    week: 8,
    title: "Strategic AI for applications (keep your voice)",
    type: "ai_strategy",
    summary: "Prompt AI for structure and critique — then rewrite in your words.",
  },
  // Month 3 — Interview & job-search mastery
  {
    id: "m3-w9-tell",
    month: 3,
    week: 9,
    title: "Tell me about yourself",
    type: "interview",
    summary: "Build a natural opening that sounds like you, not a script.",
  },
  {
    id: "m3-w9-star",
    month: 3,
    week: 9,
    title: "STAR technique and answer development",
    type: "interview",
    summary: "Structure answers without sounding robotic.",
  },
  {
    id: "m3-w10-behavioural",
    month: 3,
    week: 10,
    title: "Behavioural and situational questions",
    type: "interview",
    summary: "Prepare for strengths, weaknesses, and pressure scenarios.",
  },
  {
    id: "m3-w10-difficult",
    month: 3,
    week: 10,
    title: "Difficult questions: gaps, career change, limited experience",
    type: "interview",
    summary: "Answer honestly and confidently without over-explaining.",
  },
  {
    id: "m3-w11-salary",
    month: 3,
    week: 11,
    title: "Salary expectations and negotiation framing",
    type: "lesson",
    summary: "Talk money clearly without sounding entitled or unsure.",
  },
  {
    id: "m3-w11-mock",
    month: 3,
    week: 11,
    title: "Mock interview practice",
    type: "interview",
    summary: "Rehearse aloud — confidence comes from repetition with feedback.",
  },
  {
    id: "m3-w12-followup",
    month: 3,
    week: 12,
    title: "Interview follow-up and application strategy",
    type: "task",
    summary: "Close the loop professionally and keep pipeline momentum.",
  },
  {
    id: "m3-w12-ai",
    month: 3,
    week: 12,
    title: "Strategic AI for interview prep (stay human)",
    type: "ai_strategy",
    summary: "Use AI to stress-test answers — then practice in your own voice.",
  },
];

const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  job_seeker: 1,
  career_pro: 2,
};

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function programmeMonth(start: Date, now = new Date()): 1 | 2 | 3 {
  const days = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 30) return 1;
  if (days < 60) return 2;
  return 3;
}

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
  catalogue: {
    plans: typeof PLAN_CATALOG;
    programme: typeof PROGRAMME;
  };
};

function featuresFor(accessLevel: PlanId, programmeActive: boolean) {
  const rank = PLAN_RANK[accessLevel];
  return {
    premiumJobs: rank >= 1 || programmeActive,
    advancedMatching: rank >= 1 || programmeActive,
    advancedCvTools: rank >= 2 || programmeActive,
    interviewTools: rank >= 2 || programmeActive,
    premiumAiTools: rank >= 2 || programmeActive,
    programmeContent: programmeActive,
  };
}

export async function expireProgrammesIfNeeded(profileId: number, now = new Date()) {
  const rows = await db
    .select()
    .from(programmesTable)
    .where(and(eq(programmesTable.profileId, profileId), eq(programmesTable.status, "active")));
  for (const row of rows) {
    if (row.endDate.getTime() <= now.getTime()) {
      await db
        .update(programmesTable)
        .set({ status: "expired", updatedAt: now })
        .where(eq(programmesTable.id, row.id));
    }
  }
}

export async function getActiveSubscription(profileId: number) {
  const [row] = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.profileId, profileId), eq(subscriptionsTable.status, "active")))
    .orderBy(desc(subscriptionsTable.updatedAt))
    .limit(1);
  return row ?? null;
}

export async function getLatestProgramme(profileId: number) {
  const [row] = await db
    .select()
    .from(programmesTable)
    .where(eq(programmesTable.profileId, profileId))
    .orderBy(desc(programmesTable.createdAt))
    .limit(1);
  return row ?? null;
}

export async function resolveEntitlement(profileId: number): Promise<Entitlement> {
  await expireProgrammesIfNeeded(profileId);
  const subscription = await getActiveSubscription(profileId);
  const programmeRow = await getLatestProgramme(profileId);
  const now = new Date();

  let plan: PlanId = (subscription?.plan as PlanId) || "free";
  if (!PLAN_RANK[plan] && plan !== "free") plan = "free";

  const programmeActive = Boolean(
    programmeRow && programmeRow.status === "active" && programmeRow.endDate.getTime() > now.getTime(),
  );

  const accessLevel: PlanId = programmeActive ? "career_pro" : plan;
  const completed = programmeRow?.completedLessons ?? [];
  const progressPercent = Math.round((completed.length / PROGRAMME_CURRICULUM.length) * 100);

  return {
    profileId,
    plan,
    planName: PLAN_CATALOG.find((p) => p.id === plan)?.name || "Free",
    accessLevel,
    features: featuresFor(accessLevel, programmeActive),
    subscription: subscription
      ? {
          id: subscription.id,
          plan: subscription.plan as PlanId,
          status: subscription.status,
          startedAt: subscription.startedAt.toISOString(),
          endsAt: subscription.endsAt ? subscription.endsAt.toISOString() : null,
        }
      : null,
    programme: programmeRow
      ? {
          id: programmeRow.id,
          status: programmeRow.status as "active" | "expired" | "cancelled",
          startDate: programmeRow.startDate.toISOString(),
          endDate: programmeRow.endDate.toISOString(),
          daysRemaining:
            programmeRow.status === "active"
              ? daysBetween(now, programmeRow.endDate)
              : 0,
          currentMonth: programmeMonth(programmeRow.startDate, now),
          completedLessons: completed,
          currentLessonId: programmeRow.currentLessonId,
          progressPercent,
          amountPaid: programmeRow.amountPaid,
        }
      : null,
    catalogue: {
      plans: PLAN_CATALOG,
      programme: PROGRAMME,
    },
  };
}

export async function setSubscriptionPlan(profileId: number, plan: PlanId) {
  const now = new Date();
  const existing = await getActiveSubscription(profileId);
  if (existing) {
    const [updated] = await db
      .update(subscriptionsTable)
      .set({
        plan,
        status: "active",
        startedAt: now,
        endsAt: plan === "free" ? null : addMonths(now, 1),
        updatedAt: now,
      })
      .where(eq(subscriptionsTable.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(subscriptionsTable)
    .values({
      profileId,
      plan,
      status: "active",
      startedAt: now,
      endsAt: plan === "free" ? null : addMonths(now, 1),
    })
    .returning();
  return created;
}

export async function activateProgramme(profileId: number) {
  const now = new Date();
  const active = await db
    .select()
    .from(programmesTable)
    .where(and(eq(programmesTable.profileId, profileId), eq(programmesTable.status, "active")));
  for (const row of active) {
    await db
      .update(programmesTable)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(programmesTable.id, row.id));
  }

  const endDate = addMonths(now, PROGRAMME.durationMonths);
  const firstLesson = PROGRAMME_CURRICULUM[0]?.id ?? null;
  const [created] = await db
    .insert(programmesTable)
    .values({
      profileId,
      status: "active",
      amountPaid: PROGRAMME.priceZar,
      startDate: now,
      endDate,
      completedLessons: [],
      currentLessonId: firstLesson,
    })
    .returning();

  // Programme includes full Career Pro access — no separate subscription required.
  await setSubscriptionPlan(profileId, "free");

  return created;
}
