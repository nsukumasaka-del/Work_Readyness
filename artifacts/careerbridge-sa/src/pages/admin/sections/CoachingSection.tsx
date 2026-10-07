import { useEffect, useState } from "react";
import { ClipboardList, Save, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { type AdminCoaching, COACHING_PRIORITIES, COACHING_STATUSES, PERMISSIONS, type SectionProps, adminFetch, buildQuery, errorMessage, formatDateTime, formatNumber, humanizeStatus, useAdminData } from "../api";
import { ActionButton, ConfirmDialog, EmptyState, ErrorState, FilterSelect, LoadingState, Pagination, SectionCard, SelectField, StatusBadge } from "../ui";

type CoachingResponse = { applications: AdminCoaching[]; total: number; page: number; limit: number };
type Props = Pick<SectionProps, "token" | "can" | "refreshTick" | "focusId" | "onFocusHandled" | "onMutated">;
const LIMIT = 25;
const STATUS_FILTERS = [{ value: "", label: "All statuses" }, ...COACHING_STATUSES.map((value) => ({ value, label: humanizeStatus(value) }))];

export default function CoachingSection({ token, can, refreshTick, focusId, onFocusHandled, onMutated }: Props) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const canWrite = can(PERMISSIONS.coaching);
  const { data, loading, error, reload } = useAdminData<CoachingResponse>(
    () => adminFetch<CoachingResponse>(`/admin/coaching${buildQuery({ status, page, limit: LIMIT })}`, token),
    [token, status, page], refreshTick,
  );
  useEffect(() => { if (focusId !== null) { setOpenId(focusId); onFocusHandled(); } }, [focusId, onFocusHandled]);
  const applications = data?.applications ?? [];
  const selected = applications.find((item) => item.id === openId) ?? null;
  useEffect(() => { if (selected) { setEditStatus(selected.status || "pending"); setEditPriority(selected.priority || "normal"); } }, [selected]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await adminFetch(`/admin/coaching/${selected.id}`, token, { method: "PATCH", body: JSON.stringify({ status: editStatus, priority: editPriority }) });
      toast({ title: "Application updated", description: selected.candidateRef }); await reload(true); onMutated();
    } catch (err) { toast({ title: "Update failed", description: errorMessage(err), variant: "destructive" }); }
    finally { setSaving(false); }
  }
  async function remove(id: number) {
    try {
      await adminFetch(`/admin/coaching/${id}`, token, { method: "DELETE" }); setOpenId(null); setConfirmId(null); toast({ title: "Application deleted" }); await reload(true); onMutated();
    } catch (err) { toast({ title: "Delete failed", description: errorMessage(err), variant: "destructive" }); }
  }

  return <>
    <SectionCard title="Anonymous coaching pipeline" description={`${formatNumber(data?.total ?? applications.length)} application(s). Candidate contact details and free-text responses are protected.`} actions={<FilterSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={STATUS_FILTERS} ariaLabel="Filter coaching by status" />}>
      {error && !data ? <ErrorState message={error} onRetry={() => void reload(false)} /> : loading && !data ? <LoadingState label="Loading coaching pipeline…" /> : applications.length === 0 ? <EmptyState title="No applications found" icon={<ClipboardList size={18} />} /> : <>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Anonymous reference</th><th className="px-3 py-2">Payment plan</th><th className="px-3 py-2">Priority</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Received</th></tr></thead><tbody>{applications.map((item) => <tr key={item.id} onClick={() => setOpenId(item.id)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"><td className="px-3 py-3 font-mono text-xs font-semibold">{item.candidateRef || `candidate_${item.id}`}</td><td className="px-3 py-3">{item.paymentPlan || "—"}</td><td className="px-3 py-3"><StatusBadge status={item.priority || "normal"} /></td><td className="px-3 py-3"><StatusBadge status={item.status} /></td><td className="px-3 py-3 text-slate-500">{formatDateTime(item.createdAt)}</td></tr>)}</tbody></table></div>
        <Pagination page={data?.page ?? page} limit={data?.limit ?? LIMIT} total={data?.total ?? applications.length} onPageChange={setPage} />
      </>}
    </SectionCard>
    <Sheet open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}><SheetContent className="w-full sm:max-w-md"><SheetHeader><SheetTitle>{selected?.candidateRef || "Anonymous application"}</SheetTitle><SheetDescription>Candidate identity, contact details, experience and goals are not exposed.</SheetDescription></SheetHeader>{selected && canWrite ? <div className="mt-6 space-y-4"><SelectField label="Status" value={editStatus} onChange={setEditStatus} options={COACHING_STATUSES.map((value) => ({ value, label: humanizeStatus(value) }))} /><SelectField label="Priority" value={editPriority} onChange={setEditPriority} options={COACHING_PRIORITIES.map((value) => ({ value, label: humanizeStatus(value) }))} /><div className="flex gap-2"><ActionButton variant="primary" disabled={saving} onClick={() => void save()}><Save size={13} /> {saving ? "Saving…" : "Save"}</ActionButton><ActionButton variant="danger" onClick={() => setConfirmId(selected.id)}><Trash2 size={13} /> Delete</ActionButton></div></div> : null}</SheetContent></Sheet>
    <ConfirmDialog open={confirmId !== null} onOpenChange={(open) => !open && setConfirmId(null)} title="Delete this application?" description="This action cannot be undone." confirmLabel="Delete" onConfirm={() => { if (confirmId) void remove(confirmId); }} />
  </>;
}
