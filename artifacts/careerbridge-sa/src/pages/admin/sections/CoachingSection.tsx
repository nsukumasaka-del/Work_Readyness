import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Download, Save, Trash2 } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";

import {
  type AdminCoaching,
  type AdminCoachingDetail,
  COACHING_PRIORITIES,
  COACHING_STATUSES,
  LEGACY_COACHING_STATUSES,
  PERMISSIONS,
  type SectionProps,
  adminFetch,
  buildQuery,
  errorMessage,
  exportEntity,
  formatDateTime,
  formatNumber,
  humanizeStatus,
  toDateTimeInputValue,
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
  FilterSelect,
  LoadingState,
  Pagination,
  RowCheckbox,
  SearchInput,
  SectionCard,
  SelectField,
  SortHeader,
  StatusBadge,
  TextAreaField,
  TextField,
} from "../ui";

type CoachingResponse = {
  applications?: AdminCoaching[];
  coaching?: AdminCoaching[];
  total?: number;
  page?: number;
  limit?: number;
};

type Props = Pick<SectionProps, "token" | "can" | "refreshTick" | "focusId" | "onFocusHandled" | "onMutated">;

const LIMIT = 25;

const ALL_STATUSES = [...COACHING_STATUSES, ...LEGACY_COACHING_STATUSES];

const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  ...COACHING_STATUSES.map((status) => ({ value: status, label: humanizeStatus(status) })),
];

const STATUS_OPTIONS = ALL_STATUSES.map((status) => ({ value: status, label: humanizeStatus(status) }));

const PRIORITY_OPTIONS = COACHING_PRIORITIES.map((priority) => ({
  value: priority,
  label: humanizeStatus(priority),
}));

const BULK_STATUSES = ["under_review", "approved", "rejected", "scheduled", "completed", "cancelled"] as const;

type EditState = {
  status: string;
  priority: string;
  assignedCoach: string;
  internalNotes: string;
  scheduledAt: string;
};

