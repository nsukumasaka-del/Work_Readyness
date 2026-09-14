import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Trash2 } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";

import {
  type AdminDiagnostic,
  type AdminDiagnosticDetail,
  PERMISSIONS,
  type SectionProps,
  adminFetch,
  buildQuery,
  errorMessage,
  exportEntity,
  formatDateTime,
  formatNumber,
  humanizeKey,
  useAdminData,
  useDebouncedValue,
} from "../api";
import {
  ActionButton,
  BulkBar,
  ConfirmDialog,
  DetailBlock,
  DetailRow,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  RowCheckbox,
  SearchInput,
  SectionCard,
  SortHeader,
} from "../ui";

type DiagnosticsResponse = {
  reports?: AdminDiagnostic[];
  diagnostics?: AdminDiagnostic[];
  total?: number;
  page?: number;
  limit?: number;
};

type Props = Pick<SectionProps, "token" | "can" | "refreshTick" | "focusId" | "onFocusHandled" | "onMutated">;

const LIMIT = 25;

const HIDDEN_DETAIL_KEYS = new Set([
  "id",
  "fileName",
  "authenticityScore",
  "atsScore",
  "createdAt",
  "updatedAt",
  "userId",
  "userEmail",
  "userName",
]);

function scoreTone(score: number) {
  if (score >= 75) return "text-emerald-700";
  if (score >= 50) return "text-amber-700";
  return "text-rose-700";
}

