import { useEffect, useState } from "react";
import { Trash2, UserCheck, UserX, Users } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import { type AdminUser, PERMISSIONS, type SectionProps, adminFetch, buildQuery, errorMessage, formatDateTime, formatNumber, useAdminData } from "../api";
import { ActionButton, ConfirmDialog, EmptyState, ErrorState, FilterSelect, LoadingState, Pagination, SectionCard, StatusBadge } from "../ui";

type UsersResponse = { users: AdminUser[]; total: number; page: number; limit: number };
type Props = Pick<SectionProps, "token" | "can" | "refreshTick" | "focusId" | "onFocusHandled" | "onMutated">;
const LIMIT = 25;
const STATUS_FILTERS = [{ value: "", label: "All statuses" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }];

export default function UsersSection({ token, can, refreshTick, focusId, onFocusHandled, onMutated }: Props) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const canWrite = can(PERMISSIONS.users);
  const { data, loading, error, reload } = useAdminData<UsersResponse>(
    () => adminFetch<UsersResponse>(`/admin/users${buildQuery({ status, page, limit: LIMIT })}`, token),
    [token, status, page], refreshTick,
  );
  useEffect(() => { if (focusId !== null) { setOpenId(focusId); onFocusHandled(); } }, [focusId, onFocusHandled]);
  const users = data?.users ?? [];
  const selected = users.find((user) => user.id === openId) ?? null;

  async function changeStatus(user: AdminUser, nextStatus: string) {
    try {
      await adminFetch(`/admin/users/${user.id}`, token, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
      toast({ title: nextStatus === "active" ? "User activated" : "User deactivated", description: user.candidateRef });
      await reload(true); onMutated();
    } catch (err) { toast({ title: "Could not change status", description: errorMessage(err), variant: "destructive" }); }
  }
  async function removeUser(id: number) {
    try {
      await adminFetch(`/admin/users/${id}`, token, { method: "DELETE" });
      setOpenId(null); setConfirmId(null); toast({ title: "User deleted" }); await reload(true); onMutated();
    } catch (err) { toast({ title: "Delete failed", description: errorMessage(err), variant: "destructive" }); }
  }

  return <>
    <SectionCard title="Anonymous user operations" description={`${formatNumber(data?.total ?? users.length)} registered profile(s). Candidate identity and CV data are not exposed.`} actions={<FilterSelect value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={STATUS_FILTERS} ariaLabel="Filter users by status" />}>
      {error && !data ? <ErrorState message={error} onRetry={() => void reload(false)} /> : loading && !data ? <LoadingState label="Loading users…" /> : users.length === 0 ? <EmptyState title="No users found" icon={<Users size={18} />} /> : <>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Anonymous reference</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Last login</th><th className="px-3 py-2">Joined</th></tr></thead><tbody>{users.map((user) => <tr key={user.id} onClick={() => setOpenId(user.id)} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"><td className="px-3 py-3 font-mono text-xs font-semibold text-slate-800">{user.candidateRef || `candidate_${user.id}`}</td><td className="px-3 py-3">{user.plan || "free"}</td><td className="px-3 py-3"><StatusBadge status={user.status || "active"} /></td><td className="px-3 py-3 text-slate-500">{formatDateTime(user.lastLoginAt)}</td><td className="px-3 py-3 text-slate-500">{formatDateTime(user.createdAt)}</td></tr>)}</tbody></table></div>
        <Pagination page={data?.page ?? page} limit={data?.limit ?? LIMIT} total={data?.total ?? users.length} onPageChange={setPage} />
      </>}
    </SectionCard>
    <Sheet open={openId !== null} onOpenChange={(open) => !open && setOpenId(null)}><SheetContent className="w-full sm:max-w-md"><SheetHeader><SheetTitle>{selected?.candidateRef || "Anonymous user"}</SheetTitle><SheetDescription>No name, email, phone, location, CV filename or CV metadata is available here.</SheetDescription></SheetHeader>{selected && canWrite ? <div className="mt-6 flex flex-wrap gap-2">{(selected.status || "active") === "active" ? <ActionButton onClick={() => void changeStatus(selected, "inactive")}><UserX size={13} /> Deactivate</ActionButton> : <ActionButton onClick={() => void changeStatus(selected, "active")}><UserCheck size={13} /> Activate</ActionButton>}<ActionButton variant="danger" onClick={() => setConfirmId(selected.id)}><Trash2 size={13} /> Delete user</ActionButton></div> : null}</SheetContent></Sheet>
    <ConfirmDialog open={confirmId !== null} onOpenChange={(open) => !open && setConfirmId(null)} title="Delete this anonymous user?" description="This permanently removes the account." confirmLabel="Delete" onConfirm={() => { if (confirmId) void removeUser(confirmId); }} />
  </>;
}
