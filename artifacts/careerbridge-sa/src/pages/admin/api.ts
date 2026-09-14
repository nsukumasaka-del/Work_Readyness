import { type DependencyList, useCallback, useEffect, useRef, useState } from "react";

export const ADMIN_TOKEN_KEY = "careerbridge-admin-token";
export const ADMIN_FLAG_KEY = "careerbridge-is-admin";
export const ADMIN_PROFILE_KEY = "careerbridge-profile";

export type AdminRange = "today" | "7d" | "30d" | "90d" | "all";

export type SectionKey =
  | "overview"
  | "users"
  | "diagnostics"
  | "coaching"
  | "traffic"
  | "jobs"
  | "admins"
  | "audit"
  | "settings";

export const RANGE_OPTIONS: Array<{ value: AdminRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All time" },
];

export const COACHING_STATUSES = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "scheduled",
  "completed",
  "cancelled",
] as const;

export const LEGACY_COACHING_STATUSES = ["received", "reviewing", "contacted", "closed"] as const;

export const COACHING_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const JOB_STATUSES = ["draft", "published", "archived"] as const;

export const ADMIN_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "moderator", label: "Moderator" },
  { value: "content_manager", label: "Content manager" },
];

export const PERMISSIONS = {
  users: "manage_users",
  diagnostics: "manage_diagnostics",
  coaching: "manage_coaching",
  jobs: "manage_jobs",
  admins: "manage_admins",
  settings: "manage_settings",
  audit: "view_audit",
} as const;

/* ------------------------------------------------------------------ types */

export type AdminMe = {
  id: number;
  email: string;
  name: string;
  isPrimary: boolean;
  role?: string | null;
  permissions?: string[] | null;
};

export type HealthEntry = {
  api: string;
  database: string;
  jobSearch: string;
  checkedAt?: string | null;
};

export type OverviewKpis = {
  visits: number;
  uniqueVisitors: number;
  users: number;
  usersTotal: number;
  activeUsers?: number;
  inactiveUsers?: number;
  cvReviews: number;
  cvReviewsTotal: number;
  coachingApplications: number;
  coachingTotal: number;
  coachingPending: number;
  coachingApproved?: number;
  jobsCatalog: number;
  jobsPublished?: number;
  jobsDraft?: number;
  jobsArchived?: number;
  avgAuthenticity: number;
  avgAts: number;
};

export type ActivityItem = {
  type: string;
  id: number;
  title: string;
  detail: string;
  at: string;
  section?: string | null;
};

export type OverviewSignals = {
  profileCount: number;
  diagnosticScore: number | null;
  interviewCompletedCount: number;
  latestRole: string | null;
};

export type OverviewResponse = {
  range: string;
  kpis: OverviewKpis;
  signals?: OverviewSignals;
  visitsByDay: Array<{ day: string; visits: number }>;
  topPaths: Array<{ path: string; visits: number }>;
  topReferrers?: Array<{ referrer: string | null; visits: number }>;
  activity: ActivityItem[];
  health: HealthEntry | HealthEntry[];
};

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  location: string | null;
  targetRole: string | null;
  status?: string | null;
  createdAt: string;
  lastLoginAt?: string | null;
  diagnosticCount?: number;
  coachingStatus?: string | null;
  plan?: string | null;
  programmeStatus?: string | null;
  programmeDaysRemaining?: number | null;
  programmeEndDate?: string | null;
  accessLevel?: string | null;
};

export type AdminUserDetail = AdminUser & Record<string, unknown>;

export type AdminDiagnostic = {
  id: number;
  fileName: string;
  authenticityScore: number;
  atsScore: number;
  createdAt: string;
  userId?: number | null;
  userEmail?: string | null;
  userName?: string | null;
};

export type AdminDiagnosticDetail = AdminDiagnostic & Record<string, unknown>;

export type AdminCoaching = {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  experience: string;
  goals: string;
  paymentPlan: string;
  status: string;
  priority?: string | null;
  assignedCoach?: string | null;
  internalNotes?: string | null;
  scheduledAt?: string | null;
  createdAt: string;
};

