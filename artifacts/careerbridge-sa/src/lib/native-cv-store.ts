import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";
import { authFetch } from "@/lib/auth-session";

const STORE_KEY = "bonlist.native.saved-cvs.v1";
export const NATIVE_CV_STORE_UPDATED = "bonlist-native-cv-store-updated";

export type NativeCvRecord = {
  id: number;
  localId?: number;
  version?: number;
  structure: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  completionScore: number;
  document: Record<string, any>;
  preferences?: Record<string, unknown>;
  offlineAvailable: true;
  pendingSync: boolean;
};

function isAndroidApk() {
  try { return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android"; }
  catch { return false; }
}

async function readAll(): Promise<NativeCvRecord[]> {
  if (!isAndroidApk()) return [];
  try {
    const { value } = await Preferences.get({ key: STORE_KEY });
    const rows = value ? JSON.parse(value) : [];
    return Array.isArray(rows) ? rows as NativeCvRecord[] : [];
  } catch (error) {
    console.error("Could not read the offline CV vault", error);
    return [];
  }
}

async function writeAll(records: NativeCvRecord[]) {
  if (!isAndroidApk()) return;
  await Preferences.set({ key: STORE_KEY, value: JSON.stringify(records) });
  window.dispatchEvent(new Event(NATIVE_CV_STORE_UPDATED));
}

export async function listNativeCvs() {
  return readAll();
}

export async function getNativeCv(id: number) {
  return (await readAll()).find((record) => record.id === id || record.localId === id) ?? null;
}

export async function getNativeCvByLocalId(localId: number) {
  return (await readAll()).find((record) => record.localId === localId || record.id === localId) ?? null;
}

export async function saveNativeCv(
  cvInput: object,
  pendingSync: boolean,
  options?: { title?: string; preferences?: Record<string, unknown> },
) {
  if (!isAndroidApk()) return cvInput as NativeCvRecord;
  const cv = cvInput as Record<string, any>;
  const rows = await readAll();
  const incomingId = Number(cv.id);
  const requestedLocalId = Number(cv.localId);
  const existing = rows.find((row) => row.id === incomingId || row.localId === incomingId || (Number.isFinite(requestedLocalId) && row.localId === requestedLocalId));
  const id = existing?.id && existing.id > 0
    ? existing.id
    : Number.isFinite(incomingId) && incomingId !== 0
      ? incomingId
      : existing?.id ?? -Date.now();
  const now = new Date().toISOString();
  const record: NativeCvRecord = {
    ...existing,
    ...cv,
    id,
    localId: existing?.localId ?? (id < 0 ? id : undefined),
    title: options?.title || cv.title || existing?.title || "Untitled CV",
    structure: cv.structure || cv.document?.structure || existing?.structure || "professional",
    createdAt: cv.createdAt || existing?.createdAt || now,
    updatedAt: now,
    completionScore: Number(cv.completionScore ?? existing?.completionScore ?? 0),
    document: cv.document || existing?.document || {},
    preferences: options?.preferences || cv.preferences || existing?.preferences,
    offlineAvailable: true,
    pendingSync,
  };
  const next = rows.filter((row) => row.id !== id);
  next.unshift(record);
  await writeAll(next);
  return record;
}

export async function removeNativeCv(id: number) {
  await writeAll((await readAll()).filter((record) => record.id !== id));
}

export async function syncPendingNativeCvs() {
  if (!isAndroidApk() || !navigator.onLine) return { synced: 0, pending: (await readAll()).filter((r) => r.pendingSync).length };
  let synced = 0;
  let rows = await readAll();
  for (const row of rows.filter((item) => item.pendingSync)) {
    try {
      const payload = JSON.stringify({
        title: row.title,
        templateId: row.structure,
        document: row.document,
        preferences: row.preferences || {},
      });
      let response = await authFetch(
        row.id > 0 ? `/api/career/cv/documents/${row.id}` : "/api/career/cv/documents",
        { method: row.id > 0 ? "PUT" : "POST", body: payload },
      );
      if (row.id > 0 && response.status === 404) {
        response = await authFetch("/api/career/cv/documents", { method: "POST", body: payload });
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "CV sync failed");
      const saved: NativeCvRecord = {
        ...row,
        ...data,
        id: Number(data.id),
        title: data.title || row.title,
        structure: data.structure || row.structure,
        document: data.document || row.document,
        preferences: data.preferences || row.preferences,
        updatedAt: data.updatedAt || new Date().toISOString(),
        pendingSync: false,
        offlineAvailable: true,
      };
      rows = rows.map((item) => item.id === row.id ? saved : item);
      synced += 1;
      await writeAll(rows);
    } catch (error) {
      console.warn("Offline CV sync will retry when connected", error);
      break;
    }
  }
  window.dispatchEvent(new Event(NATIVE_CV_STORE_UPDATED));
  return { synced, pending: rows.filter((r) => r.pendingSync).length };
}

export async function startNativeCvSync() {
  if (!isAndroidApk()) return () => undefined;
  const networkListener = await Network.addListener("networkStatusChange", ({ connected }) => {
    window.dispatchEvent(new Event(NATIVE_CV_STORE_UPDATED));
    if (connected) void syncPendingNativeCvs();
  });
  const onOnline = () => { void syncPendingNativeCvs(); };
  window.addEventListener("online", onOnline);
  try {
    const status = await Network.getStatus();
    if (status.connected) void syncPendingNativeCvs();
  } catch { /* the browser online event remains as a fallback */ }
  return () => {
    window.removeEventListener("online", onOnline);
    void networkListener.remove();
  };
}
