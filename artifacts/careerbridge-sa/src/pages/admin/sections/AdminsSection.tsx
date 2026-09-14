import { type FormEvent, useState } from "react";
import { Save, ShieldCheck, Trash2, UserPlus } from "lucide-react";

import { toast } from "@/hooks/use-toast";

import {
  ADMIN_ROLES,
  type AdminAccount,
  PERMISSIONS,
  type SectionProps,
  adminFetch,
  errorMessage,
  formatDateTime,
  humanizeStatus,
  useAdminData,
} from "../api";
import {
  ActionButton,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionCard,
  SelectField,
  StatusBadge,
  TextField,
} from "../ui";

type AdminsResponse = { admins: AdminAccount[]; maxAdmins?: number };

type Props = Pick<SectionProps, "token" | "me" | "can" | "refreshTick" | "onMutated">;

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

export default function AdminsSection({ token, me, can, refreshTick, onMutated }: Props) {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "admin" });
  const [creating, setCreating] = useState(false);
  const [pendingEdits, setPendingEdits] = useState<Record<number, { role: string; status: string }>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<AdminAccount | null>(null);

  const canManage = can(PERMISSIONS.admins);

  const { data, loading, error, reload } = useAdminData<AdminsResponse>(
    () => adminFetch<AdminsResponse>("/admin/admins", token),
    [token],
    refreshTick,
  );

  const admins = data?.admins ?? [];
  const maxAdmins = data?.maxAdmins ?? admins.length;
  const seatsFull = Boolean(data?.maxAdmins && admins.length >= data.maxAdmins);

  function editFor(admin: AdminAccount) {
    return (
      pendingEdits[admin.id] ?? {
        role: admin.role || "admin",
        status: admin.status || "active",
      }
    );
  }

  function setEdit(admin: AdminAccount, patch: Partial<{ role: string; status: string }>) {
    setPendingEdits((current) => ({
      ...current,
      [admin.id]: { ...editFor(admin), ...patch },
    }));
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    try {
      await adminFetch("/admin/admins", token, { method: "POST", body: JSON.stringify(form) });
      toast({ title: "Administrator added", description: form.email });
      setForm({ name: "", email: "", password: "", role: "admin" });
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Could not add administrator", description: errorMessage(err), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(admin: AdminAccount) {
    const next = editFor(admin);
    setSavingId(admin.id);
    try {
      await adminFetch(`/admin/admins/${admin.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ role: next.role, status: next.status }),
      });
      toast({ title: "Administrator updated", description: admin.email });
      setPendingEdits((current) => {
        const copy = { ...current };
        delete copy[admin.id];
        return copy;
      });
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Update failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  }

  async function handleRemove(admin: AdminAccount) {
    try {
      await adminFetch(`/admin/admins/${admin.id}`, token, { method: "DELETE" });
      toast({ title: "Administrator removed", description: admin.email });
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Could not remove administrator", description: errorMessage(err), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Administrators"
        description={
          data?.maxAdmins
            ? `${admins.length} of ${maxAdmins} admin seats used${me?.email ? ` · Signed in as ${me.email}` : ""}`
            : me?.email
              ? `Signed in as ${me.email}`
              : undefined
        }
      >
        {error && !data ? (
          <ErrorState message={error} onRetry={() => void reload(false)} />
        ) : loading && !data ? (
          <LoadingState label="Loading administrators…" />
        ) : admins.length === 0 ? (
          <EmptyState title="No administrators found" icon={<ShieldCheck size={18} />} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {admins.map((admin) => {
              const next = editFor(admin);
              const dirty =
                next.role !== (admin.role || "admin") || next.status !== (admin.status || "active");
              const protectedRow = admin.isPrimary;
              return (
                <li key={admin.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      {admin.name}
                      {admin.isPrimary ? (
                        <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700">
                          Primary
                        </span>
                      ) : null}
                      <StatusBadge status={admin.status || "active"} />
                    </p>
                    <p className="text-xs text-slate-500">{admin.email}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Role {humanizeStatus(admin.role || "admin")} · Last login {formatDateTime(admin.lastLoginAt)} ·
                      Added {formatDateTime(admin.createdAt)}
                    </p>
                  </div>

                  {canManage ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <SelectField
                        label="Role"
                        value={next.role}
                        onChange={(value) => setEdit(admin, { role: value })}
                        options={ADMIN_ROLES}
                        disabled={protectedRow}
                        className="w-40"
                        testId={`select-admin-role-${admin.id}`}
                      />
                      <SelectField
                        label="Status"
                        value={next.status}
                        onChange={(value) => setEdit(admin, { status: value })}
                        options={STATUS_OPTIONS}
                        disabled={protectedRow}
                        className="w-36"
                        testId={`select-admin-status-${admin.id}`}
                      />
                      <ActionButton
                        variant="primary"
                        onClick={() => void handleSave(admin)}
                        disabled={!dirty || savingId === admin.id || protectedRow}
                        testId={`button-save-admin-${admin.id}`}
                      >
                        <Save size={13} /> {savingId === admin.id ? "Saving…" : "Save"}
                      </ActionButton>
                      <ActionButton
                        variant="danger"
                        onClick={() => setConfirm(admin)}
                        disabled={protectedRow || admin.id === me?.id}
                        testId={`button-remove-admin-${admin.id}`}
                      >
                        <Trash2 size={13} /> Remove
                      </ActionButton>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {canManage ? (
        <SectionCard
          title="Add administrator"
          description={
            data?.maxAdmins
              ? `Invite another trusted admin. Maximum of ${maxAdmins} administrators total.`
              : "Invite another trusted admin."
          }
        >
          {seatsFull ? (
            <p className="text-sm text-amber-700">Admin seat limit reached. Remove an administrator to add another.</p>
          ) : (
            <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-2" data-testid="form-add-admin">
              <TextField
                label="Full name"
                value={form.name}
                onChange={(value) => setForm({ ...form, name: value })}
                required
                testId="input-admin-name"
              />
              <TextField
                label="Email"
                type="email"
                value={form.email}
                onChange={(value) => setForm({ ...form, email: value })}
                required
                testId="input-admin-email"
              />
              <TextField
                label="Temporary password"
                type="password"
                value={form.password}
                onChange={(value) => setForm({ ...form, password: value })}
                required
                min={6}
                testId="input-admin-password-new"
              />
              <SelectField
                label="Role"
                value={form.role}
                onChange={(value) => setForm({ ...form, role: value })}
                options={ADMIN_ROLES}
                testId="select-admin-new-role"
              />
              <div className="sm:col-span-2">
                <ActionButton
                  type="submit"
                  variant="primary"
                  disabled={creating}
                  testId="button-add-admin"
                  className="w-full py-2.5 text-sm"
                >
                  <UserPlus size={14} /> {creating ? "Adding…" : "Add administrator"}
                </ActionButton>
              </div>
            </form>
          )}
        </SectionCard>
      ) : (
        <SectionCard title="Add administrator">
          <p className="text-sm text-slate-500">You do not have permission to manage administrators.</p>
        </SectionCard>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Remove this administrator?"
        description={
          confirm
            ? `${confirm.name} (${confirm.email}) will immediately lose access to the admin console.`
            : undefined
        }
        confirmLabel="Remove"
        onConfirm={() => {
          if (confirm) void handleRemove(confirm);
          setConfirm(null);
        }}
      />
    </div>
  );
}