export type AdminCoachingDetail = AdminCoaching & Record<string, unknown>;

export type AdminJob = {
  id: number;
  title: string;
  company: string;
  location: string | null;
  sector: string | null;
  salary: string | null;
  match: number | null;
  posted: string | null;
  tags: string[] | null;
  description: string | null;
  requirements: string | null;
  applicationUrl: string | null;
  employmentType: string | null;
  workMode: string | null;
  status: string;
  closingDate: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type JobInput = {
  title: string;
  company: string;
  location: string;
  sector: string;
  salary: string;
  match: number | null;
  posted: string;
  tags: string[];
  description: string;
  requirements: string;
  applicationUrl: string;
  employmentType: string;
  workMode: string;
  status: string;
  closingDate: string | null;
};

export type AdminVisit = {
  id: number;
  path: string;
  referrer: string | null;
  visitorId: string;
  createdAt: string;
  device?: string | null;
  browser?: string | null;
  country?: string | null;
};

export type TrafficResponse = {
  range?: string;
  totals?: {
    visits?: number;
    uniqueVisitors?: number;
    pageviewsPerVisitor?: number;
    returningVisitors?: number;
    newVisitors?: number;
  };
  visitsByDay?: Array<{ day: string; visits: number; uniqueVisitors?: number }>;
  topPaths?: Array<{ path: string; visits: number }>;
  topReferrers?: Array<{ referrer: string | null; visits: number }>;
  devices?: Array<{ device: string | null; visits: number }>;
  browsers?: Array<{ browser: string | null; visits: number }>;
  countries?: Array<{ country: string | null; visits: number }>;
};

export type AdminAuditEntry = {
  id: number;
  action: string;
  entity?: string | null;
  entityId?: number | string | null;
  actorId?: number | null;
  actorEmail?: string | null;
  actorName?: string | null;
  detail?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
  createdAt: string;
};

export type AdminNotification = {
  id: number;
  title?: string | null;
  message?: string | null;
  body?: string | null;
  type?: string | null;
  section?: string | null;
  entityId?: number | null;
  read?: boolean;
  isRead?: boolean;
  readAt?: string | null;
  createdAt: string;
};

export type AdminAccount = {
  id: number;
  name: string;
  email: string;
  isPrimary: boolean;
  role?: string | null;
  status?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
};

export type SearchResultItem = {
  id: number;
  type?: string | null;
  section?: string | null;
  title: string;
  subtitle?: string | null;
  detail?: string | null;
};

export type SearchResponse = {
  results?: SearchResultItem[];
  users?: SearchResultItem[];
  diagnostics?: SearchResultItem[];
  coaching?: SearchResultItem[];
  jobs?: SearchResultItem[];
};

export type Paged<K extends string, T> = {
  total: number;
  page: number;
  limit: number;
} & { [P in K]: T[] };

/* ------------------------------------------------------------------ fetch */

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export async function adminFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text
    ? (() => {
        try {
          return JSON.parse(text) as { error?: string } & T;
        } catch {
          return null;
        }
      })()
    : null;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      unauthorizedHandler?.();
    }
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }
  if (response.status === 204 || !text.trim()) return undefined as T;
  if (!payload) {
    throw new Error(
      `Server returned a non-JSON response (${response.status}). If you are on Android, set LIVE_APP_URL to your deployed BonList site and rebuild.`,
    );
  }
  return payload as T;
}