export default function DiagnosticsSection({
  token,
  can,
  refreshTick,
  focusId,
  onFocusHandled,
  onMutated,
}: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("createdAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<number[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminDiagnosticDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "one" | "bulk"; id?: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  const debouncedSearch = useDebouncedValue(search);
  const canWrite = can(PERMISSIONS.diagnostics);

  const { data, loading, error, reload } = useAdminData<DiagnosticsResponse>(
    () =>
      adminFetch<DiagnosticsResponse>(
        `/admin/diagnostics${buildQuery({ q: debouncedSearch, page, limit: LIMIT })}`,
        token,
      ),
    [token, debouncedSearch, page],
    refreshTick,
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (focusId === null) return;
    setOpenId(focusId);
    onFocusHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (openId === null) {
      setDetail(null);
      setDetailError("");
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");
    adminFetch<AdminDiagnosticDetail | { report: AdminDiagnosticDetail }>(`/admin/diagnostics/${openId}`, token)
      .then((payload) => {
        if (cancelled) return;
        const report =
          (payload as { report?: AdminDiagnosticDetail }).report ?? (payload as AdminDiagnosticDetail);
        setDetail(report);
      })
      .catch((err) => {
        if (!cancelled) setDetailError(errorMessage(err, "Could not load this report"));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openId, token]);

  const reports = data?.reports ?? data?.diagnostics ?? [];
  const total = data?.total ?? reports.length;

  const sorted = useMemo(() => {
    const rows = [...reports];
    rows.sort((a, b) => {
      const left = (a as unknown as Record<string, unknown>)[sortKey];
      const right = (b as unknown as Record<string, unknown>)[sortKey];
      if (left === right) return 0;
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      if (typeof left === "number" && typeof right === "number") {
        return direction === "asc" ? left - right : right - left;
      }
      const comparison = String(left).localeCompare(String(right));
      return direction === "asc" ? comparison : -comparison;
    });
    return rows;
  }, [reports, sortKey, direction]);

  const extraDetail = useMemo(() => {
    if (!detail) return [] as Array<{ key: string; value: unknown }>;
    return Object.entries(detail)
      .filter(([key, value]) => !HIDDEN_DETAIL_KEYS.has(key) && value !== null && value !== undefined && value !== "")
      .map(([key, value]) => ({ key, value }));
  }, [detail]);

  function handleSort(key: string) {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection("asc");
  }

  async function handleDelete(id: number) {
    try {
      await adminFetch(`/admin/diagnostics/${id}`, token, { method: "DELETE" });
      toast({ title: "Report deleted" });
      setOpenId(null);
      setSelected((current) => current.filter((value) => value !== id));
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Delete failed", description: errorMessage(err), variant: "destructive" });
    }
  }

  async function handleBulkDelete() {
    if (selected.length === 0) return;
    try {
      await adminFetch("/admin/diagnostics/bulk-delete", token, {
        method: "POST",
        body: JSON.stringify({ ids: selected }),
      });
      toast({ title: "Reports deleted", description: `${selected.length} report(s) removed.` });
      setSelected([]);
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Bulk delete failed", description: errorMessage(err), variant: "destructive" });
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const count = await exportEntity(token, "diagnostics");
      toast({ title: "Export ready", description: `${count} row(s) downloaded as CSV.` });
    } catch (err) {
      toast({ title: "Export failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  const allSelected = sorted.length > 0 && selected.length === sorted.length;

  return (
    <>
      <SectionCard
        title="CV diagnostic reports"
        description={`${formatNumber(total)} report(s) generated`}
        actions={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search file name or user…"
              testId="input-admin-diagnostic-search"
            />
            <ActionButton onClick={() => void handleExport()} disabled={exporting} testId="button-admin-export-diagnostics">
              <Download size={13} /> {exporting ? "Exporting…" : "Export CSV"}
            </ActionButton>
          </>
        }
      >
        {error && !data ? (
          <ErrorState message={error} onRetry={() => void reload(false)} />
        ) : loading && !data ? (
          <LoadingState label="Loading CV reviews…" />
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No CV reviews yet"
            description={
              debouncedSearch
                ? "No report matches that search."
                : "Reports appear here once candidates run the CV diagnostic."
            }
            icon={<FileText size={18} />}
          />
        ) : (
          <>
            {canWrite ? (
              <BulkBar count={selected.length}>
                <ActionButton variant="danger" onClick={() => setConfirm({ kind: "bulk" })}>
                  <Trash2 size={13} /> Delete selected
                </ActionButton>
              </BulkBar>
            ) : null}

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {canWrite ? (
                      <th className="w-8 px-2 py-2">
                        <RowCheckbox
                          checked={allSelected}
                          onChange={(checked) => setSelected(checked ? sorted.map((row) => row.id) : [])}
                          label="Select all reports"
                        />
                      </th>
                    ) : null}
                    <SortHeader
                      label="File"
                      columnKey="fileName"
                      sortKey={sortKey}
                      direction={direction}
                      onSort={handleSort}
                    />
                    <th className="px-2 py-2 font-semibold">Candidate</th>
                    <SortHeader
                      label="Authenticity"
                      columnKey="authenticityScore"
                      sortKey={sortKey}
                      direction={direction}
                      onSort={handleSort}
                    />
                    <SortHeader label="ATS" columnKey="atsScore" sortKey={sortKey} direction={direction} onSort={handleSort} />
                    <SortHeader
                      label="Created"
                      columnKey="createdAt"
                      sortKey={sortKey}
                      direction={direction}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((report) => (
                    <tr
                      key={report.id}
                      onClick={() => setOpenId(report.id)}
                      className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
                      data-testid={`row-admin-diagnostic-${report.id}`}
                    >
                      {canWrite ? (
                        <td className="px-2 py-3">
                          <RowCheckbox
                            checked={selected.includes(report.id)}
                            onChange={(checked) =>
                              setSelected((current) =>
                                checked
                                  ? [...new Set([...current, report.id])]
                                  : current.filter((value) => value !== report.id),
                              )
                            }
                            label={`Select ${report.fileName}`}
                          />
                        </td>
                      ) : null}
                      <td className="px-2 py-3 font-medium text-slate-800">{report.fileName}</td>
                      <td className="px-2 py-3 text-slate-600">{report.userEmail || report.userName || "—"}</td>
                      <td className={`px-2 py-3 font-semibold ${scoreTone(report.authenticityScore)}`}>
                        {report.authenticityScore}
                      </td>
                      <td className={`px-2 py-3 font-semibold ${scoreTone(report.atsScore)}`}>{report.atsScore}</td>
                      <td className="px-2 py-3 text-slate-500">{formatDateTime(report.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination page={data?.page ?? page} limit={data?.limit ?? LIMIT} total={total} onPageChange={setPage} />
          </>
        )}
      </SectionCard>

      <Sheet open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{detail?.fileName || "CV report"}</SheetTitle>
            <SheetDescription>
              {detail ? `Generated ${formatDateTime(detail.createdAt)}` : "Loading report…"}
            </SheetDescription>
          </SheetHeader>

          {detailLoading ? (
            <LoadingState label="Loading report…" />
          ) : detailError ? (
            <div className="mt-4">
              <ErrorState message={detailError} />
            </div>
          ) : detail ? (
            <div className="mt-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Authenticity</p>
                  <p className={`mt-2 text-2xl font-semibold ${scoreTone(detail.authenticityScore)}`}>
                    {detail.authenticityScore}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">ATS score</p>
                  <p className={`mt-2 text-2xl font-semibold ${scoreTone(detail.atsScore)}`}>{detail.atsScore}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <DetailRow label="Report ID" value={detail.id} />
                <DetailRow label="File" value={detail.fileName} />
                <DetailRow label="Candidate" value={detail.userName || "—"} />
                <DetailRow label="Email" value={detail.userEmail || "—"} />
                <DetailRow label="Created" value={formatDateTime(detail.createdAt)} />
              </div>

              {extraDetail.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">Report data</h3>
                  {extraDetail.map(({ key, value }) => (
                    <DetailBlock
                      key={key}
                      label={humanizeKey(key)}
                      value={
                        Array.isArray(value) ? (
                          <ul className="list-disc space-y-1 pl-4">
                            {value.map((entry, index) => (
                              <li key={index}>
                                {typeof entry === "object" ? JSON.stringify(entry) : String(entry)}
                              </li>
                            ))}
                          </ul>
                        ) : typeof value === "object" ? (
                          <pre className="overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          String(value)
                        )
                      }
                    />
                  ))}
                </div>
              ) : null}

              {canWrite ? (
                <ActionButton
                  variant="danger"
                  onClick={() => setConfirm({ kind: "one", id: detail.id })}
                  testId="button-admin-delete-diagnostic"
                >
                  <Trash2 size={13} /> Delete report
                </ActionButton>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.kind === "bulk" ? `Delete ${selected.length} report(s)?` : "Delete this report?"}
        description="The diagnostic report will be permanently removed."
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirm?.kind === "bulk") void handleBulkDelete();
          else if (confirm?.id) void handleDelete(confirm.id);
          setConfirm(null);
        }}
      />
    </>
  );
}
