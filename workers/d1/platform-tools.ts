import { getAuthenticatedUser, type D1Env, type UserRow } from "./auth";

type PlanId = "free" | "job_seeker" | "career_pro";
type ProfileRow = { id: number; user_id: string; name: string; email: string };
type SubscriptionRow = {
  id: number;
  plan: PlanId;
  status: string;
  started_at: string;
  ends_at: string | null;
};
type ProgrammeRow = {
  id: number;
  status: string;
  start_date: string;
  end_date: string;
  completed_lessons_json: string;
  current_lesson_id: string | null;
  amount_paid: number;
};

const plans = [
  {
    id: "free",
    name: "Free",
    priceZar: 0,
    billing: "month",
    tagline: "Start building your foundation.",
    features: [
      "Profile and career basics",
      "CV upload and core diagnostic",
      "Standard job matches",
      "Interview prep introduction",
    ],
  },
  {
    id: "job_seeker",
    name: "Job Seeker",
    priceZar: 149,
    billing: "month",
    tagline: "Search smarter with more career tools.",
    features: [
      "Everything in Free",
      "Advanced job search guidance",
      "Advanced job matching",
      "Enhanced CV feedback",
      "Application strategy tips",
    ],
  },
  {
    id: "career_pro",
    name: "Career Pro",
    priceZar: 299,
    billing: "month",
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

const programmeInfo = {
  name: "3-Month Career & Interview Coaching Programme",
  shortName: "Career Accelerator",
  priceZar: 2000,
  headline: "STOP SOUNDING LIKE EVERYONE ELSE.",
  tagline: "A 3-Month Career Transformation Programme.",
  badge:
    "3 MONTHS · FULL PLATFORM ACCESS · STRUCTURED CAREER & INTERVIEW TRAINING",
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
};

const curriculum = [
  {
    id: "m1-w1",
    month: 1,
    week: 1,
    title: "Build your career foundation",
    type: "workshop",
    summary: "Clarify your value, direction and target role.",
  },
  {
    id: "m1-w2",
    month: 1,
    week: 2,
    title: "CV evidence and positioning",
    type: "practical",
    summary: "Turn duties into clear, verified achievements.",
  },
  {
    id: "m1-w3",
    month: 1,
    week: 3,
    title: "Transferable skills",
    type: "workshop",
    summary: "Connect existing experience to your next opportunity.",
  },
  {
    id: "m1-w4",
    month: 1,
    week: 4,
    title: "Focused job search",
    type: "action",
    summary: "Build a repeatable search and application routine.",
  },
  {
    id: "m2-w1",
    month: 2,
    week: 1,
    title: "Your authentic professional voice",
    type: "workshop",
    summary: "Write with clarity without sounding generic.",
  },
  {
    id: "m2-w2",
    month: 2,
    week: 2,
    title: "Career stories",
    type: "practical",
    summary: "Prepare evidence-rich stories recruiters remember.",
  },
  {
    id: "m2-w3",
    month: 2,
    week: 3,
    title: "Tailored applications",
    type: "action",
    summary: "Match role requirements while keeping facts accurate.",
  },
  {
    id: "m2-w4",
    month: 2,
    week: 4,
    title: "Recruiter visibility",
    type: "workshop",
    summary: "Improve LinkedIn and recruiter-facing positioning.",
  },
  {
    id: "m3-w1",
    month: 3,
    week: 1,
    title: "STAR interview method",
    type: "workshop",
    summary: "Structure concise answers around real evidence.",
  },
  {
    id: "m3-w2",
    month: 3,
    week: 2,
    title: "Difficult interview questions",
    type: "practice",
    summary: "Handle gaps, changes and setbacks confidently.",
  },
  {
    id: "m3-w3",
    month: 3,
    week: 3,
    title: "Mock interview",
    type: "practice",
    summary: "Rehearse role-specific questions and improve delivery.",
  },
  {
    id: "m3-w4",
    month: 3,
    week: 4,
    title: "Offer and follow-up",
    type: "action",
    summary: "Prepare salary conversations and professional follow-up.",
  },
] as const;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}
function monthDiff(start: Date, now: Date) {
  return Math.max(
    1,
    Math.min(
      3,
      Math.floor((now.getTime() - start.getTime()) / (30 * 86400000)) + 1,
    ),
  ) as 1 | 2 | 3;
}
function completedLessons(row: ProgrammeRow | null): string[] {
  try {
    const value = JSON.parse(row?.completed_lessons_json || "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

async function profileFor(
  env: D1Env,
  user: UserRow,
): Promise<ProfileRow | null> {
  return env.DB.prepare(
    "SELECT id, user_id, name, email FROM career_profiles WHERE user_id = ? LIMIT 1",
  )
    .bind(user.id)
    .first<ProfileRow>();
}

async function entitlement(env: D1Env, user: UserRow) {
  const profile = await profileFor(env, user);
  if (!profile) return null;
  const subscription = await env.DB.prepare(
    "SELECT id, plan, status, started_at, ends_at FROM career_subscriptions WHERE user_id = ? ORDER BY id DESC LIMIT 1",
  )
    .bind(user.id)
    .first<SubscriptionRow>();
  const programme = await env.DB.prepare(
    "SELECT id, status, start_date, end_date, completed_lessons_json, current_lesson_id, amount_paid FROM career_programmes WHERE user_id = ? ORDER BY id DESC LIMIT 1",
  )
    .bind(user.id)
    .first<ProgrammeRow>();
  const now = new Date();
  const programmeActive = Boolean(
    programme &&
    programme.status === "active" &&
    new Date(programme.end_date).getTime() > now.getTime(),
  );
  if (programme && programme.status === "active" && !programmeActive)
    await env.DB.prepare(
      "UPDATE career_programmes SET status = 'expired', updated_at = datetime('now') WHERE id = ?",
    )
      .bind(programme.id)
      .run();
  const plan: PlanId = programmeActive
    ? "career_pro"
    : subscription?.status === "active"
      ? subscription.plan
      : "free";
  const pro = programmeActive || plan === "career_pro";
  const seeker = pro || plan === "job_seeker";
  const completed = completedLessons(programme || null);
  const programmePayload = programme
    ? {
        id: programme.id,
        status: programmeActive
          ? "active"
          : programme.status === "active"
            ? "expired"
            : programme.status,
        startDate: programme.start_date,
        endDate: programme.end_date,
        daysRemaining: programmeActive
          ? Math.max(
              0,
              Math.ceil(
                (new Date(programme.end_date).getTime() - now.getTime()) /
                  86400000,
              ),
            )
          : 0,
        currentMonth: monthDiff(new Date(programme.start_date), now),
        completedLessons: completed,
        currentLessonId: programme.current_lesson_id,
        progressPercent: Math.round(
          (completed.length / curriculum.length) * 100,
        ),
        amountPaid: programme.amount_paid,
      }
    : null;
  return {
    profileId: profile.id,
    plan,
    planName: programmeActive
      ? "Career Accelerator"
      : plans.find((item) => item.id === plan)?.name || "Free",
    accessLevel: plan,
    features: {
      premiumJobs: seeker,
      advancedMatching: seeker,
      advancedCvTools: pro,
      interviewTools: pro,
      premiumAiTools: pro,
      programmeContent: programmeActive,
    },
    subscription: subscription
      ? {
          id: subscription.id,
          plan: subscription.plan,
          status: subscription.status,
          startedAt: subscription.started_at,
          endsAt: subscription.ends_at,
        }
      : null,
    programme: programmePayload,
  };
}

function interview() {
  return json({
    completed: 0,
    total: 5,
    questions: [
      {
        id: 1,
        question: "Tell me about a time you improved a process or result.",
        context: "Use an example that connects to your target role.",
        hint: "Use STAR: situation, task, action and a measurable result.",
      },
      {
        id: 2,
        question:
          "How did you handle competing priorities or a changing deadline?",
        context:
          "Recruiters want to understand your judgement and communication.",
        hint: "Explain the trade-off you made and how you kept stakeholders informed.",
      },
      {
        id: 3,
        question: "Describe a difficult problem you solved with others.",
        context: "Choose a real example that demonstrates collaboration.",
        hint: "Name your own contribution and the outcome, rather than only describing the team.",
      },
      {
        id: 4,
        question: "Why are you interested in this role?",
        context: "Connect your evidence to the employer's needs.",
        hint: "Link two relevant strengths to the work you want to do next.",
      },
      {
        id: 5,
        question: "What would you improve about your recent work?",
        context: "A strong answer shows reflection and growth.",
        hint: "Choose a genuine lesson and explain what you now do differently.",
      },
    ],
  });
}

export async function handlePlatformTools(
  request: Request,
  env: D1Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method.toUpperCase();
  const supported = new Set([
    "/api/career/interview",
    "/api/career/coaching",
    "/api/career/pricing",
    "/api/career/entitlements",
    "/api/career/subscribe",
    "/api/career/programme",
    "/api/career/programme/purchase",
    "/api/career/programme/progress",
  ]);
  if (!supported.has(path)) return null;
  if (path === "/api/career/interview" && method === "GET") return interview();
  if (path === "/api/career/pricing" && method === "GET")
    return json({ plans, programme: programmeInfo, curriculum });
  const user = await getAuthenticatedUser(request, env);
  if (!user) return json({ error: "Please sign in to continue." }, 401);
  const profile = await profileFor(env, user);
  if (!profile) return json({ error: "Complete your profile first." }, 400);
  const input =
    method === "GET"
      ? {}
      : ((await request.json().catch(() => ({}))) as Record<string, unknown>);

  if (path === "/api/career/coaching" && method === "POST") {
    const name = text(input.name);
    const email = text(input.email);
    const experience = text(input.experience);
    const goals = text(input.goals);
    const paymentPlan = text(input.paymentPlan) || "programme";
    if (!name || !email || !experience || !goals)
      return json(
        { error: "Name, email, experience and goals are required." },
        400,
      );
    const saved = await env.DB.prepare(
      "INSERT INTO coaching_applications (user_id, profile_id, name, email, experience, goals, payment_plan, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))",
    )
      .bind(user.id, profile.id, name, email, experience, goals, paymentPlan)
      .run();
    return json(
      {
        id: Number(saved.meta.last_row_id || 0),
        status: "pending",
        message:
          "Thanks — your application is in. We’ll be in touch within one business day.",
      },
      201,
    );
  }
  if (path === "/api/career/entitlements" && method === "GET")
    return json(await entitlement(env, user));
  if (path === "/api/career/subscribe" && method === "POST") {
    const plan = text(input.plan) as PlanId;
    if (!plans.some((item) => item.id === plan))
      return json({ error: "Choose a valid plan." }, 400);
    const current = await entitlement(env, user);
    if (current?.programme?.status === "active")
      return json(
        {
          error: "Your active programme already includes full platform access.",
          entitlement: current,
        },
        409,
      );
    await env.DB.prepare(
      "INSERT INTO career_subscriptions (user_id, profile_id, plan, status, started_at, ends_at, updated_at) VALUES (?, ?, ?, 'active', datetime('now'), NULL, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = 'active', started_at = datetime('now'), ends_at = NULL, updated_at = datetime('now')",
    )
      .bind(user.id, profile.id, plan)
      .run();
    return json({ ok: true, entitlement: await entitlement(env, user) });
  }
  if (path === "/api/career/programme/purchase" && method === "POST") {
    const current = await entitlement(env, user);
    if (current?.programme?.status === "active")
      return json(
        {
          error: "You already have an active Career Accelerator programme.",
          entitlement: current,
        },
        409,
      );
    const start = new Date();
    const end = addMonths(start, 3);
    await env.DB.prepare(
      "INSERT INTO career_programmes (user_id, profile_id, status, start_date, end_date, completed_lessons_json, current_lesson_id, amount_paid, created_at, updated_at) VALUES (?, ?, 'active', ?, ?, '[]', ?, 2000, datetime('now'), datetime('now')) ON CONFLICT(user_id) DO UPDATE SET status = 'active', start_date = excluded.start_date, end_date = excluded.end_date, completed_lessons_json = '[]', current_lesson_id = excluded.current_lesson_id, amount_paid = 2000, updated_at = datetime('now')",
    )
      .bind(
        user.id,
        profile.id,
        start.toISOString(),
        end.toISOString(),
        curriculum[0].id,
      )
      .run();
    const next = await entitlement(env, user);
    return json(
      {
        ok: true,
        message:
          "Programme activated. You now have full platform access for 3 months.",
        programme: next?.programme,
        entitlement: next,
      },
      201,
    );
  }
  if (path === "/api/career/programme" && method === "GET") {
    const current = await entitlement(env, user);
    const completed = new Set(current?.programme?.completedLessons || []);
    const lessons = curriculum.map((lesson) => ({
      ...lesson,
      completed: completed.has(lesson.id),
    }));
    const currentMonth = current?.programme?.currentMonth || 1;
    const labels = {
      1: "Month 1 — Build Your Foundation",
      2: "Month 2 — Stand Out From The Crowd",
      3: "Month 3 — Interview & Job-Search Mastery",
    } as const;
    const upcoming = lessons.filter((lesson) => !lesson.completed).slice(0, 5);
    const currentModule =
      lessons.find(
        (lesson) => lesson.id === current?.programme?.currentLessonId,
      ) ||
      upcoming[0] ||
      null;
    return json({
      programme: current?.programme || null,
      access: current?.features,
      headline: "YOUR 3-MONTH CAREER ACCELERATOR",
      differentiator: {
        title: programmeInfo.headline,
        philosophy: "Use AI as a tool. Don't let AI become your voice.",
        goal: "Become a stronger, more confident and more differentiated candidate.",
      },
      currentMonthLabel: labels[currentMonth],
      currentModule,
      progressPercent: current?.programme?.progressPercent || 0,
      completedCount: completed.size,
      totalLessons: curriculum.length,
      upcoming,
      lessons,
      months: [1, 2, 3].map((month) => ({
        month,
        label: labels[month as 1 | 2 | 3],
        lessons: lessons.filter((lesson) => lesson.month === month),
      })),
      disclaimer: programmeInfo.disclaimer,
    });
  }
  if (path === "/api/career/programme/progress" && method === "POST") {
    const lessonId = text(input.lessonId);
    if (!curriculum.some((lesson) => lesson.id === lessonId))
      return json({ error: "Unknown lesson." }, 400);
    const current = await entitlement(env, user);
    if (current?.programme?.status !== "active")
      return json(
        { error: "An active programme is required to track progress." },
        403,
      );
    const completed = new Set(current.programme.completedLessons);
    if (input.completed === false) completed.delete(lessonId);
    else completed.add(lessonId);
    const nextLesson =
      curriculum.find((lesson) => !completed.has(lesson.id))?.id || lessonId;
    await env.DB.prepare(
      "UPDATE career_programmes SET completed_lessons_json = ?, current_lesson_id = ?, updated_at = datetime('now') WHERE user_id = ?",
    )
      .bind(JSON.stringify([...completed]), nextLesson, user.id)
      .run();
    return json({
      ok: true,
      completedLessons: [...completed],
      currentLessonId: nextLesson,
      progressPercent: Math.round((completed.size / curriculum.length) * 100),
    });
  }
  return json({ error: "Method not allowed." }, 405);
}
