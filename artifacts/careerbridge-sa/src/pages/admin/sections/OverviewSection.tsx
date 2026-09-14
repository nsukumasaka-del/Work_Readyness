import { useMemo } from "react";
import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  Database,
  Eye,
  FileText,
  Search,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  type OverviewResponse,
  type SectionProps,
  adminFetch,
  buildQuery,
  formatDateTime,
  formatDayLabel,
  formatNumber,
  healthList,
  rangeParams,
  sectionForActivity,
  useAdminData,
} from "../api";
import { EmptyState, ErrorState, KpiCard, LoadingState, SectionCard, StatusBadge } from "../ui";

type Props = Pick<SectionProps, "token" | "range" | "from" | "to" | "refreshTick" | "onNavigate">;

export default function OverviewSection({ token, range, from, to, refreshTick, onNavigate }: Props) {
  const { data, loading, error, reload } = useAdminData<OverviewResponse>(
    () => adminFetch<OverviewResponse>(`/admin/overview${buildQuery(rangeParams(range, from, to))}`, token),
    [token, range, from, to],
    refreshTick,
  );

  const chartData = useMemo(
    () =>
      (data?.visitsByDay ?? []).map((row) => ({
        ...row,
        label: formatDayLabel(row.day),
      })),
    [data?.visitsByDay],
  );

  if (loading && !data) return <LoadingState label="Loading dashboard…" />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void reload(false)} />;
  if (!data) return null;

  const kpis = data.kpis;
  const health = healthList(data.health);
  const maxReferrer = Math.max(1, ...(data.topReferrers ?? []).map((row) => row.visits));
  const maxPath = Math.max(1, ...(data.topPaths ?? []).map((row) => row.visits));
  const signals = data.signals ?? {
    profileCount: kpis.usersTotal,
    diagnosticScore: kpis.avgAuthenticity > 0 ? kpis.avgAuthenticity : null,
    interviewCompletedCount: kpis.cvReviewsTotal,
    latestRole: null,
  };

  return (
    <div className="space-y-6">
      {error ? <ErrorState message={error} onRetry={() => void reload(false)} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Visits"
          value={formatNumber(kpis.visits)}
          hint={`${formatNumber(kpis.uniqueVisitors)} unique visitors`}
          icon={<Eye size={18} />}
          onClick={() => onNavigate("traffic")}
        />
        <KpiCard
          label="Users"
          value={formatNumber(kpis.users)}
          hint={`${formatNumber(kpis.usersTotal)} total profiles`}
          icon={<Users size={18} />}
          onClick={() => onNavigate("users")}
        />
        <KpiCard
          label="CV reviews"
          value={formatNumber(kpis.cvReviews)}
          hint={`${formatNumber(kpis.cvReviewsTotal)} lifetime`}
          icon={<FileText size={18} />}
          onClick={() => onNavigate("diagnostics")}
        />
        <KpiCard
          label="Coaching apps"
          value={formatNumber(kpis.coachingApplications)}
          hint={`${formatNumber(kpis.coachingPending)} pending · ${formatNumber(kpis.coachingTotal)} total`}
          icon={<ClipboardList size={18} />}
          tone="amber"
          onClick={() => onNavigate("coaching")}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Active users"
          value={formatNumber(kpis.activeUsers)}
          hint={
            kpis.inactiveUsers === undefined ? undefined : `${formatNumber(kpis.inactiveUsers)} deactivated`
          }
          icon={<UserCheck size={18} />}
          tone="emerald"
          onClick={() => onNavigate("users")}
        />
        <KpiCard
          label="Coaching approved"
          value={formatNumber(kpis.coachingApproved)}
          hint={`${formatNumber(kpis.coachingPending)} awaiting review`}
          icon={<ClipboardList size={18} />}
          tone="emerald"
          onClick={() => onNavigate("coaching")}
        />
        <KpiCard label="Avg authenticity" value={formatNumber(kpis.avgAuthenticity)} icon={<ShieldCheck size={18} />} />
        <KpiCard label="Avg ATS score" value={formatNumber(kpis.avgAts)} icon={<BarChart3 size={18} />} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Jobs catalog"
          value={formatNumber(kpis.jobsCatalog)}
          hint={`${formatNumber(kpis.jobsPublished)} published`}
          icon={<BriefcaseBusiness size={18} />}
          onClick={() => onNavigate("jobs")}
        />
        <KpiCard
          label="Jobs draft"
          value={formatNumber(kpis.jobsDraft)}
          hint={`${formatNumber(kpis.jobsArchived)} archived`}
          icon={<BriefcaseBusiness size={18} />}
          tone="amber"
          onClick={() => onNavigate("jobs")}
        />
        <KpiCard
          label="Unique visitors"
          value={formatNumber(kpis.uniqueVisitors)}
          hint="Deduplicated by visitor id"
          icon={<Search size={18} />}
          onClick={() => onNavigate("traffic")}
        />
        <KpiCard
          label="System"
          value={health[0]?.api ? health[0].api.toUpperCase() : "—"}
          hint={health[0]?.checkedAt ? `Checked ${formatDateTime(health[0].checkedAt)}` : "Live service status"}
          icon={<Activity size={18} />}
          tone="emerald"
        />
      </div>

      <SectionCard
        title="Your signals"
        description="A little clarity, every day."
        actions={
          <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
            Candidate signals
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition-all hover:border-slate-300">
            <div className="mb-3 flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
                <Users size={18} />
              </span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Profiles created</p>
            <div className="mt-2 flex items-baseline gap-2">
              <strong className="text-3xl font-semibold text-slate-900">{formatNumber(signals.profileCount)}</strong>
              <span className="text-xs text-slate-500">visitors</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition-all hover:border-slate-300">
            <div className="mb-3 flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                <FileText size={18} />
              </span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">CV diagnostic</p>
            <div className="mt-2 flex items-baseline gap-2">
              <strong className="text-3xl font-semibold text-slate-900">
                {signals.diagnosticScore != null ? signals.diagnosticScore : "—"}
              </strong>
              {signals.diagnosticScore != null && <span className="text-xs text-slate-500">/100</span>}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition-all hover:border-slate-300">
            <div className="mb-3 flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700">
                <ClipboardList size={18} />
              </span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Interview practice</p>
            <div className="mt-2 flex items-baseline gap-2">
              <strong className="text-3xl font-semibold text-slate-900">
                {formatNumber(signals.interviewCompletedCount)}
              </strong>
              <span className="text-xs text-slate-500">complete</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition-all hover:border-slate-300">
            <div className="mb-3 flex items-center justify-between">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-purple-100 text-purple-700">
                <Sparkles size={18} />
              </span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Latest role focus</p>
            <div className="mt-2 flex items-baseline gap-2">
              <strong className="truncate text-xl font-semibold text-slate-900">
                {signals.latestRole || "—"}
              </strong>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard title="Visits over time" description="Page views recorded for the selected range">
          {chartData.length === 0 ? (
            <EmptyState
              title="No visit trend yet"
              description="Browse the public site to generate traffic, then return here."
              icon={<Eye size={18} />}
            />
          ) : (
            <div className="h-64 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="admin-visits-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={{ stroke: "#e2e8f0" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e2e8f0",
                      fontSize: 12,
                      boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
                    }}
                    labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                    formatter={(value: number) => [formatNumber(value), "Visits"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="visits"
                    stroke="#0284c7"
                    strokeWidth={2}
                    fill="url(#admin-visits-gradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Top pages">
            {(data.topPaths ?? []).length === 0 ? (
              <p className="text-sm text-slate-500">No page traffic recorded yet.</p>
            ) : (
              <ul className="space-y-3">
                {data.topPaths.map((row) => (
                  <li key={row.path}>
                    <button
                      type="button"
                      onClick={() => onNavigate("traffic")}
                      className="flex w-full items-center justify-between gap-3 text-left text-sm"
                    >
                      <span className="truncate font-medium text-slate-700">{row.path}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {formatNumber(row.visits)}
                      </span>
                    </button>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${Math.max(4, (row.visits / maxPath) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {data.topReferrers && data.topReferrers.length > 0 ? (
            <SectionCard title="Top referrers">
              <ul className="space-y-3">
                {data.topReferrers.map((row) => (
                  <li key={row.referrer ?? "direct"}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-slate-700">{row.referrer || "Direct"}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {formatNumber(row.visits)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-400"
                        style={{ width: `${Math.max(4, (row.visits / maxReferrer) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      </div>

      <SectionCard title="System health" description="Reported directly by the API health probe">
        {health.length === 0 ? (
          <p className="text-sm text-slate-500">Health data is not available.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {health.map((entry, index) => (
              <div key={index} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    <Activity size={14} /> API
                  </span>
                  <StatusBadge status={entry.api} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    <Database size={14} /> Database
                  </span>
                  <StatusBadge status={entry.database} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                    <Search size={14} /> Job search
                  </span>
                  <StatusBadge status={entry.jobSearch} />
                </div>
                <p className="text-[11px] text-slate-400">
                  {entry.checkedAt ? `Checked ${formatDateTime(entry.checkedAt)}` : "Checked on load"}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Activity feed" description="Select an item to open its record">
        {(data.activity ?? []).length === 0 ? (
          <EmptyState title="No recent activity" description="New sign-ups, CV reviews and applications appear here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.activity.map((item) => {
              const target = sectionForActivity(item);
              return (
                <li key={`${item.type}-${item.id}-${item.at}`}>
                  <button
                    type="button"
                    onClick={() => onNavigate(target, item.id)}
                    className="flex w-full items-start justify-between gap-4 rounded-lg px-2 py-3 text-left transition hover:bg-slate-50"
                    data-testid={`button-admin-activity-${item.type}-${item.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{item.detail}</p>
                    </div>
                    <p className="shrink-0 text-[11px] text-slate-400">{formatDateTime(item.at)}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
