import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Copy, Download, FileText, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { authFetch } from "@/lib/auth-session";
import { calculateCvCompletion } from "@/lib/cv-completion";

type CvDocumentCard = {
  id: number;
  title: string;
  structure: string;
  createdAt: string;
  updatedAt: string;
  completionScore: number;
  document: { fullName?: string; headline?: string; summary?: string; skills?: string[] };
};

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently updated" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function CvDashboardPage() {
  const [documents, setDocuments] = useState<CvDocumentCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await authFetch("/api/career/cv/documents");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load your saved CVs.");
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your saved CVs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDocuments(); }, [loadDocuments]);

  const runDocumentAction = async (id: number, action: "duplicate" | "rename" | "delete") => {
    const document = documents.find((item) => item.id === id);
    if (!document) return;
    let nextTitle: string | undefined;
    if (action === "rename") {
      nextTitle = window.prompt("Enter a new CV title", document.title)?.trim();
      if (!nextTitle || nextTitle === document.title) return;
    }
    if (action === "delete" && !window.confirm("Delete “" + document.title + "”? This cannot be undone.")) return;
    setBusyId(id);
    setError("");
    try {
      const response = await authFetch(
        action === "duplicate"
          ? "/api/career/cv/documents/" + id + "/duplicate"
          : "/api/career/cv/documents/" + id,
        {
          method: action === "duplicate" ? "POST" : action === "rename" ? "PATCH" : "DELETE",
          ...(action === "rename" ? { body: JSON.stringify({ title: nextTitle }) } : {}),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not update this CV.");
      if (action === "delete") setDocuments((current) => current.filter((item) => item.id !== id));
      else if (action === "rename") setDocuments((current) => current.map((item) => item.id === id ? { ...item, title: data.title, updatedAt: data.updatedAt, completionScore: data.completionScore } : item));
      else await loadDocuments();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update this CV.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">CV workspace</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">My Resumes</h1>
            <p className="mt-2 text-sm text-slate-600">Continue editing, update your documents, or create a new CV.</p>
          </div>
          <Link href="/cv-builder?intake=1" className="inline-flex items-center gap-2 rounded-xl bg-[#00A884] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#008f70]">
            <Plus size={16} /> Create New CV
          </Link>
        </div>
        {error ? <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-20 text-sm text-slate-500">
            <LoaderCircle size={18} className="animate-spin" /> Loading your saved CVs…
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <FileText size={32} className="mx-auto text-slate-400" />
            <h2 className="mt-3 text-lg font-semibold">No saved CVs yet</h2>
            <p className="mt-1 text-sm text-slate-500">Create a CV and your work will be saved to your account as you edit.</p>
            <Link href="/cv-builder?intake=1" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#00A884] px-4 py-2 text-sm font-semibold text-white">
              <Plus size={15} /> Start a CV
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {documents.map((item) => {
              const score = Number.isFinite(item.completionScore) ? item.completionScore : calculateCvCompletion(item.document);
              const editorUrl = "/cv-builder?documentId=" + encodeURIComponent(String(item.id));
              return (
                <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="m-4 flex h-52 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-inner">
                    <div className="border-b border-emerald-200 pb-2">
                      <div className="truncate text-base font-bold text-emerald-700">{item.document.fullName || "Untitled CV"}</div>
                      <div className="truncate text-xs text-slate-600">{item.document.headline || item.structure}</div>
                    </div>
                    {item.document.summary ? <p className="mt-3 line-clamp-3 text-[10px] leading-relaxed text-slate-600">{item.document.summary}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-1">
                      {(item.document.skills || []).slice(0, 5).map((skill) => <span key={skill} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] text-emerald-800">{skill}</span>)}
                    </div>
                  </div>
                  <div className="px-5 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold">{item.title}</h2>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><CalendarDays size={12} /> Updated {dateLabel(item.updatedAt || item.createdAt)}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{score}%</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#00A884]" style={{ width: Math.max(0, Math.min(100, score)) + "%" }} />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Link href={editorUrl} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">Edit</Link>
                      <Link href={editorUrl + "&print=1"} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50"><Download size={13} /> Download PDF</Link>
                      <button type="button" disabled={busyId === item.id} onClick={() => void runDocumentAction(item.id, "duplicate")} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"><Copy size={13} /> Duplicate</button>
                      <button type="button" disabled={busyId === item.id} onClick={() => void runDocumentAction(item.id, "rename")} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"><Pencil size={13} /> Rename</button>
                    </div>
                    <button type="button" disabled={busyId === item.id} onClick={() => void runDocumentAction(item.id, "delete")} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"><Trash2 size={13} /> Delete</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
