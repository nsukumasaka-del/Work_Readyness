import { useMemo } from "react";
import { Eye, MousePointerClick, Repeat2, Users } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { type SectionProps, type TrafficResponse, adminFetch, buildQuery, formatDayLabel, formatNumber, rangeParams, useAdminData } from "../api";
import { EmptyState, ErrorState, KpiCard, LoadingState, SectionCard } from "../ui";

type Props = Pick<SectionProps, "token" | "range" | "from" | "to" | "refreshTick">;

export default function TrafficSection({ token, range, from, to, refreshTick }: Props) {
  const { data, loading, error, reload } = useAdminData<TrafficResponse>(
    () => adminFetch<TrafficResponse>(`/admin/traffic${buildQuery(rangeParams(range, from, to))}`, token),
    [token, range, from, to], refreshTick,
  );
  const days = useMemo(() => (data?.visitsByDay ?? []).map((row) => ({ ...row, label: formatDayLabel(row.day) })), [data?.visitsByDay]);
  if (loading && !data) return <LoadingState label="Loading aggregate traffic…" />;
  if (error && !data) return <ErrorState message={error} onRetry={() => void reload(false)} />;
  const totals = data?.totals;
  const visits = totals?.visits ?? days.reduce((sum, row) => sum + row.visits, 0);
  const unique = totals?.uniqueVisitors ?? 0;
  const pageviewsPerVisitor = unique ? visits / unique : 0;

  return <div className="space-y-6">
    {error ? <ErrorState message={error} onRetry={() => void reload(false)} /> : null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Traffic hits" value={formatNumber(visits)} hint="Aggregate page views" icon={<Eye size={18} />} />
      <KpiCard label="Unique visitors" value={formatNumber(unique)} hint="Deduplicated aggregate" icon={<Users size={18} />} />
      <KpiCard label="Views / visitor" value={pageviewsPerVisitor.toFixed(1)} hint="Engagement ratio" icon={<MousePointerClick size={18} />} />
      <KpiCard label="Returning visitors" value={formatNumber(totals?.returningVisitors ?? 0)} hint="Aggregate repeat visits" icon={<Repeat2 size={18} />} />
    </div>
    <SectionCard title="Traffic trend" description="No visitor identifiers or individual visit records are exposed">
      {days.length === 0 ? <EmptyState title="No traffic in this range" description="Try a wider date range." /> : <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={days} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip /><Area type="monotone" dataKey="visits" stroke="#0284c7" strokeWidth={2} fill="#bae6fd" /></AreaChart></ResponsiveContainer></div>}
    </SectionCard>
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Top pages"><ul className="divide-y divide-slate-100">{(data?.topPaths ?? []).map((row) => <li key={row.path} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="truncate text-slate-700">{row.path}</span><strong>{formatNumber(row.visits)}</strong></li>)}</ul></SectionCard>
      <SectionCard title="Referrer origins"><ul className="divide-y divide-slate-100">{(data?.topReferrers ?? []).map((row) => <li key={row.referrer ?? "direct"} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="truncate text-slate-700">{row.referrer || "Direct"}</span><strong>{formatNumber(row.visits)}</strong></li>)}</ul></SectionCard>
    </div>
  </div>;
}
