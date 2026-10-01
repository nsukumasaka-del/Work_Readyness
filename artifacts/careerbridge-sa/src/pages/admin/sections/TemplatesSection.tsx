import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { Database, FileStack, Pencil, Plus, Trash2, Upload } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

import {
  type AdminTemplate,
  PERMISSIONS,
  type SectionProps,
  adminFetch,
  buildQuery,
  errorMessage,
  formatDateTime,
  formatNumber,
  useAdminData,
  useDebouncedValue,
} from "../api";
import {
  ActionButton,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterSelect,
  LoadingState,
  SearchInput,
  SectionCard,
  SelectField,
  StatusBadge,
  TextAreaField,
  TextField,
} from "../ui";

type TemplatesResponse = { success?: boolean; templates?: AdminTemplate[]; categories?: string[] };
type Props = Pick<SectionProps, "token" | "can" | "refreshTick" | "onMutated">;
type TemplateForm = { id: string; name: string; description: string; category: string; previewUrl: string; active: string };

const EMPTY_FORM: TemplateForm = { id: "", name: "", description: "", category: "CV", previewUrl: "", active: "1" };

function templateName(template: AdminTemplate) {
  return template.name?.trim() || `Template ${String(template.id)}`;
}

function templateStatus(template: AdminTemplate) {
  if (template.status) return template.status;
  if (template.active === false || template.active === 0 || template.active === "0") return "inactive";
  return "active";
}

function toForm(template: AdminTemplate): TemplateForm {
  return {
    id: String(template.id),
    name: template.name || "",
    description: template.description || "",
    category: template.category || "CV",
    previewUrl: template.preview_url || template.previewUrl || "",
    active: templateStatus(template) === "inactive" ? "0" : "1",
  };
}

