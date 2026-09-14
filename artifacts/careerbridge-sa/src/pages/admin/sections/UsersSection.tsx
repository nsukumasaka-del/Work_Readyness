import { useEffect, useMemo, useState } from "react";
import { Download, Save, Trash2, UserCheck, UserX, Users } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";

import {
  type AdminUser,
  type AdminUserDetail,
  PERMISSIONS,
  type SectionProps,
  adminFetch,
  buildQuery,
  errorMessage,
  exportEntity,
  formatDateTime,
  formatNumber,
  useAdminData,
  useDebouncedValue,
} from "../api";
import {
  ActionButton,
  BulkBar,
  ConfirmDialog,
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
  TextField,
} from "../ui";

type UsersResponse = { users: AdminUser[]; total: number; page: number; limit: number };

type Props = Pick<SectionProps, "token" | "can" | "refreshTick" | "focusId" | "onFocusHandled" | "onMutated">;

const LIMIT = 25;

const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

type EditState = {
  name: string;
  phone: string;
  location: string;
  targetRole: string;
  status: string;
};

export default function UsersSection({ token, can, refreshTick, focusId, onFocusHandled, onMutated }: Props) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("createdAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<number[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "delete-one" | "bulk-delete"; id?: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  const debouncedSearch = useDebouncedValue(search);
  const canWrite = can(PERMISSIONS.users);

  const { data, loading, error, reload } = useAdminData<UsersResponse>(
    () =>
      adminFetch<UsersResponse>(
        `/admin/users${buildQuery({ q: debouncedSearch, status, page, limit: LIMIT })}`,
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
    adminFetch<AdminUserDetail | { user: AdminUserDetail }>(`/admin/users/${openId}`, token)
      .then((payload) => {
        if (cancelled) return;
        const user = (payload as { user?: AdminUserDetail }).user ?? (payload as AdminUserDetail);
        setDetail(user);
        setEdit({
          name: user.name ?? "",
          phone: user.phone ?? "",
          location: user.location ?? "",
          targetRole: user.targetRole ?? "",
          status: (user.status as string) || "active",
        });
      })
      .catch((err) => {
        if (!cancelled) setDetailError(errorMessage(err, "Could not load this user"));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openId, token]);

  const users = data?.users ?? [];
  const total = data?.total ?? users.length;

  const sorted = useMemo(() => {
    const rows = [...users];
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
  }, [users, sortKey, direction]);

  function handleSort(key: string) {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection("asc");
  }

  function toggleSelect(id: number, checked: boolean) {
    setSelected((current) => (checked ? [...new Set([...current, id])] : current.filter((value) => value !== id)));
  }

  function toggleSelectAll(checked: boolean) {
    setSelected(checked ? sorted.map((user) => user.id) : []);
  }

  async function handleSave() {
    if (!openId || !edit) return;
    setSaving(true);
    try {
      await adminFetch(`/admin/users/${openId}`, token, {
        method: "PATCH",
        body: JSON.stringify(edit),
      });
      toast({ title: "User updated", description: `${edit.name || "Profile"} saved successfully.` });
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Update failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id: number, nextStatus: string) {
    try {
      await adminFetch(`/admin/users/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      toast({ title: nextStatus === "active" ? "User activated" : "User deactivated" });
      setEdit((current) => (current ? { ...current, status: nextStatus } : current));
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Could not change status", description: errorMessage(err), variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    try {
      await adminFetch(`/admin/users/${id}`, token, { method: "DELETE" });
      toast({ title: "User deleted" });
      setOpenId(null);
      setSelected((current) => current.filter((value) => value !== id));
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Delete failed", description: errorMessage(err), variant: "destructive" });
    }
  }

  async function handleBulk(action: "activate" | "deactivate" | "delete") {
    if (selected.length === 0) return;
    try {
      await adminFetch("/admin/users/bulk", token, {
        method: "POST",
        body: JSON.stringify({ ids: selected, action }),
      });
      toast({ title: `Bulk ${action} complete`, description: `${selected.length} user(s) updated.` });
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
      const count = await exportEntity(token, "users");
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
        title="User directory"
        description={`${formatNumber(total)} registered profile(s)`}
        actions={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search name, email, role…"
              testId="input-admin-user-search"
            />
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={STATUS_FILTERS}
              ariaLabel="Filter users by status"
              testId="select-admin-user-status"
            />
            <ActionButton onClick={() => void handleExport()} disabled={exporting} testId="button-admin-export-users">
              <Download size={13} /> {exporting ? "Exporting…" : "Export CSV"}
            </ActionButton>
          </>
        }
      >
        {error && !data ? (
          <ErrorState message={error} onRetry={() => void reload(false)} />
        ) : loading && !data ? (
          <LoadingState label="Loading users…" />
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No users found"
            description={
              debouncedSearch || status
                ? "Try a different search term or clear the status filter."
                : "New sign-ups from the public site appear here."
            }
            icon={<Users size={18} />}
          />
        ) : (
          <>
            {canWrite ? (
              <BulkBar count={selected.length}>
                <ActionButton onClick={() => void handleBulk("activate")}>
                  <UserCheck size={13} /> Activate
                </ActionButton>
                <ActionButton onClick={() => void handleBulk("deactivate")}>
                  <UserX size={13} /> Deactivate
                </ActionButton>
                <ActionButton variant="danger" onClick={() => setConfirm({ kind: "bulk-delete" })}>
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
                        <RowCheckbox checked={allSelected} onChange={toggleSelectAll} label="Select all users" />
                      </th>
                    ) : null}
                    <SortHeader label="Name" columnKey="name" sortKey={sortKey} direction={direction} onSort={handleSort} />
                    <SortHeader label="Email" columnKey="email" sortKey={sortKey} direction={direction} onSort={handleSort} />
                    <SortHeader
                      label="Target role"
                      columnKey="targetRole"
                      sortKey={sortKey}
                      direction={direction}
                      onSort={handleSort}
                    />
                    <SortHeader
                      label="CV reviews"
                      columnKey="diagnosticCount"
                      sortKey={sortKey}
                      direction={direction}
                      onSort={handleSort}
                    />
                    <th className="px-2 py-2 font-semibold">Plan</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                    <SortHeader
                      label="Last login"
                      columnKey="lastLoginAt"
                      sortKey={sortKey}
                      direction={direction}
                      onSort={handleSort}
                    />
                    <SortHeader
                      label="Joined"
                      columnKey="createdAt"
                      sortKey={sortKey}
                      direction={direction}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => setOpenId(user.id)}
                      className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
                      data-testid={`row-admin-user-${user.id}`}
                    >
                      {canWrite ? (
                        <td className="px-2 py-3">
                          <RowCheckbox
                            checked={selected.includes(user.id)}
                            onChange={(checked) => toggleSelect(user.id, checked)}
                            label={`Select ${user.name}`}
                          />
                        </td>
                      ) : null}
                      <td className="px-2 py-3 font-medium text-slate-800">{user.name}</td>
                      <td className="px-2 py-3 text-slate-600">{user.email}</td>
                      <td className="px-2 py-3 text-slate-600">{user.targetRole || "—"}</td>
                      <td className="px-2 py-3 text-slate-600">{user.diagnosticCount ?? 0}</td>
                      <td className="px-2 py-3 text-slate-600">
                        {user.programmeStatus === "active"
                          ? `Programme (${user.programmeDaysRemaining ?? 0}d)`
                          : (user.plan || "free").replace("_", " ")}
                      </td>
                      <td className="px-2 py-3">
                        <StatusBadge status={user.status || "active"} />
                      </td>
                      <td className="px-2 py-3 text-slate-500">{formatDateTime(user.lastLoginAt)}</td>
                      <td className="px-2 py-3 text-slate-500">{formatDateTime(user.createdAt)}</td>
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
            <SheetTitle>{detail?.name || "User detail"}</SheetTitle>
            <SheetDescription>{detail?.email || "Loading profile…"}</SheetDescription>
          </SheetHeader>

          {detailLoading ? (
            <LoadingState label="Loading profile…" />
          ) : detailError ? (
            <div className="mt-4">
              <ErrorState message={detailError} />
            </div>
          ) : detail && edit ? (
            <div className="mt-5 space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <DetailRow label="User ID" value={detail.id} />
                <DetailRow label="Email" value={detail.email} />
                <DetailRow label="Status" value={<StatusBadge status={detail.status || "active"} />} />
                <DetailRow label="CV reviews" value={detail.diagnosticCount ?? 0} />
                <DetailRow label="Coaching" value={detail.coachingStatus ? <StatusBadge status={detail.coachingStatus} /> : "—"} />
                <DetailRow
                  label="Access"
                  value={
                    detail.programmeStatus === "active"
                      ? `Career Accelerator · ${detail.programmeDaysRemaining ?? 0} days left`
                      : String((detail as any).planName || detail.plan || "Free")
                  }
                />
                <DetailRow
                  label="Programme"
                  value={
                    detail.programmeStatus
                      ? `${detail.programmeStatus}${detail.programmeEndDate ? ` · ends ${formatDateTime(detail.programmeEndDate)}` : ""}`
                      : "—"
                  }
                />
                <DetailRow label="Last login" value={formatDateTime(detail.lastLoginAt)} />
                <DetailRow label="Joined" value={formatDateTime(detail.createdAt)} />
              </div>

              {canWrite ? (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Edit profile</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField label="Full name" value={edit.name} onChange={(value) => setEdit({ ...edit, name: value })} />
                    <TextField label="Phone" value={edit.phone} onChange={(value) => setEdit({ ...edit, phone: value })} />
                    <TextField
                      label="Location"
                      value={edit.location}
                      onChange={(value) => setEdit({ ...edit, location: value })}
                    />
                    <TextField
                      label="Target role"
                      value={edit.targetRole}
                      onChange={(value) => setEdit({ ...edit, targetRole: value })}
                    />
                    <SelectField
                      label="Status"
                      value={edit.status}
                      onChange={(value) => setEdit({ ...edit, status: value })}
                      options={STATUS_OPTIONS}
                      className="sm:col-span-2"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <ActionButton variant="primary" onClick={() => void handleSave()} disabled={saving} testId="button-admin-save-user">
                      <Save size={13} /> {saving ? "Saving…" : "Save changes"}
                    </ActionButton>
                    {(detail.status || "active") === "active" ? (
                      <ActionButton onClick={() => void handleStatusChange(detail.id, "inactive")}>
                        <UserX size={13} /> Deactivate
                      </ActionButton>
                    ) : (
                      <ActionButton onClick={() => void handleStatusChange(detail.id, "active")}>
                        <UserCheck size={13} /> Activate
                      </ActionButton>
                    )}
                    <ActionButton
                      variant="danger"
                      onClick={() => setConfirm({ kind: "delete-one", id: detail.id })}
                      testId="button-admin-delete-user"
                    >
                      <Trash2 size={13} /> Delete user
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">You do not have permission to edit users.</p>
              )}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.kind === "bulk-delete" ? `Delete ${selected.length} user(s)?` : "Delete this user?"}
        description="This permanently removes the profile and cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirm?.kind === "bulk-delete") void handleBulk("delete");
          else if (confirm?.id) void handleDelete(confirm.id);
          setConfirm(null);
        }}
      />
    </>
  );
}
