import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Check,
  Sparkles,
  ShieldCheck,
  HeartHandshake,
} from "lucide-react";
import {
  defaultEntitlement,
  fetchEntitlement,
  formatZar,
  readStoredProfile,
  type Entitlement,
  type PlanId,
} from "@/lib/entitlements";

type PlanCard = {
  id: PlanId;
  name: string;
  priceZar: number;
  billing: string;
  tagline: string;
  features: string[];
};

type ProgrammeInfo = {
  name: string;
  shortName: string;
  priceZar: number;
  headline: string;
  tagline: string;
  badge: string;
  disclaimer: string;
  includes: string[];
};

const FALLBACK_PLANS: PlanCard[] = [
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
];

const FALLBACK_PROGRAMME: ProgrammeInfo = {
  name: "3-Month Career & Interview Coaching Programme",
  shortName: "Career Accelerator",
  priceZar: 2000,
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
};

export default function PricingPage() {
  const [, setLocation] = useLocation();
  const profile = readStoredProfile();
  const [plans, setPlans] = useState<PlanCard[]>(FALLBACK_PLANS);
  const [programme, setProgramme] = useState<ProgrammeInfo>(FALLBACK_PROGRAMME);
  const [entitlement, setEntitlement] = useState<Entitlement>(defaultEntitlement(profile?.id || 0));
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pricing = await fetch("/api/career/pricing").then((r) => r.json());
        if (!cancelled && pricing?.plans) setPlans(pricing.plans);
        if (!cancelled && pricing?.programme) setProgramme(pricing.programme);
      } catch {
        /* keep fallbacks */
      }
      if (profile?.id) {
        const next = await fetchEntitlement(profile.id);
        if (!cancelled) setEntitlement(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const requireLogin = () => {
    setLocation("/login");
  };

  const subscribe = async (plan: PlanId) => {
    if (!profile?.id) {
      requireLogin();
      return;
    }
    setBusy(plan);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/career/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id, plan }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not update plan");
      setEntitlement(payload.entitlement);
      setMessage(
        plan === "free"
          ? "You are on the Free plan."
          : `${payload.entitlement.planName} is now active.`,
      );
      window.dispatchEvent(new Event("careerbridge-entitlement-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update plan");
    } finally {
      setBusy(null);
    }
  };

  const joinProgramme = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!profile?.id) {
      requireLogin();
      return;
    }
    setBusy("programme");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/career/programme/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not join programme");
      setEntitlement(payload.entitlement);
      setMessage(payload.message || "Programme activated.");
      window.dispatchEvent(new Event("careerbridge-entitlement-updated"));
      setLocation("/programme");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join programme");
    } finally {
      setBusy(null);
    }
  };

  const programmeActive = entitlement.programme?.status === "active";

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Pricing</p>
        <h1 className="display mt-3 text-4xl font-semibold text-foreground md:text-5xl">
          Choose how you want to grow.
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
          Three monthly subscriptions for everyday platform access — plus one stand-alone 3-month
          career transformation programme that unlocks everything.
        </p>
        {entitlement.planName ? (
          <p className="mt-4 text-xs font-medium text-foreground">
            Current access:{" "}
            <span className="text-primary">
              {programmeActive
                ? `Career Accelerator (${entitlement.programme?.daysRemaining ?? 0} days left)`
                : entitlement.planName}
            </span>
          </p>
        ) : null}
      </div>

      <section className="mt-10">
        <h2 className="display text-2xl font-semibold text-foreground">Subscriptions</h2>
        <p className="mt-2 text-sm text-muted-foreground">Billed monthly. Cancel or change anytime.</p>
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => {
            const active = !programmeActive && entitlement.plan === plan.id;
            const featured = plan.id === "career_pro";
            return (
              <article
                key={plan.id}
                className={`flex flex-col rounded-3xl border p-6 ${
                  featured ? "border-primary bg-secondary/40 shadow-sm" : "border-border bg-card"
                }`}
                data-testid={`card-plan-${plan.id}`}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  {plan.name}
                </p>
                <p className="display mt-3 text-4xl font-semibold text-foreground">
                  {formatZar(plan.priceZar)}
                  <span className="ml-1 text-sm font-medium text-muted-foreground">/month</span>
                </p>
                <p className="mt-3 text-sm text-muted-foreground">{plan.tagline}</p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-sm text-foreground">
                      <Check size={16} className="mt-0.5 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={Boolean(busy) || active || programmeActive}
                  onClick={() => subscribe(plan.id)}
                  className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${
                    featured
                      ? "bg-primary text-primary-foreground hover:opacity-95"
                      : "border border-border bg-card text-foreground hover:border-primary/40"
                  } disabled:opacity-50`}
                  data-testid={`button-subscribe-${plan.id}`}
                >
                  {busy === plan.id
                    ? "Updating…"
                    : programmeActive
                      ? "Included in programme"
                      : active
                        ? "Current plan"
                        : plan.id === "free"
                          ? "Use Free"
                          : "Choose plan"}
                  {!active && !programmeActive ? <ArrowRight size={15} /> : null}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-16 overflow-hidden rounded-[2rem] border border-border bg-card">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="bg-primary p-7 text-primary-foreground md:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-foreground/80">
              Stand-alone programme · not a monthly subscription
            </p>
            <h2 className="display mt-4 text-3xl font-semibold md:text-4xl">{programme.headline}</h2>
            <p className="mt-3 text-lg font-medium text-primary-foreground/95">{programme.tagline}</p>
            <p className="mt-5 max-w-xl text-sm leading-6 text-primary-foreground/80">
              AI has changed the job-search game. But when everyone uses the same tools, the same
              phrases and the same answers, candidates start sounding exactly the same. We teach you
              how to use AI strategically while keeping your own voice, personality and experience.
            </p>
            <p className="mt-4 max-w-xl text-sm leading-6 text-primary-foreground/80">
              Our structured 3-month programme helps you become job-ready, prepare for interviews,
              communicate with confidence and stand out from the crowd.
            </p>
            <p className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary-foreground/15 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em]">
              <Sparkles size={14} />
              {programme.badge}
            </p>
            <div className="mt-8 flex flex-wrap items-end gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-primary-foreground/70">
                  Once-off investment
                </p>
                <p className="display mt-1 text-5xl font-semibold">{formatZar(programme.priceZar)}</p>
              </div>
              <p className="pb-2 text-sm text-primary-foreground/80">Full platform access for 3 months</p>
            </div>
          </div>

          <div className="p-7 md:p-10">
            <div className="flex items-center gap-2 text-primary">
              <HeartHandshake size={22} />
              <h3 className="display text-xl font-semibold text-foreground">{programme.shortName}</h3>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Premium all-access career programme. No additional subscription payment during the
              3-month period.
            </p>
            <ul className="mt-6 space-y-2.5">
              {programme.includes.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-foreground">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <form onSubmit={joinProgramme} className="mt-8">
              <button
                type="submit"
                disabled={Boolean(busy) || programmeActive}
                className="btn-primary w-full disabled:opacity-50"
                data-testid="button-join-programme"
              >
                {busy === "programme"
                  ? "Activating…"
                  : programmeActive
                    ? "Programme already active"
                    : "JOIN THE PROGRAMME"}{" "}
                <ArrowRight size={15} />
              </button>
            </form>
            {programmeActive ? (
              <Link
                href="/programme"
                className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline"
                data-testid="link-open-programme-dashboard"
              >
                Open your programme dashboard
              </Link>
            ) : null}
            <p className="mt-4 text-[11px] leading-5 text-muted-foreground">{programme.disclaimer}</p>
          </div>
        </div>
      </section>

      {(error || message) && (
        <p className={`mt-6 text-sm ${error ? "text-destructive" : "text-emerald-700"}`}>
          {error || message}
        </p>
      )}

      {!profile ? (
        <p className="mt-6 text-sm text-muted-foreground">
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Log in
          </Link>{" "}
          or{" "}
          <Link href="/signup" className="font-semibold text-primary hover:underline">
            create an account
          </Link>{" "}
          to activate a plan or join the programme.
        </p>
      ) : null}
    </div>
  );
}
