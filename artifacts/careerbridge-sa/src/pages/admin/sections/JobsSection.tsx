import { useEffect, useMemo, useState } from "react";
import { Archive, BriefcaseBusiness, Download, EyeOff, Plus, Save, Send, Trash2 } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";

import {
  type AdminJob,
  JOB_STATUSES,
  type JobInput,
  PERMISSIONS,
  type SectionProps,
  adminFetch,
  buildQuery,
  errorMessage,
  exportEntity,
  formatDate,
  formatNumber,
  humanizeStatus,
  toDateInputValue,
  useAdminData,
  useDebouncedValue,
} from "../api";
import {
  ActionButton,
  BulkBar,
  ConfirmDialog,
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

type JobsResponse = { jobs: AdminJob[]; total?: number; page?: number; limit?: number };

type Props = Pick<SectionProps, "token" | "can" | "refreshTick" | "focusId" | "onFocusHandled" | "onMutated">;

const LIMIT = 25;

const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  ...JOB_STATUSES.map((status) => ({ value: status, label: humanizeStatus(status) })),
];

const STATUS_OPTIONS = JOB_STATUSES.map((status) => ({ value: status, label: humanizeStatus(status) }));

const EMPLOYMENT_TYPES = [
  { value: "", label: "Not specified" },
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "learnership", label: "Learnership" },
  { value: "temporary", label: "Temporary" },
];

