import { useMemo } from "react";
import { Activity, Banknote, BriefcaseBusiness, CreditCard, Database, Eye, Search, TrendingUp, UserCheck } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type OverviewResponse, type SectionProps, adminFetch, buildQuery, formatDateTime, formatDayLabel, formatNumber, healthList, rangeParams, useAdminData } from "../api";
import { EmptyState, ErrorState, KpiCard, LoadingState, SectionCard, StatusBadge } from "../ui";

type Props = Pick<SectionProps, "token" | "range" | "from" | "to" | "refreshTick" | "onNavigate">;
const money = (cents: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format((cents || 0) / 100);

export default function OverviewSection({ token, range, from, to, refreshTick, onNavigate }: Props) {
  const { data, loading, error, reload } = useAdminData<OverviewResponse>(
    () => adminFetch<OverviewResponse>(`/admin/overview${buildQuery(rangeParams(range, from, to))}`, token),
    [token, range, from, to], refreshTick,
  );
  const chartData = useMemo(() => (data?.visitsByDay ?? []).map((row) => ({ ...row, label: formatDayLabel(row.day) })), [data?.visitsByDay]);
  if (loading && !data) return <LoadingState label="Loading dashboard…" />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void reload(false)} />;
  if (!data) return null;
  const { kpis } = data;
  const health = healthList(data.health);
  const maxPath = Math.max(1, ...(data.topPaths ?? []).map((row) => row.visits));
  const maxReferrer = Math.max(1, ...(data.topReferrers ?? []).map((row) => row.visits));

  return <div className="space-y-6">
    {error ? <ErrorState message={error} onRetry={() => void reload(false)} /> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Traffic hits" value={formatNumber(kpis.visits)} hint={`${formatNumber(kpis.uniqueVisitors)} unique visitors`} icon={<Eye size={18} />} onClick={() => onNavigate("traffic")} />
      <KpiCard label="Successful payments" value={formatNumber(kpis.successfulTransactions)} hint={`${formatNumber(kpis.processedPayments)} processed`} icon={<CreditCard size={18} />} tone="emerald" />
      <KpiCard label="Revenue" value={money(kpis.revenueCents)} hint="Verified successful payments" icon={<Banknote size={18} />} tone="emerald" />
      <KpiCard label="Payment conversion" value={`${(kpis.paymentConversionRate || 0).toFixed(1)}%`} hint="Successful / processed" icon={<TrendingUp size={18} />} />
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Active users" value={formatNumber(kpis.activeUsers ?? kpis.usersTotal)} hint={`${formatNumber(kpis.usersTotal)} total profiles`} icon={<UserCheck size={18} />} tone="emerald" onClick={() => onNavigate("users")} />
      <KpiCard label="Active jobs" value={formatNumber(kpis.jobsPublished)} hint={`${formatNumber(kpis.jobsCatalog)} in catalog`} icon={<BriefcaseBusiness size={18} />} onClick={() => onNavigate("jobs")} />
      <KpiCard label="Unique visitors" value={formatNumber(kpis.uniqueVisitors)} hint="Privacy-safe aggregate" icon={<Search size={18} />} onClick={() => onNavigate("traffic")} />
      <KpiCard label="System" value={health[0]?.api ? health[0].api.toUpperCase() : "—"} hint={health[0]?.checkedAt ? `Checked ${formatDateTime(health[0].checkedAt)}` : "Live service status"} icon={<Activity size={18} />} tone="emerald" />
    </div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <SectionCard title="Traffic over time" description="Aggregate page views for the selected range">
        {chartData.length === 0 ? <EmptyState title="No traffic trend yet" description="Traffic will appear after consented public-site visits are recorded." icon={<Eye size={18} />} /> :
          <div className="h-64 w-full min-w-0"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <defs><linearGradient id="admin-visits-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} /><stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} interval="preserveStartEnd" /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(value: number) => [formatNumber(value), "Visits"]} /><Area type="monotone" dataKey="visits" stroke="#0284c7" strokeWidth={2} fill="url(#admin-visits-gradient)" />
          </AreaChart></ResponsiveContainer></div>}
      </SectionCard>
      <div className="space-y-4">
        <SectionCard title="Top pages">{(data.topPaths ?? []).length === 0 ? <p className="text-sm text-slate-500">No page traffic recorded yet.</p> : <ul className="space-y-3">{data.topPaths.map((row) => <li key={row.path}><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium text-slate-700">{row.path}</span><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{formatNumber(row.visits)}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(4, (row.visits / maxPath) * 100)}%` }} /></div></li>)}</ul>}</SectionCard>
        {(data.topReferrers ?? []).length > 0 ? <SectionCard title="Top referrer origins"><ul className="space-y-3">{data.topReferrers!.map((row) => <li key={row.referrer ?? "direct"}><div className="flex items-center justify-between gap-3 text-sm"><span className="truncate font-medium text-slate-700">{row.referrer || "Direct"}</span><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{formatNumber(row.visits)}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-400" style={{ width: `${Math.max(4, (row.visits / maxReferrer) * 100)}%` }} /></div></li>)}</ul></SectionCard> : null}
      </div>
    </div>
    <SectionCard title="System health" description="Operational checks only; no individual user activity is included">
      {health.length === 0 ? <p className="text-sm text-slate-500">Health data is not available.</p> : <div className="grid gap-3 sm:grid-cols-3">{health.map((entry, index) => <div key={index} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500"><Activity size={14} /> API</span><StatusBadge status={entry.api} /></div><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500"><Database size={14} /> Database</span><StatusBadge status={entry.database} /></div><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500"><Search size={14} /> Job search</span><StatusBadge status={entry.jobSearch} /></div></div>)}</div>}
    </SectionCard>
  </div>;
}
