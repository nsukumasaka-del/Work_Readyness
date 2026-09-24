import { useEffect, useState } from "react";
import { FileText, RefreshCw, WifiOff } from "lucide-react";
import { Link } from "wouter";
import { listNativeCvs, NATIVE_CV_STORE_UPDATED, leaveOfflineWorkstation, type NativeCvRecord } from "@/lib/native-cv-store";

export default function OfflineWorkstationPage() {
  const [documents, setDocuments] = useState<NativeCvRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    void listNativeCvs().then(setDocuments).finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
    window.addEventListener(NATIVE_CV_STORE_UPDATED, refresh);
    return () => window.removeEventListener(NATIVE_CV_STORE_UPDATED, refresh);
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800"><WifiOff size={14} /> Offline Workstation</p>
            <h1 className="mt-2 text-3xl font-bold">CVs saved on this device</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Only local CV documents are available here. Account services, job search, AI tools, and cloud documents require an internet connection and sign-in.</p>
          </div>
          <button type="button" onClick={refresh} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold"><RefreshCw size={15} /> Refresh</button>
        </div>
        {loading ? <p className="rounded-xl bg-white p-6 text-sm text-slate-500">Loading device CVs…</p> : documents.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {documents.map((item) => {
              const localId = item.localId ?? item.id;
              const href = `/cv-builder?offline=1&documentId=${encodeURIComponent(String(localId))}`;
              return (
                <article key={`${item.id}:${item.localId ?? ""}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><FileText size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold">{item.title}</h2>
                      <p className="mt-1 truncate text-sm text-slate-600">{item.document?.fullName || "Saved CV"} · {item.completionScore}% complete</p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-800">Available Offline</span>
                    {item.pendingSync ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-900">Pending Sync</span> : null}
                  </div>
                  <Link href={href} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#00A884] px-4 text-sm font-semibold text-white">Open CV</Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <FileText size={30} className="mx-auto text-slate-400" />
            <h2 className="mt-3 font-semibold">No CVs saved on this device</h2>
            <p className="mt-1 text-sm text-slate-500">Connect to the internet and sign in to access or save your account CVs for offline use.</p>
          </div>
        )}
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/login" onClick={() => void leaveOfflineWorkstation()} className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold">Back to Sign In</Link>
        </div>
      </div>
    </main>
  );
}
