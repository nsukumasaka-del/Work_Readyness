import { useMemo, useState } from "react";
import { FileStack, Trash2 } from "lucide-react";

import { toast } from "@/hooks/use-toast";

import {
  type AdminTemplate,
  PERMISSIONS,
  type SectionProps,
  adminFetch,
  errorMessage,
  formatDateTime,
  formatNumber,
  useAdminData,
} from "../api";
import {
  ActionButton,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  SearchInput,
  SectionCard,
  StatusBadge,
} from "../ui";

type TemplatesResponse = {
  success?: boolean;
  templates?: AdminTemplate[];
};

type Props = Pick<SectionProps, "token" | "can" | "refreshTick" | "onMutated">;

function templateName(template: AdminTemplate) {
  return template.name?.trim() || `Template ${String(template.id)}`;
}

function templateStatus(template: AdminTemplate) {
  if (template.status) return template.status;
  if (template.active === false || template.active === 0 || template.active === "0") return "inactive";
  return "active";
}

export default function TemplatesSection({ token, can, refreshTick, onMutated }: Props) {
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);
  const canWrite = can(PERMISSIONS.templates);

  const { data, loading, error, reload } = useAdminData<TemplatesResponse>(
    () => adminFetch<TemplatesResponse>("/admin/templates", token),
    [token],
    refreshTick,
  );

  const templates = data?.templates ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter((template) =>
      [template.id, template.name, template.description, template.category]
        .some((value) => String(value ?? "").toLowerCase().includes(term)),
    );
  }, [search, templates]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminFetch(`/admin/templates/${encodeURIComponent(String(deleteTarget.id))}`, token, { method: "DELETE" });
      toast({ title: "Template deleted", description: templateName(deleteTarget) });
      setDeleteTarget(null);
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Delete failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <SectionCard
        title="Template catalog"
        description={`${formatNumber(templates.length)} template(s) stored in Cloudflare D1`}
        actions={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search templates…"
            testId="input-admin-template-search"
          />
        }
      >
        {error && !data ? (
          <ErrorState message={error} onRetry={() => void reload(false)} />
        ) : loading && !data ? (
          <LoadingState label="Loading templates…" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? "No templates match your search" : "No templates in the catalog"}
            description={search ? "Try a different name, category or template ID." : "Templates added to D1 will appear here."}
            icon={<FileStack size={18} />}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Template</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((template) => (
                  <tr key={String(template.id)} className="align-top hover:bg-slate-50/70">
                    <td className="max-w-sm px-3 py-3">
                      <p className="font-semibold text-slate-800">{templateName(template)}</p>
                      <p className="mt-0.5 break-all text-xs text-slate-400">{String(template.id)}</p>
                      {template.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{template.description}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{template.category || "—"}</td>
                    <td className="px-3 py-3"><StatusBadge status={templateStatus(template)} /></td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                      {formatDateTime(template.created_at || template.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {canWrite ? (
                        <ActionButton
                          variant="danger"
                          onClick={() => setDeleteTarget(template)}
                          testId={`button-admin-delete-template-${String(template.id)}`}
                        >
                          <Trash2 size={13} /> Delete
                        </ActionButton>
                      ) : (
                        <span className="text-xs text-slate-400">View only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}
        title="Delete this template?"
        description={deleteTarget ? `${templateName(deleteTarget)} will be permanently removed from the D1 catalog.` : undefined}
        confirmLabel={deleting ? "Deleting…" : "Delete template"}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