export default function CoachingSection({ token, can, refreshTick, focusId, onFocusHandled, onMutated }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("createdAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<number[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminCoachingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ id: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  const debouncedSearch = useDebouncedValue(search);
  const canWrite = can(PERMISSIONS.coaching);

  const { data, loading, error, reload } = useAdminData<CoachingResponse>(
    () =>
      adminFetch<CoachingResponse>(
        `/admin/coaching${buildQuery({ q: debouncedSearch, status, page, limit: LIMIT })}`,
        token,
      ),
    [token, debouncedSearch, status, page],
    refreshTick,
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  useEffect(() => {
    if (focusId === null) return;
    setOpenId(focusId);
    onFocusHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (openId === null) {
      setDetail(null);
      setEdit(null);
      setDetailError("");
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");
    adminFetch<AdminCoachingDetail | { application: AdminCoachingDetail }>(`/admin/coaching/${openId}`, token)
      .then((payload) => {
        if (cancelled) return;
        const application =
          (payload as { application?: AdminCoachingDetail }).application ?? (payload as AdminCoachingDetail);
        setDetail(application);
        setEdit({
          status: application.status || "pending",
          priority: application.priority || "normal",
          assignedCoach: application.assignedCoach || "",
          internalNotes: application.internalNotes || "",
          scheduledAt: toDateTimeInputValue(application.scheduledAt),
        });
      })
      .catch((err) => {
        if (!cancelled) setDetailError(errorMessage(err, "Could not load this application"));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openId, token]);

  const applications = data?.applications ?? data?.coaching ?? [];
  const total = data?.total ?? applications.length;

  const sorted = useMemo(() => {
    const rows = [...applications];
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
  }, [applications, sortKey, direction]);

  function handleSort(key: string) {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection("asc");
  }

  async function handleSave() {
    if (!openId || !edit) return;
    setSaving(true);
    try {
      await adminFetch(`/admin/coaching/${openId}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          status: edit.status,
          priority: edit.priority,
          assignedCoach: edit.assignedCoach,
          internalNotes: edit.internalNotes,
          scheduledAt: edit.scheduledAt ? new Date(edit.scheduledAt).toISOString() : null,
        }),
      });
      toast({ title: "Application updated", description: `Status set to ${humanizeStatus(edit.status)}.` });
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Update failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleInlineStatus(id: number, nextStatus: string) {
    try {
      await adminFetch(`/admin/coaching/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      toast({ title: "Status updated", description: humanizeStatus(nextStatus) });
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Could not update status", description: errorMessage(err), variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    try {
      await adminFetch(`/admin/coaching/${id}`, token, { method: "DELETE" });
      toast({ title: "Application deleted" });
      setOpenId(null);
      setSelected((current) => current.filter((value) => value !== id));
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Delete failed", description: errorMessage(err), variant: "destructive" });
    }
  }

  async function handleBulkStatus(nextStatus: string) {
    if (selected.length === 0) return;
    try {
      await adminFetch("/admin/coaching/bulk-status", token, {
        method: "POST",
        body: JSON.stringify({ ids: selected, status: nextStatus }),
      });
      toast({
        title: "Applications updated",
        description: `${selected.length} moved to ${humanizeStatus(nextStatus)}.`,
      });
      setSelected([]);
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Bulk update failed", description: errorMessage(err), variant: "destructive" });
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const count = await exportEntity(token, "coaching");
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
        title="Coaching pipeline"
        description={`${formatNumber(total)} application(s)`}
        actions={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search name, email, goals…"
              testId="input-admin-coaching-search"
            />
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={STATUS_FILTERS}
              ariaLabel="Filter applications by status"
              testId="select-admin-coaching-filter"
            />
            <ActionButton onClick={() => void handleExport()} disabled={exporting} testId="button-admin-export-coaching">
              <Download size={13} /> {exporting ? "Exporting…" : "Export CSV"}
            </ActionButton>
          </>
        }
      >
        {error && !data ? (
          <ErrorState message={error} onRetry={() => void reload(false)} />
        ) : loading && !data ? (
          <LoadingState label="Loading applications…" />
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No coaching applications"
            description={
              debouncedSearch || status
                ? "No application matches these filters."
                : "Applications submitted from the coaching page appear here."
            }
            icon={<ClipboardList size={18} />}
          />
        ) : (
          <>
            {canWrite ? (
              <BulkBar count={selected.length}>
                {BULK_STATUSES.map((value) => (
                  <ActionButton key={value} onClick={() => void handleBulkStatus(value)}>
                    {humanizeStatus(value)}
                  </ActionButton>
                ))}
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
                          label="Select all applications"
                        />
                      </th>
                    ) : null}
                    <SortHeader label="Applicant" columnKey="name" sortKey={sortKey} direction={direction} onSort={handleSort} />
                    <th className="px-2 py-2 font-semibold">Plan</th>
                    <SortHeader label="Priority" columnKey="priority" sortKey={sortKey} direction={direction} onSort={handleSort} />
                    <th className="px-2 py-2 font-semibold">Coach</th>
                    <SortHeader label="Status" columnKey="status" sortKey={sortKey} direction={direction} onSort={handleSort} />
                    <SortHeader
                      label="Received"
                      columnKey="createdAt"
                      sortKey={sortKey}
                      direction={direction}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((application) => (
                    <tr
                      key={application.id}
                      onClick={() => setOpenId(application.id)}
                      className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
                      data-testid={`row-admin-coaching-${application.id}`}
                    >
                      {canWrite ? (
                        <td className="px-2 py-3">
                          <RowCheckbox
                            checked={selected.includes(application.id)}
                            onChange={(checked) =>
                              setSelected((current) =>
                                checked
                                  ? [...new Set([...current, application.id])]
                                  : current.filter((value) => value !== application.id),
                              )
                            }
                            label={`Select ${application.name}`}
                          />
                        </td>
                      ) : null}
                      <td className="px-2 py-3">
                        <p className="font-medium text-slate-800">{application.name}</p>
                        <p className="text-xs text-slate-500">{application.email}</p>
                      </td>
                      <td className="px-2 py-3 text-slate-600">{application.paymentPlan || "—"}</td>
                      <td className="px-2 py-3">
                        {application.priority ? <StatusBadge status={application.priority} /> : "—"}
                      </td>
                      <td className="px-2 py-3 text-slate-600">{application.assignedCoach || "Unassigned"}</td>
                      <td className="px-2 py-3" onClick={(event) => event.stopPropagation()}>
                        {canWrite ? (
                          <select
                            value={application.status}
                            onChange={(event) => void handleInlineStatus(application.id, event.target.value)}
                            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-sky-400"
                            data-testid={`select-coaching-status-${application.id}`}
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <StatusBadge status={application.status} />
                        )}
                      </td>
                      <td className="px-2 py-3 text-slate-500">{formatDateTime(application.createdAt)}</td>
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
            <SheetTitle>{detail?.name || "Coaching application"}</SheetTitle>
            <SheetDescription>{detail?.email || "Loading application…"}</SheetDescription>
          </SheetHeader>

          {detailLoading ? (
            <LoadingState label="Loading application…" />
          ) : detailError ? (
            <div className="mt-4">
              <ErrorState message={detailError} />
            </div>
          ) : detail ? (
            <div className="mt-5 space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <DetailRow label="Application ID" value={detail.id} />
                <DetailRow label="Phone" value={detail.phone || "—"} />
                <DetailRow label="Payment plan" value={detail.paymentPlan || "—"} />
                <DetailRow label="Experience" value={detail.experience || "—"} />
                <DetailRow label="Current status" value={<StatusBadge status={detail.status} />} />
                <DetailRow label="Scheduled" value={formatDateTime(detail.scheduledAt)} />
                <DetailRow label="Received" value={formatDateTime(detail.createdAt)} />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <DetailBlock label="Goals" value={detail.goals || "—"} />
              </div>

              {canWrite && edit ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Manage application</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                      label="Status"
                      value={edit.status}
                      onChange={(value) => setEdit({ ...edit, status: value })}
                      options={STATUS_OPTIONS}
                    />
                    <SelectField
                      label="Priority"
                      value={edit.priority}
                      onChange={(value) => setEdit({ ...edit, priority: value })}
                      options={PRIORITY_OPTIONS}
                    />
                    <TextField
                      label="Assigned coach"
                      value={edit.assignedCoach}
                      onChange={(value) => setEdit({ ...edit, assignedCoach: value })}
                      placeholder="Coach name"
                    />
                    <TextField
                      label="Scheduled at"
                      type="datetime-local"
                      value={edit.scheduledAt}
                      onChange={(value) => setEdit({ ...edit, scheduledAt: value })}
                    />
                    <TextAreaField
                      label="Internal notes"
                      value={edit.internalNotes}
                      onChange={(value) => setEdit({ ...edit, internalNotes: value })}
                      placeholder="Only visible to administrators"
                      className="sm:col-span-2"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <ActionButton
                      variant="primary"
                      onClick={() => void handleSave()}
                      disabled={saving}
                      testId="button-admin-save-coaching"
                    >
                      <Save size={13} /> {saving ? "Saving…" : "Save changes"}
                    </ActionButton>
                    <ActionButton
                      variant="danger"
                      onClick={() => setConfirm({ id: detail.id })}
                      testId="button-admin-delete-coaching"
                    >
                      <Trash2 size={13} /> Delete application
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">You do not have permission to manage coaching applications.</p>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete this application?"
        description="The coaching application and its internal notes will be permanently removed."
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirm) void handleDelete(confirm.id);
          setConfirm(null);
        }}
      />
    </>
  );
}