export function errorMessage(err: unknown, fallback = "Something went wrong") {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function buildQuery(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function rangeParams(range: AdminRange, from?: string, to?: string) {
  const params: Record<string, string> = { range };
  if (from && to) {
    params.from = from;
    params.to = to;
  }
  return params;
}

/* ------------------------------------------------------------- formatting */

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

export function formatNumber(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-ZA");
}

export function toDateTimeInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function toDateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function humanizeKey(key: string) {
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function humanizeStatus(status?: string | null) {
  if (!status) return "—";
  return humanizeKey(status);
}

/* -------------------------------------------------------------------- csv */

export function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return "";
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(","));
  }
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function exportEntity(token: string, entity: string) {
  const payload = await adminFetch<{ rows: Array<Record<string, unknown>>; filename: string }>(
    `/admin/export/${entity}`,
    token,
  );
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (rows.length === 0) {
    throw new Error("There is nothing to export yet.");
  }
  downloadCsv(payload.filename || `careerbridge-${entity}`, toCsv(rows));
  return rows.length;
}

/* ------------------------------------------------------------ permissions */

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    PERMISSIONS.users,
    PERMISSIONS.diagnostics,
    PERMISSIONS.coaching,
    PERMISSIONS.jobs,
    PERMISSIONS.admins,
    PERMISSIONS.settings,
    PERMISSIONS.audit,
  ],
  moderator: [PERMISSIONS.users, PERMISSIONS.diagnostics, PERMISSIONS.coaching, PERMISSIONS.audit],
  content_manager: [PERMISSIONS.jobs, PERMISSIONS.audit],
};

export function makeCan(me: AdminMe | null) {
  return (permission: string) => {
    if (!me) return false;
    if (me.isPrimary) return true;
    const permissions = me.permissions;
    if (permissions && permissions.length > 0) {
      return permissions.includes("*") || permissions.includes(permission);
    }
    if (!me.role) return true;
    const allowed = ROLE_PERMISSIONS[me.role];
    if (!allowed) return true;
    return allowed.includes(permission);
  };
}

export function notificationIsRead(notification: AdminNotification) {
  if (typeof notification.read === "boolean") return notification.read;
  if (typeof notification.isRead === "boolean") return notification.isRead;
  return Boolean(notification.readAt);
}

export function notificationText(notification: AdminNotification) {
  return notification.message || notification.body || "";
}

/* --------------------------------------------------------------- section */

export function sectionForActivity(item: { type?: string | null; section?: string | null }): SectionKey {
  const raw = (item.section || item.type || "").toLowerCase();
  if (raw.includes("user")) return "users";
  if (raw.includes("diagnostic") || raw.includes("cv") || raw.includes("review")) return "diagnostics";
  if (raw.includes("coach")) return "coaching";
  if (raw.includes("job")) return "jobs";
  if (raw.includes("visit") || raw.includes("traffic")) return "traffic";
  if (raw.includes("admin")) return "admins";
  if (raw.includes("audit")) return "audit";
  if (raw.includes("setting")) return "settings";
  return "overview";
}

export function healthList(health: OverviewResponse["health"] | undefined): HealthEntry[] {
  if (!health) return [];
  return Array.isArray(health) ? health : [health];
}

/* ----------------------------------------------------------------- hooks */

export type AdminDataState<T> = {
  data: T | null;
  loading: boolean;
  error: string;
  reload: (silent?: boolean) => Promise<void>;
};

/**
 * Loads admin data for the given dependency list and silently refetches when
 * `silentKey` changes (driven by the dashboard's 5 second live poll).
 */
export function useAdminData<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  silentKey = 0,
): AdminDataState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetcherRef = useRef(fetcher);
  const loadedRef = useRef(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  fetcherRef.current = fetcher;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (silent = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (!silent || !loadedRef.current) setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (!mountedRef.current) return;
      setData(result);
      setError("");
      loadedRef.current = true;
    } catch (err) {
      if (!mountedRef.current) return;
      if (!silent || !loadedRef.current) setError(errorMessage(err, "Could not load this section"));
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!silentKey || !loadedRef.current) return;
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [silentKey]);

  return { data, loading, error, reload: load };
}

export function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/* ---------------------------------------------------------- shared props */

export type SectionProps = {
  token: string;
  me: AdminMe | null;
  can: (permission: string) => boolean;
  range: AdminRange;
  from: string;
  to: string;
  refreshTick: number;
  focusId: number | null;
  onFocusHandled: () => void;
  onNavigate: (section: SectionKey, id?: number) => void;
  onMutated: () => void;
};