export default function TemplatesSection({ token, can, refreshTick, onMutated }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminTemplate | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const debouncedSearch = useDebouncedValue(search);
  const canWrite = can(PERMISSIONS.templates);

  const { data, loading, error, reload } = useAdminData<TemplatesResponse>(
    () => adminFetch<TemplatesResponse>(`/admin/templates${buildQuery({ q: debouncedSearch, category })}`, token),
    [token, debouncedSearch, category],
    refreshTick,
  );

  const templates = data?.templates ?? [];
  const categoryOptions = useMemo(() => [
    { value: "", label: "All categories" },
    ...(data?.categories ?? []).map((value) => ({ value, label: value })),
  ], [data?.categories]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  }

  function openEdit(template: AdminTemplate) {
    setEditingId(String(template.id));
    setForm(toForm(template));
    setEditorOpen(true);
  }

  async function handleSave() {
    const id = form.id.trim();
    const name = form.name.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(id) || !name) {
      toast({ title: "Missing template details", description: "Use a name and a URL-safe id such as modern_cv.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({ id, name, description: form.description.trim(), category: form.category.trim() || "CV", previewUrl: form.previewUrl.trim() || null, active: form.active === "1" });
      if (editingId) {
        await adminFetch(`/admin/templates/${encodeURIComponent(editingId)}`, token, { method: "PATCH", body });
        toast({ title: "Template updated", description: name });
      } else {
        await adminFetch("/admin/templates", token, { method: "POST", body });
        toast({ title: "Template created", description: name });
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

  async function handleSeed() {
    setSeeding(true);
    try {
      const result = await adminFetch<{ seeded?: number }>("/admin/templates/seed", token, { method: "POST", body: "{}" });
      toast({ title: "Catalog seeded", description: `${result.seeded ?? 0} template(s) added; existing entries were kept.` });
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Seed failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const templates = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { templates?: unknown }).templates)
          ? (parsed as { templates: unknown[] }).templates
          : [parsed];
      if (!templates.length || templates.length > 100) throw new Error("Upload between 1 and 100 templates.");
      await adminFetch("/admin/templates", token, { method: "POST", body: JSON.stringify({ templates }) });
      toast({ title: "Templates uploaded", description: `${templates.length} template(s) imported from ${file.name}.` });
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Upload failed", description: errorMessage(err, "Choose a valid template JSON file."), variant: "destructive" });
    }
  }

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
        description={`${formatNumber(templates.length)} matching template(s) stored in Cloudflare D1`}
        actions={<>
          <SearchInput value={search} onChange={setSearch} placeholder="Search templates…" testId="input-admin-template-search" />
          <FilterSelect value={category} onChange={setCategory} options={categoryOptions} ariaLabel="Filter templates by category" testId="select-admin-template-category" />
          {canWrite ? <>
            <input ref={uploadRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void handleUpload(event)} />
            <ActionButton onClick={() => uploadRef.current?.click()} testId="button-admin-upload-templates"><Upload size={13} /> Upload JSON</ActionButton>
            <ActionButton onClick={() => void handleSeed()} disabled={seeding} testId="button-admin-seed-templates"><Database size={13} /> {seeding ? "Seeding…" : "Seed catalog"}</ActionButton>
            <ActionButton variant="primary" onClick={openCreate} testId="button-admin-new-template"><Plus size={13} /> New template</ActionButton>
          </> : null}
        </>}
      >
        {error && !data ? <ErrorState message={error} onRetry={() => void reload(false)} />
          : loading && !data ? <LoadingState label="Loading templates…" />
          : templates.length === 0 ? (
            <EmptyState title={search || category ? "No templates match these filters" : "No templates in the catalog"} description={search || category ? "Try another search or category." : "Seed the built-in catalog, upload JSON, or create a template manually."} icon={<FileStack size={18} />} action={canWrite && !search && !category ? <ActionButton variant="primary" onClick={() => void handleSeed()} disabled={seeding}><Database size={13} /> Seed catalog</ActionButton> : undefined} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Template</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Created</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {templates.map((template) => <tr key={String(template.id)} className="align-top hover:bg-slate-50/70">
                    <td className="max-w-sm px-3 py-3"><p className="font-semibold text-slate-800">{templateName(template)}</p><p className="mt-0.5 break-all text-xs text-slate-400">{String(template.id)}</p>{template.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{template.description}</p> : null}</td>
                    <td className="px-3 py-3 text-slate-600">{template.category || "—"}</td><td className="px-3 py-3"><StatusBadge status={templateStatus(template)} /></td><td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatDateTime(template.created_at || template.createdAt)}</td>
                    <td className="px-3 py-3"><div className="flex justify-end gap-2">{canWrite ? <><ActionButton onClick={() => openEdit(template)} testId={`button-admin-edit-template-${String(template.id)}`}><Pencil size={13} /> Edit</ActionButton><ActionButton variant="danger" onClick={() => setDeleteTarget(template)} testId={`button-admin-delete-template-${String(template.id)}`}><Trash2 size={13} /> Delete</ActionButton></> : <span className="text-xs text-slate-400">View only</span>}</div></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
      </SectionCard>

      <Dialog open={editorOpen} onOpenChange={(open) => { if (!saving) setEditorOpen(open); }}>
        <DialogContent className="rounded-2xl sm:max-w-xl">
          <DialogHeader><DialogTitle>{editingId ? "Edit template" : "Create template"}</DialogTitle><DialogDescription>Store the catalog metadata used to manage this CV or document template.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Template ID" value={form.id} onChange={(id) => setForm((current) => ({ ...current, id }))} placeholder="modern_cv" required disabled={Boolean(editingId)} testId="input-admin-template-id" />
            <TextField label="Name" value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} placeholder="Modern CV" required testId="input-admin-template-name" />
            <TextField label="Category" value={form.category} onChange={(category) => setForm((current) => ({ ...current, category }))} placeholder="Modern" testId="input-admin-template-category" />
            <SelectField label="Status" value={form.active} onChange={(active) => setForm((current) => ({ ...current, active }))} options={[{ value: "1", label: "Active" }, { value: "0", label: "Inactive" }]} testId="select-admin-template-active" />
            <TextField label="Preview URL" value={form.previewUrl} onChange={(previewUrl) => setForm((current) => ({ ...current, previewUrl }))} placeholder="https://…" className="sm:col-span-2" testId="input-admin-template-preview" />
            <TextAreaField label="Description" value={form.description} onChange={(description) => setForm((current) => ({ ...current, description }))} rows={4} className="sm:col-span-2" testId="input-admin-template-description" />
          </div>
          <DialogFooter><ActionButton onClick={() => setEditorOpen(false)} disabled={saving}>Cancel</ActionButton><ActionButton variant="primary" onClick={() => void handleSave()} disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Create template"}</ActionButton></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }} title="Delete this template?" description={deleteTarget ? `${templateName(deleteTarget)} will be permanently removed from the D1 catalog.` : undefined} confirmLabel={deleting ? "Deleting…" : "Delete template"} onConfirm={() => void handleDelete()} />
    </>
  );
}
