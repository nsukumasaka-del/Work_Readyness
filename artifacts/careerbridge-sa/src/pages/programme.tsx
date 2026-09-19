import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  Sparkles,
} from "lucide-react";
import {
  fetchEntitlement,
  formatDate,
  readStoredProfile,
  type Entitlement,
} from "@/lib/entitlements";
import { authFetch } from "@/lib/auth-session";

type Lesson = {
  id: string;
  month: 1 | 2 | 3;
  week: number;
  title: string;
  type: string;
  summary: string;
  completed?: boolean;
};

type ProgrammeDashboard = {
  programme: Entitlement["programme"];
  headline: string;
  differentiator: { title: string; philosophy: string; goal: string };
  currentMonthLabel: string;
  currentModule: Lesson | null;
  progressPercent: number;
  completedCount: number;
  totalLessons: number;
  upcoming: Lesson[];
  lessons: Lesson[];
  months: { month: number; label: string; lessons: Lesson[] }[];
  disclaimer: string;
};

export default function ProgrammePage() {
  const [, setLocation] = useLocation();
  const profile = readStoredProfile();
  const [data, setData] = useState<ProgrammeDashboard | null>(null);
  const [error, setError] = useState("");
  const [busyLesson, setBusyLesson] = useState<string | null>(null);

  const load = async () => {
    if (!profile?.id) {
      setLocation("/login");
      return;
    }
    const entitlement = await fetchEntitlement(profile.id);
    if (!entitlement.programme) {
      setError("No programme yet. Join the Career Accelerator from Pricing.");
      setData(null);
      return;
    }
    const response = await authFetch(
      `/api/career/programme?profileId=${profile.id}`,
    );
    if (!response.ok) {
      setError("Could not load programme dashboard.");
      return;
    }
    setData((await response.json()) as ProgrammeDashboard);
    setError("");
  };

  useEffect(() => {
    void load();
  }, [profile?.id]);

  const toggleLesson = async (lessonId: string, completed: boolean) => {
    if (!profile?.id || data?.programme?.status !== "active") return;
    setBusyLesson(lessonId);
    try {
      const response = await authFetch("/api/career/programme/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id, lessonId, completed }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error || "Could not update progress");
      }
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update progress",
      );
    } finally {
      setBusyLesson(null);
    }
  };

  const statusLabel = useMemo(() => {
    if (!data?.programme) return "";
    if (data.programme.status === "active") return "ACTIVE";
    if (data.programme.status === "expired") return "EXPIRED";
    return data.programme.status.toUpperCase();
  }, [data?.programme]);

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20 text-center text-sm text-muted-foreground">
        Redirecting to log in…
      </div>
    );
  }

  if (!data?.programme) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Programme
        </p>
        <h1 className="display mt-3 text-4xl font-semibold text-foreground">
          Your Career Accelerator
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {error ||
            "Join the stand-alone 3-month programme to unlock this dashboard."}
        </p>
        <Link
          href="/pricing"
          className="btn-primary mt-8"
          data-testid="link-pricing-from-programme"
        >
          View pricing <ArrowRight size={15} />
        </Link>
      </div>
    );
  }

  const programme = data.programme;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {data.headline}
          </p>
          <h1 className="display mt-3 text-4xl font-semibold text-foreground">
            {data.differentiator.title}
          </h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {data.differentiator.philosophy} {data.differentiator.goal}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card px-5 py-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Programme status
          </p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {statusLabel}
          </p>
          <p className="mt-1 text-muted-foreground">
            Access level: Full platform access
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Start date", formatDate(programme.startDate)],
          ["End date", formatDate(programme.endDate)],
          [
            "Days remaining",
            programme.status === "active"
              ? String(programme.daysRemaining)
              : "0",
          ],
          ["Current month", `Month ${programme.currentMonth}`],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-lg font-semibold text-foreground">
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Programme progress
            </p>
            <h2 className="display mt-2 text-2xl font-semibold text-foreground">
              {data.currentMonthLabel}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {data.completedCount} of {data.totalLessons} lessons complete ·{" "}
              {data.progressPercent}%
            </p>
          </div>
          {data.currentModule ? (
            <div className="rounded-2xl bg-secondary px-4 py-3 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                Current training module
              </p>
              <p className="mt-1 font-semibold text-foreground">
                {data.currentModule.title}
              </p>
            </div>
          ) : null}
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${data.progressPercent}%` }}
          />
        </div>
      </div>

      {programme.status !== "active" ? (
        <div className="mt-6 rounded-2xl border border-border bg-secondary/50 p-5 text-sm">
          <p className="font-semibold text-foreground">
            Your programme period has ended.
          </p>
          <p className="mt-2 text-muted-foreground">
            Your CV, profile, applications, saved jobs, career information,
            interview history and programme progress remain intact. Continue on
            Free, subscribe to Job Seeker or Career Pro, or purchase another
            programme when you are ready.
          </p>
          <Link
            href="/pricing"
            className="btn-primary mt-4"
            data-testid="link-post-programme-pricing"
          >
            Choose your next plan <ArrowRight size={15} />
          </Link>
        </div>
      ) : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-primary">
            <Clock3 size={18} />
            <h3 className="display text-xl font-semibold text-foreground">
              This week&apos;s focus
            </h3>
          </div>
          <ul className="mt-5 space-y-3">
            {data.upcoming.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                All lessons complete — well done.
              </li>
            ) : (
              data.upcoming.map((lesson) => (
                <li
                  key={lesson.id}
                  className="rounded-xl border border-border px-4 py-3"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                    Week {lesson.week} · {lesson.type.replace("_", " ")}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {lesson.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lesson.summary}
                  </p>
                </li>
              ))
            )}
          </ul>
          <div className="mt-6 rounded-2xl bg-primary p-5 text-primary-foreground">
            <Sparkles size={18} />
            <p className="mt-3 text-sm font-semibold">
              Use AI as a tool. Don&apos;t let AI become your voice.
            </p>
            <p className="mt-2 text-xs leading-5 text-primary-foreground/80">
              Sound authentic, natural, confident and professionally distinctive
              — not generic.
            </p>
          </div>
        </section>

        <section>
          <h3 className="display text-xl font-semibold text-foreground">
            Training modules
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Completed lessons, upcoming work, exercises, interview prep, AI
            strategy and career tasks.
          </p>
          <div className="mt-5 space-y-6">
            {data.months.map((month) => (
              <div
                key={month.month}
                className="rounded-3xl border border-border bg-card p-5"
              >
                <h4 className="text-sm font-semibold text-foreground">
                  {month.label}
                </h4>
                <ul className="mt-4 space-y-2">
                  {month.lessons.map((lesson) => {
                    const done = Boolean(lesson.completed);
                    return (
                      <li
                        key={lesson.id}
                        className="flex items-start gap-3 rounded-xl border border-border/80 px-3 py-3"
                      >
                        <button
                          type="button"
                          disabled={
                            programme.status !== "active" ||
                            busyLesson === lesson.id
                          }
                          onClick={() => toggleLesson(lesson.id, !done)}
                          className="mt-0.5 text-primary disabled:opacity-40"
                          data-testid={`button-lesson-${lesson.id}`}
                          aria-label={
                            done ? "Mark incomplete" : "Mark complete"
                          }
                        >
                          {done ? (
                            <CheckCircle2 size={18} />
                          ) : (
                            <Circle size={18} />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
                          >
                            {lesson.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {lesson.summary}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-md bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          {lesson.type.replace("_", " ")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>

      {error ? <p className="mt-6 text-sm text-destructive">{error}</p> : null}
      <p className="mt-8 text-[11px] leading-5 text-muted-foreground">
        {data.disclaimer}
      </p>
    </div>
  );
}
