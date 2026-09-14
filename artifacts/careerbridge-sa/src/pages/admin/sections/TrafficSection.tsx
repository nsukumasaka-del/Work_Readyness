import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Globe, MonitorSmartphone, Users, X } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { toast } from "@/hooks/use-toast";

import {
  type AdminVisit,
  type SectionProps,
  type TrafficResponse,
  adminFetch,
  buildQuery,
  errorMessage,
  exportEntity,
  formatDateTime,
  formatDayLabel,
  formatNumber,
  rangeParams,
  useAdminData,
} from "../api";
import {
  ActionButton,
  EmptyState,
  ErrorState,
  KpiCard,
  LoadingState,
  Pagination,
  SearchInput,
  SectionCard,
} from "../ui";

type VisitsResponse = { visits: AdminVisit[]; total?: number; page?: number; limit?: number };

type Props = Pick<SectionProps, "token" | "range" | "from" | "to" | "refreshTick">;

const LIMIT = 25;

const PIE_COLORS = ["#0ea5e9", "#6366f1", "#14b8a6", "#f59e0b", "#f43f5e", "#8b5cf6", "#64748b"];

export default function TrafficSection({ token, range, from, to, refreshTick }: Props) {
  const [pathFilter, setPathFilter] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const traffic = useAdminData<TrafficResponse>(
    () => adminFetch<TrafficResponse>(`/admin/traffic${buildQuery(rangeParams(range, from, to))}`, token),
    [token, range, from, to],
    refreshTick,
  );

  const visits = useAdminData<VisitsResponse>(
    () =>
      adminFetch<VisitsResponse>(
        `/admin/visits${buildQuery({ ...rangeParams(range, from, to), page, limit: LIMIT, path: pathFilter })}`,
        token,
      ),
    [token, range, from, to, page, pathFilter],
    refreshTick,
  );

  useEffect(() => {
    setPage(1);
  }, [pathFilter, range, from, to]);

  const data = traffic.data;

  const visitsByDay = useMemo(
    () => (data?.visitsByDay ?? []).map((row) => ({ ...row, label: formatDayLabel(row.day) })),
    [data?.visitsByDay],
  );

  const topPaths = useMemo(
    () =>
      (data?.topPaths ?? []).slice(0, 10).map((row) => ({
        ...row,
        label: row.path.length > 24 ? `${row.path.slice(0, 23)}…` : row.path,
      })),
    [data?.topPaths],
  );

  const devices = useMemo(
    () => (data?.devices ?? []).map((row) => ({ name: row.device || "Unknown", value: row.visits })),
    [data?.devices],
  );

  const browsers = useMemo(
    () => (data?.browsers ?? []).map((row) => ({ name: row.browser || "Unknown", value: row.visits })),
    [data?.browsers],
  );

  const visitRows = visits.data?.visits ?? [];
  const visitTotal = visits.data?.total ?? visitRows.length;

  async function handleExport() {
    setExporting(true);
    try {
      const count = await exportEntity(token, "visits");
      toast({ title: "Export ready", description: `${count} row(s) downloaded as CSV.` });
    } catch (err) {
      toast({ title: "Export failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  const totals = data?.totals;

  return (
    <div className="space-y-6">
      {traffic.error && !data ? (
        <ErrorState message={traffic.error} onRetry={() => void traffic.reload(false)} />
      ) : traffic.loading && !data ? (
        <LoadingState label="Loading traffic analytics…" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Visits"
              value={formatNumber(totals?.visits ?? visitsByDay.reduce((sum, row) => sum + row.visits, 0))}
              hint="Page views in range"
              icon={<Eye size={18} />}
            />
            <KpiCard
              label="Unique visitors"
              value={formatNumber(totals?.uniqueVisitors)}
              hint="Deduplicated by visitor id"
              icon={<Users size={18} />}
            />
            <KpiCard
              label="New visitors"
              value={formatNumber(totals?.newVisitors)}
              hint={totals?.returningVisitors === undefined ? undefined : `${formatNumber(totals.returningVisitors)} returning`}
              icon={<Globe size={18} />}
              tone="emerald"
            />
            <KpiCard
              label="Pages / visitor"
              value={formatNumber(totals?.pageviewsPerVisitor)}
              hint="Average depth"
              icon={<MonitorSmartphone size={18} />}
              tone="slate"
            />
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <SectionCard title="Visits over time">
              {visitsByDay.length === 0 ? (
                <EmptyState title="No traffic in this range" description="Try a wider date range." />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={visitsByDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="admin-traffic-gradient" x1="0" y1="0" x2="0" y2="1">
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
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                        labelStyle={{ color: "#0f172a", fontWeight: 600 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="visits"
                        stroke="#0284c7"
                        strokeWidth={2}
                        fill="url(#admin-traffic-gradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Top pages" description="Select a page to drill into its visits">
              {topPaths.length === 0 ? (
                <EmptyState title="No page data yet" />
              ) : (
                <>
                  <div className="h-52 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topPaths} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={120}
                          tick={{ fontSize: 11, fill: "#64748b" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                        <Bar dataKey="visits" fill="#0ea5e9" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-3 space-y-1.5">
                    {topPaths.map((row) => (
                      <li key={row.path}>
                        <button
                          type="button"
                          onClick={() => setPathFilter(row.path)}
                          className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="truncate font-medium text-slate-700">{row.path}</span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                            {formatNumber(row.visits)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </SectionCard>
          </div>

          {devices.length > 0 || browsers.length > 0 || (data?.topReferrers ?? []).length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {devices.length > 0 ? (
                <SectionCard title="Devices">
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={devices} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                          {devices.map((entry, index) => (
                            <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="space-y-1.5">
                    {devices.map((entry, index) => (
                      <li key={entry.name} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: PIE_COLORS[index % PIE_COLORS.length] }}
                          />
                          {entry.name}
                        </span>
                        <span className="font-semibold">{formatNumber(entry.value)}</span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ) : null}

              {browsers.length > 0 ? (
                <SectionCard title="Browsers">
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={browsers} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                        <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>
              ) : null}

              {(data?.topReferrers ?? []).length > 0 ? (
                <SectionCard title="Top referrers">
                  <ul className="space-y-2">
                    {(data?.topReferrers ?? []).map((row) => (
                      <li
                        key={row.referrer ?? "direct"}
                        className="flex items-center justify-between gap-3 text-sm text-slate-700"
                      >
                        <span className="truncate">{row.referrer || "Direct"}</span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {formatNumber(row.visits)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <SectionCard
        title="Visit log"
        description={pathFilter ? `Filtered to ${pathFilter}` : `${formatNumber(visitTotal)} visit(s) in range`}
        actions={
          <>
            <SearchInput
              value={pathFilter}
              onChange={setPathFilter}
              placeholder="Filter by path e.g. /jobs"
              testId="input-admin-visit-path"
            />
            {pathFilter ? (
              <ActionButton onClick={() => setPathFilter("")}>
                <X size={13} /> Clear
              </ActionButton>
            ) : null}
            <ActionButton onClick={() => void handleExport()} disabled={exporting} testId="button-admin-export-visits">
              <Download size={13} /> {exporting ? "Exporting…" : "Export CSV"}
            </ActionButton>
          </>
        }
      >
        {visits.error && !visits.data ? (
          <ErrorState message={visits.error} onRetry={() => void visits.reload(false)} />
        ) : visits.loading && !visits.data ? (
          <LoadingState label="Loading visits…" />
        ) : visitRows.length === 0 ? (
          <EmptyState
            title="No visits recorded"
            description={pathFilter ? "No visits for that path in this range." : "Browse the public site to generate traffic."}
            icon={<Eye size={18} />}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2 font-semibold">Path</th>
                    <th className="px-2 py-2 font-semibold">Visitor</th>
                    <th className="px-2 py-2 font-semibold">Referrer</th>
                    <th className="px-2 py-2 font-semibold">Device</th>
                    <th className="px-2 py-2 font-semibold">When</th>
                  </tr>
                </thead>
                <tbody>
                  {visitRows.map((visit) => (
                    <tr key={visit.id} className="border-b border-slate-100">
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => setPathFilter(visit.path)}
                          className="font-medium text-slate-800 hover:text-sky-700"
                        >
                          {visit.path}
                        </button>
                      </td>
                      <td className="px-2 py-3 font-mono text-xs text-slate-500">{visit.visitorId.slice(0, 12)}</td>
                      <td className="px-2 py-3 text-slate-500">{visit.referrer || "Direct"}</td>
                      <td className="px-2 py-3 text-slate-500">
                        {[visit.device, visit.browser].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-2 py-3 text-slate-500">{formatDateTime(visit.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={visits.data?.page ?? page}
              limit={visits.data?.limit ?? LIMIT}
              total={visitTotal}
              onPageChange={setPage}
            />
          </>
        )}
      </SectionCard>
    </div>
  );
}