const WORK_MODES = [
  { value: "", label: "Not specified" },
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

const EMPTY_FORM: JobInput & { tagsText: string } = {
  title: "",
  company: "",
  location: "",
  sector: "",
  salary: "",
  match: null,
  posted: "",
  tags: [],
  tagsText: "",
  description: "",
  requirements: "",
  applicationUrl: "",
  employmentType: "",
  workMode: "",
  status: "draft",
  closingDate: null,
};

function toForm(job: AdminJob): JobInput & { tagsText: string } {
  return {
    title: job.title ?? "",
    company: job.company ?? "",
    location: job.location ?? "",
    sector: job.sector ?? "",
    salary: job.salary ?? "",
    match: job.match ?? null,
    posted: job.posted ?? "",
    tags: job.tags ?? [],
    tagsText: (job.tags ?? []).join(", "),
    description: job.description ?? "",
    requirements: job.requirements ?? "",
    applicationUrl: job.applicationUrl ?? "",
    employmentType: job.employmentType ?? "",
    workMode: job.workMode ?? "",
    status: job.status ?? "draft",
    closingDate: toDateInputValue(job.closingDate) || null,
  };
}

export default function JobsSection({ token, can, refreshTick, focusId, onFocusHandled, onMutated }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("createdAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<number[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "one" | "bulk"; id?: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  const debouncedSearch = useDebouncedValue(search);
  const canWrite = can(PERMISSIONS.jobs);

  const { data, loading, error, reload } = useAdminData<JobsResponse>(
    () => adminFetch<JobsResponse>(`/admin/jobs${buildQuery({ q: debouncedSearch, status, page, limit: LIMIT })}`, token),
    [token, debouncedSearch, status, page],
    refreshTick,
  );

  const jobs = data?.jobs ?? [];
  const total = data?.total ?? jobs.length;

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  useEffect(() => {
    if (focusId === null) return;
    const job = jobs.find((row) => row.id === focusId);
    if (job) {
      setEditingId(job.id);
      setForm(toForm(job));
      setEditorOpen(true);
      onFocusHandled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, jobs]);

  const sorted = useMemo(() => {
    const rows = [...jobs];
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
  }, [jobs, sortKey, direction]);

  function handleSort(key: string) {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection("asc");
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  }

  function openEdit(job: AdminJob) {
    setEditingId(job.id);
    setForm(toForm(job));
    setEditorOpen(true);
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.company.trim()) {
      toast({ title: "Missing details", description: "Title and company are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const body = {
      title: form.title,
      company: form.company,
      location: form.location,
      sector: form.sector,
      salary: form.salary,
      match: form.match,
      posted: form.posted,
      tags: form.tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      description: form.description,
      requirements: form.requirements,
      applicationUrl: form.applicationUrl,
      employmentType: form.employmentType,
      workMode: form.workMode,
      status: form.status,
      closingDate: form.closingDate || null,
    };
    try {
      if (editingId) {
        await adminFetch(`/admin/jobs/${editingId}`, token, { method: "PATCH", body: JSON.stringify(body) });
        toast({ title: "Job updated", description: form.title });
      } else {
        await adminFetch("/admin/jobs", token, { method: "POST", body: JSON.stringify(body) });
        toast({ title: "Job created", description: form.title });
      }
      setEditorOpen(false);
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Save failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(job: AdminJob, nextStatus: string) {
    try {
      await adminFetch(`/admin/jobs/${job.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      toast({ title: `Job ${humanizeStatus(nextStatus).toLowerCase()}`, description: job.title });
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Could not update job", description: errorMessage(err), variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    try {
      await adminFetch(`/admin/jobs/${id}`, token, { method: "DELETE" });
      toast({ title: "Job deleted" });
      setEditorOpen(false);
      setSelected((current) => current.filter((value) => value !== id));
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Delete failed", description: errorMessage(err), variant: "destructive" });
    }
  }

  async function handleBulk(action: "publish" | "unpublish" | "archive" | "delete") {
    if (selected.length === 0) return;
    try {
      await adminFetch("/admin/jobs/bulk", token, {
        method: "POST",
        body: JSON.stringify({ ids: selected, action }),
      });
      toast({ title: `Bulk ${action} complete`, description: `${selected.length} job(s) updated.` });
      setSelected([]);
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Bulk action failed", description: errorMessage(err), variant: "destructive" });
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const count = await exportEntity(token, "jobs");
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
        title="Jobs catalog"
        description={`${formatNumber(total)} job listing(s)`}
        actions={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search title, company, tag…"
              testId="input-admin-job-search"
            />
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={STATUS_FILTERS}
              ariaLabel="Filter jobs by status"
              testId="select-admin-job-status"
            />
            <ActionButton onClick={() => void handleExport()} disabled={exporting} testId="button-admin-export-jobs">
              <Download size={13} /> {exporting ? "Exporting…" : "Export CSV"}
            </ActionButton>
            {canWrite ? (
              <ActionButton variant="primary" onClick={openCreate} testId="button-admin-new-job">
                <Plus size={13} /> New job
              </ActionButton>
            ) : null}
          </>
        }
      >
        {error && !data ? (
          <ErrorState message={error} onRetry={() => void reload(false)} />
        ) : loading && !data ? (
          <LoadingState label="Loading jobs…" />
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No jobs in the catalog"
            description={
              debouncedSearch || status ? "No job matches these filters." : "Create your first listing to get started."
            }
            icon={<BriefcaseBusiness size={18} />}
            action={
              canWrite ? (
                <ActionButton variant="primary" onClick={openCreate}>
                  <Plus size={13} /> New job
                </ActionButton>
              ) : undefined
            }
          />
        ) : (
          <>
            {canWrite ? (
              <BulkBar count={selected.length}>
                <ActionButton onClick={() => void handleBulk("publish")}>
                  <Send size={13} /> Publish
                </ActionButton>
                <ActionButton onClick={() => void handleBulk("unpublish")}>
                  <EyeOff size={13} /> Unpublish
                </ActionButton>
                <ActionButton onClick={() => void handleBulk("archive")}>
                  <Archive size={13} /> Archive
                </ActionButton>
                <ActionButton variant="danger" onClick={() => setConfirm({ kind: "bulk" })}>
                  <Trash2 size={13} /> Delete
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
                          label="Select all jobs"
                        />
                      </th>
                    ) : null}
                    <SortHeader label="Title" columnKey="title" sortKey={sortKey} direction={direction} onSort={handleSort} />
                    <SortHeader label="Company" columnKey="company" sortKey={sortKey} direction={direction} onSort={handleSort} />
                    <SortHeader label="Location" columnKey="location" sortKey={sortKey} direction={direction} onSort={handleSort} />
                    <SortHeader label="Sector" columnKey="sector" sortKey={sortKey} direction={direction} onSort={handleSort} />
                    <SortHeader label="Status" columnKey="status" sortKey={sortKey} direction={direction} onSort={handleSort} />
                    <th className="px-2 py-2 font-semibold">Closing</th>
                    <th className="px-2 py-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((job) => (
                    <tr
                      key={job.id}
                      onClick={() => openEdit(job)}
                      className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
                      data-testid={`row-admin-job-${job.id}`}
                    >
                      {canWrite ? (
                        <td className="px-2 py-3">
                          <RowCheckbox
                            checked={selected.includes(job.id)}
                            onChange={(checked) =>
                              setSelected((current) =>
                                checked
                                  ? [...new Set([...current, job.id])]
                                  : current.filter((value) => value !== job.id),
                              )
                            }
                            label={`Select ${job.title}`}
                          />
                        </td>
                      ) : null}
                      <td className="px-2 py-3 font-medium text-slate-800">{job.title}</td>
                      <td className="px-2 py-3 text-slate-600">{job.company}</td>
                      <td className="px-2 py-3 text-slate-600">{job.location || "—"}</td>
                      <td className="px-2 py-3 text-slate-600">{job.sector || "—"}</td>
                      <td className="px-2 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-2 py-3 text-slate-500">{formatDate(job.closingDate)}</td>
                      <td className="px-2 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                        {canWrite ? (
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            {job.status === "published" ? (
                              <ActionButton onClick={() => void handleStatus(job, "draft")}>Unpublish</ActionButton>
                            ) : (
                              <ActionButton onClick={() => void handleStatus(job, "published")}>Publish</ActionButton>
                            )}
                            {job.status !== "archived" ? (
                              <ActionButton onClick={() => void handleStatus(job, "archived")}>Archive</ActionButton>
                            ) : null}
                            <ActionButton variant="danger" onClick={() => setConfirm({ kind: "one", id: job.id })}>
                              <Trash2 size={13} />
                            </ActionButton>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">View only</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination page={data?.page ?? page} limit={data?.limit ?? LIMIT} total={total} onPageChange={setPage} />
          </>
        )}
      </SectionCard>

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit job listing" : "New job listing"}</SheetTitle>
            <SheetDescription>
              {editingId ? "Update the listing and save your changes." : "Publish a new opportunity to the jobs board."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <TextField label="Title" value={form.title} onChange={(value) => setForm({ ...form, title: value })} required />
            <TextField label="Company" value={form.company} onChange={(value) => setForm({ ...form, company: value })} required />
            <TextField label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
            <TextField label="Sector" value={form.sector} onChange={(value) => setForm({ ...form, sector: value })} />
            <TextField label="Salary" value={form.salary} onChange={(value) => setForm({ ...form, salary: value })} />
            <TextField
              label="Match score"
              type="number"
              value={form.match === null ? "" : String(form.match)}
              onChange={(value) => setForm({ ...form, match: value === "" ? null : Number(value) })}
            />
            <TextField label="Posted label" value={form.posted} onChange={(value) => setForm({ ...form, posted: value })} />
            <TextField
              label="Closing date"
              type="date"
              value={form.closingDate ?? ""}
              onChange={(value) => setForm({ ...form, closingDate: value || null })}
            />
            <SelectField
              label="Employment type"
              value={form.employmentType}
              onChange={(value) => setForm({ ...form, employmentType: value })}
              options={EMPLOYMENT_TYPES}
            />
            <SelectField
              label="Work mode"
              value={form.workMode}
              onChange={(value) => setForm({ ...form, workMode: value })}
              options={WORK_MODES}
            />
            <SelectField
              label="Status"
              value={form.status}
              onChange={(value) => setForm({ ...form, status: value })}
              options={STATUS_OPTIONS}
            />
            <TextField
              label="Application URL"
              value={form.applicationUrl}
              onChange={(value) => setForm({ ...form, applicationUrl: value })}
              placeholder="https://"
            />
            <TextField
              label="Tags (comma separated)"
              value={form.tagsText}
              onChange={(value) => setForm({ ...form, tagsText: value })}
              placeholder="python, sql, entry-level"
              className="sm:col-span-2"
            />
            <TextAreaField
              label="Description"
              value={form.description}
              onChange={(value) => setForm({ ...form, description: value })}
              rows={5}
              className="sm:col-span-2"
            />
            <TextAreaField
              label="Requirements"
              value={form.requirements}
              onChange={(value) => setForm({ ...form, requirements: value })}
              rows={4}
              className="sm:col-span-2"
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <ActionButton
              variant="primary"
              onClick={() => void handleSubmit()}
              disabled={saving || !canWrite}
              testId="button-admin-save-job"
            >
              <Save size={13} /> {saving ? "Saving…" : editingId ? "Save changes" : "Create job"}
            </ActionButton>
            {editingId && canWrite ? (
              <ActionButton variant="danger" onClick={() => setConfirm({ kind: "one", id: editingId })}>
                <Trash2 size={13} /> Delete job
              </ActionButton>
            ) : null}
            <ActionButton onClick={() => setEditorOpen(false)}>Cancel</ActionButton>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.kind === "bulk" ? `Delete ${selected.length} job(s)?` : "Delete this job listing?"}
        description="Candidates will no longer see this listing. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirm?.kind === "bulk") void handleBulk("delete");
          else if (confirm?.id) void handleDelete(confirm.id);
          setConfirm(null);
        }}
      />
    </>
  );
}
