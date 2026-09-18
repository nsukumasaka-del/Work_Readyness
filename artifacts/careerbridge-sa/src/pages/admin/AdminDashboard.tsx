import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CheckCheck,
  ClipboardList,
  Eye,
  FileText,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  ScrollText,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Link, useLocation } from "wouter";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

import {
  ADMIN_FLAG_KEY,
  ADMIN_PROFILE_KEY,
  ADMIN_TOKEN_KEY,
  type AdminMe,
  type AdminNotification,
  type AdminRange,
  PERMISSIONS,
  RANGE_OPTIONS,
  type SearchResponse,
  type SearchResultItem,
  type SectionKey,
  adminFetch,
  buildQuery,
  errorMessage,
  formatDateTime,
  makeCan,
  notificationIsRead,
  notificationText,
  sectionForActivity,
  setUnauthorizedHandler,
} from "./api";
import AdminsSection from "./sections/AdminsSection";
import AuditSection from "./sections/AuditSection";
import CoachingSection from "./sections/CoachingSection";
import DiagnosticsSection from "./sections/DiagnosticsSection";
import JobsSection from "./sections/JobsSection";
import OverviewSection from "./sections/OverviewSection";
import SettingsSection from "./sections/SettingsSection";
import TrafficSection from "./sections/TrafficSection";
import UsersSection from "./sections/UsersSection";

const POLL_MS = 5000;

type NavItem = {
  id: SectionKey;
  label: string;
  icon: ReactNode;
  description: string;
  permission?: string;
};

const NAV: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: <LayoutDashboard size={16} />,
    description: "Operational view of visits, users, diagnostics and coaching demand.",
  },
  {
    id: "users",
    label: "Users",
    icon: <Users size={16} />,
    description: "Search, review and manage registered candidate profiles.",
  },
  {
    id: "diagnostics",
    label: "CV reviews",
    icon: <FileText size={16} />,
    description: "Every CV diagnostic report generated on the platform.",
  },
  {
    id: "coaching",
    label: "Coaching",
    icon: <ClipboardList size={16} />,
    description: "Triage the coaching pipeline and assign coaches.",
  },
  {
    id: "traffic",
    label: "Traffic",
    icon: <Eye size={16} />,
    description: "Traffic analytics, top pages and the raw visit log.",
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: <BriefcaseBusiness size={16} />,
    description: "Create, publish and archive listings in the jobs catalog.",
  },
  {
    id: "admins",
    label: "Administrators",
    icon: <ShieldCheck size={16} />,
    description: "Control who can access this console and what they can do.",
  },
  {
    id: "audit",
    label: "Audit log",
    icon: <ScrollText size={16} />,
    description: "A searchable trail of every administrative action.",
  },
  {
    id: "settings",
    label: "Settings",
    icon: <SettingsIcon size={16} />,
    description: "Platform configuration applied across the public site.",
  },
];

function AdminGate() {
  return (
    <div className="min-h-[70vh] bg-slate-950 px-5 py-16 text-slate-100">
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-800 bg-slate-900/80 p-8 text-center shadow-2xl">
        <Lock className="mx-auto text-sky-300" size={28} />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Admin access only</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Sign in with your admin email on the main BonList login page. Administrators must complete authenticator MFA
          before the dashboard unlocks.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-sky-400"
            data-testid="link-admin-gate-login"
          >
            Go to Log in <ArrowRight size={15} />
          </Link>
          <Link
            href="/security/admin-mfa"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-800"
          >
            Complete MFA setup
          </Link>
        </div>
      </div>
    </div>
  );
}

function flattenSearch(payload: SearchResponse | null): Array<SearchResultItem & { section: SectionKey }> {
  if (!payload) return [];
  const groups: Array<[SectionKey, SearchResultItem[] | undefined]> = [
    ["users", payload.users],
    ["diagnostics", payload.diagnostics],
    ["coaching", payload.coaching],
    ["jobs", payload.jobs],
  ];
  const collected: Array<SearchResultItem & { section: SectionKey }> = [];
  for (const item of payload.results ?? []) {
    collected.push({ ...item, section: sectionForActivity(item) });
  }
  for (const [section, items] of groups) {
    for (const item of items ?? []) {
      collected.push({ ...item, section });
    }
  }
  return collected;
}

export function AdminApp() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(ADMIN_TOKEN_KEY));
  const [section, setSection] = useState<SectionKey>("diagnostics");
  const [range, setRange] = useState<AdminRange>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [me, setMe] = useState<AdminMe | null>(null);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Array<SearchResultItem & { section: SectionKey }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [focus, setFocus] = useState<{ section: SectionKey; id: number } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [liveClock, setLiveClock] = useState(() => Date.now());
  const [authError, setAuthError] = useState("");
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  const signOutLocally = useCallback(() => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_FLAG_KEY);
    setToken(null);
    setMe(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthError("Your admin session expired. Please log in again.");
      signOutLocally();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOutLocally]);

  const can = useMemo(() => makeCan(me), [me]);

  const visibleNav = useMemo(
    () => NAV.filter((item) => (item.id === "admins" ? can(PERMISSIONS.admins) || me === null : true)),
    [can, me],
  );

  const active = useMemo(
    () => visibleNav.find((item) => item.id === section) ?? NAV[0],
    [visibleNav, section],
  );

  /* ------------------------------------------------------------ identity */

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    adminFetch<AdminMe>("/admin/me", token)
      .then((payload) => {
        if (!cancelled) setMe(payload);
      })
      .catch((err) => {
        if (!cancelled) setAuthError(errorMessage(err, "Could not verify your admin session"));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  /* ---------------------------------------------------------- live poll */

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const tick = () => {
      if (cancelled || document.visibilityState === "hidden") return;
      setRefreshTick((current) => current + 1);
      setLastUpdated(new Date());
    };

    setLastUpdated(new Date());
    const pollId = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  useEffect(() => {
    const id = window.setInterval(() => setLiveClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  /* ------------------------------------------------------ notifications */

  const loadNotifications = useCallback(
    async (activeToken: string) => {
      try {
        const payload = await adminFetch<{ notifications?: AdminNotification[] } | AdminNotification[]>(
          "/admin/notifications",
          activeToken,
        );
        const list = Array.isArray(payload) ? payload : payload?.notifications ?? [];
        setNotifications(list);
      } catch {
        // Notifications are non-critical; keep the last known list.
      }
    },
    [],
  );

  useEffect(() => {
    if (!token) return;
    void loadNotifications(token);
  }, [token, refreshTick, loadNotifications]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onClickAway = (event: MouseEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [notificationsOpen]);

  const unreadCount = useMemo(
    () => notifications.filter((entry) => !notificationIsRead(entry)).length,
    [notifications],
  );

  /* ------------------------------------------------------ global search */

  useEffect(() => {
    if (!token || !searchOpen) return;
    const term = searchTerm.trim();
    if (term.length < 2) {
      setSearchResults([]);
      setSearchError("");
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timeoutId = window.setTimeout(() => {
      adminFetch<SearchResponse>(`/admin/search${buildQuery({ q: term })}`, token)
        .then((payload) => {
          if (cancelled) return;
          setSearchResults(flattenSearch(payload));
          setSearchError("");
        })
        .catch((err) => {
          if (!cancelled) setSearchError(errorMessage(err, "Search failed"));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [searchTerm, searchOpen, token]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ---------------------------------------------------------- callbacks */

  const navigate = useCallback((target: SectionKey, id?: number) => {
    setSection(target);
    setMobileNavOpen(false);
    setFocus(id === undefined ? null : { section: target, id });
  }, []);

  const handleMutated = useCallback(() => {
    setRefreshTick((current) => current + 1);
    setLastUpdated(new Date());
  }, []);

  async function handleLogout() {
    if (token) {
      await adminFetch("/admin/logout", token, { method: "POST" }).catch(() => undefined);
    }
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_FLAG_KEY);
    sessionStorage.removeItem(ADMIN_PROFILE_KEY);
    setToken(null);
    setMe(null);
  }

  async function markNotificationRead(id: number) {
    if (!token) return;
    setNotifications((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, read: true, isRead: true } : entry)),
    );
    try {
      await adminFetch(`/admin/notifications/${id}/read`, token, { method: "POST" });
    } catch (err) {
      toast({ title: "Could not mark as read", description: errorMessage(err), variant: "destructive" });
      void loadNotifications(token);
    }
  }

  async function markAllRead() {
    if (!token) return;
    setNotifications((current) => current.map((entry) => ({ ...entry, read: true, isRead: true })));
    try {
      await adminFetch("/admin/notifications/read-all", token, { method: "POST" });
      toast({ title: "All notifications marked as read" });
    } catch (err) {
      toast({ title: "Could not update notifications", description: errorMessage(err), variant: "destructive" });
      void loadNotifications(token);
    }
  }

  function openNotification(entry: AdminNotification) {
    setNotificationsOpen(false);
    if (!notificationIsRead(entry)) void markNotificationRead(entry.id);
    const target = sectionForActivity(entry);
    if (target !== "overview") navigate(target, entry.entityId ?? undefined);
  }

  function openSearchResult(result: SearchResultItem & { section: SectionKey }) {
    setSearchOpen(false);
    setSearchTerm("");
    navigate(result.section, result.id);
  }

  const liveLabel = useMemo(() => {
    if (!lastUpdated) return "Connecting…";
    const seconds = Math.max(0, Math.floor((liveClock - lastUpdated.getTime()) / 1000));
    if (seconds < 2) return "Updated just now";
    if (seconds < 60) return `Updated ${seconds}s ago`;
    return `Updated ${Math.floor(seconds / 60)}m ago`;
  }, [lastUpdated, liveClock]);

  if (!token) {
    return (
      <>
        {authError ? (
          <div className="bg-slate-950 px-5 pt-6">
            <p className="mx-auto max-w-lg rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-200">
              {authError}
            </p>
          </div>
        ) : null}
        <AdminGate />
      </>
    );
  }

  const sectionProps = {
    token,
    me,
    can,
    range,
    from: customFrom,
    to: customTo,
    refreshTick,
    focusId: focus?.section === section ? focus.id : null,
    onFocusHandled: () => setFocus(null),
    onNavigate: navigate,
    onMutated: handleMutated,
  };

  const showCustomRange = section === "overview" || section === "traffic";

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-slate-100 pt-[env(safe-area-inset-top,0px)] text-slate-900" data-testid="admin-dashboard">
      <div className="mx-auto grid max-w-7xl gap-0 lg:grid-cols-[minmax(200px,220px)_minmax(0,1fr)]">
        <aside className="relative z-20 border-b border-slate-800 bg-slate-950 px-4 py-5 text-slate-100 lg:min-h-[100dvh] lg:border-b-0 lg:border-r lg:border-slate-200">
          <div className="mb-4 flex items-center justify-between gap-3 px-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Admin</p>
              <div className="mt-2 flex items-center gap-2">
                <img src="/brand/bonlist-mark.png" alt="" className="h-7 w-7 object-contain" width={28} height={28} />
                <p className="truncate text-lg font-semibold">BonList</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileNavOpen((current) => !current)}
              className="shrink-0 rounded-lg border border-slate-800 p-2 text-slate-300 lg:hidden"
              aria-label="Toggle navigation"
              aria-expanded={mobileNavOpen}
              data-testid="button-admin-mobile-nav"
            >
              {mobileNavOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>

          <nav
            className={`${mobileNavOpen ? "block" : "hidden"} max-h-[70vh] space-y-1 overflow-y-auto lg:block lg:max-h-none`}
            aria-label="Admin sections"
          >
            {visibleNav.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${
                  section === item.id ? "bg-sky-500 text-slate-950" : "text-slate-300 hover:bg-slate-900"
                }`}
                data-testid={`button-admin-nav-${item.id}`}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className={`${mobileNavOpen ? "block" : "hidden"} mt-6 space-y-2 border-t border-slate-800 px-2 pt-4 lg:block`}>
            {me ? (
              <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="truncate text-xs font-semibold text-slate-200">{me.name || me.email}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {me.isPrimary ? "Primary admin" : me.role ? me.role.replace(/_/g, " ") : "Administrator"}
                </p>
              </div>
            ) : null}
            <Link href="/" className="block text-xs text-slate-400 hover:text-sky-300">
              ← Back to site
            </Link>
            <button
              onClick={() => void handleLogout()}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-rose-300"
              data-testid="button-admin-logout"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </aside>

        <main className="min-w-0 overflow-x-hidden px-4 py-5 sm:px-5 md:px-8 md:py-6">
          <div className="mb-5 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{active.label}</h1>
                <p className="mt-1 text-sm text-slate-500">{active.description}</p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800"
                  data-testid="text-admin-live"
                  title="Dashboard refreshes automatically every few seconds"
                >
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                  <span className="whitespace-nowrap">Live · {liveLabel}</span>
                </span>

                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  data-testid="button-admin-search"
                >
                  <Search size={13} />
                  <span className="hidden sm:inline">Search</span>
                </button>

                <div className="relative" ref={notificationsRef}>
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen((current) => !current)}
                    className="relative inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    data-testid="button-admin-notifications"
                    aria-label="Notifications"
                  >
                    <Bell size={13} />
                    {unreadCount > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    ) : null}
                  </button>

                  {notificationsOpen ? (
                    <div className="absolute right-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                        <p className="text-sm font-semibold text-slate-900">Notifications</p>
                        {unreadCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => void markAllRead()}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-800"
                            data-testid="button-admin-notifications-read-all"
                          >
                            <CheckCheck size={13} /> Mark all read
                          </button>
                        ) : null}
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <p className="px-4 py-6 text-center text-sm text-slate-500">You are all caught up.</p>
                        ) : (
                          notifications.map((entry) => (
                            <button
                              key={entry.id}
                              type="button"
                              onClick={() => openNotification(entry)}
                              className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                                notificationIsRead(entry) ? "" : "bg-sky-50/60"
                              }`}
                            >
                              <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                                {notificationIsRead(entry) ? null : (
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                                )}
                                <span className="min-w-0 break-words">{entry.title || "Notification"}</span>
                              </p>
                              {notificationText(entry) ? (
                                <p className="mt-0.5 text-xs text-slate-500">{notificationText(entry)}</p>
                              ) : null}
                              <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(entry.createdAt)}</p>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                <button
                  onClick={handleMutated}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                  data-testid="button-admin-refresh"
                >
                  Refresh
                </button>
              </div>
            </div>

            {showCustomRange ? (
              <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-3.5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Date range</p>
                  <div
                    className="mt-2 flex max-w-full gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    role="group"
                    aria-label="Preset ranges"
                  >
                    {RANGE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setRange(option.value)}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                          range === option.value && !customFrom && !customTo
                            ? "bg-slate-900 text-white"
                            : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                        }`}
                        data-testid={`button-admin-range-${option.value}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {showCustomRange ? (
                  <div className="flex min-w-0 flex-wrap items-end gap-2 border-t border-slate-100 pt-3 sm:border-t-0 sm:pt-0">
                    <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600 sm:flex-none">
                      From
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(event) => setCustomFrom(event.target.value)}
                        className="mt-1 block w-full min-w-0 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-normal outline-none focus:border-sky-400 sm:w-auto"
                        data-testid="input-admin-range-from"
                      />
                    </label>
                    <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600 sm:flex-none">
                      To
                      <input
                        type="date"
                        value={customTo}
                        onChange={(event) => setCustomTo(event.target.value)}
                        className="mt-1 block w-full min-w-0 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-normal outline-none focus:border-sky-400 sm:w-auto"
                        data-testid="input-admin-range-to"
                      />
                    </label>
                    {customFrom && customTo ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomFrom("");
                          setCustomTo("");
                        }}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Clear
                      </button>
                    ) : (
                      <p className="w-full text-xs text-slate-400 sm:w-auto sm:py-1.5">Optional custom dates</p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {authError ? (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {authError}
            </div>
          ) : null}

          {section === "overview" ? (
            <OverviewSection
              token={sectionProps.token}
              range={sectionProps.range}
              from={sectionProps.from}
              to={sectionProps.to}
              refreshTick={sectionProps.refreshTick}
              onNavigate={sectionProps.onNavigate}
            />
          ) : null}

          {section === "users" ? (
            <UsersSection
              token={sectionProps.token}
              can={sectionProps.can}
              refreshTick={sectionProps.refreshTick}
              focusId={sectionProps.focusId}
              onFocusHandled={sectionProps.onFocusHandled}
              onMutated={sectionProps.onMutated}
            />
          ) : null}

          {section === "diagnostics" ? (
            <DiagnosticsSection
              token={sectionProps.token}
              can={sectionProps.can}
              refreshTick={sectionProps.refreshTick}
              focusId={sectionProps.focusId}
              onFocusHandled={sectionProps.onFocusHandled}
              onMutated={sectionProps.onMutated}
            />
          ) : null}

          {section === "coaching" ? (
            <CoachingSection
              token={sectionProps.token}
              can={sectionProps.can}
              refreshTick={sectionProps.refreshTick}
              focusId={sectionProps.focusId}
              onFocusHandled={sectionProps.onFocusHandled}
              onMutated={sectionProps.onMutated}
            />
          ) : null}

          {section === "traffic" ? (
            <TrafficSection
              token={sectionProps.token}
              range={sectionProps.range}
              from={sectionProps.from}
              to={sectionProps.to}
              refreshTick={sectionProps.refreshTick}
            />
          ) : null}

          {section === "jobs" ? (
            <JobsSection
              token={sectionProps.token}
              can={sectionProps.can}
              refreshTick={sectionProps.refreshTick}
              focusId={sectionProps.focusId}
              onFocusHandled={sectionProps.onFocusHandled}
              onMutated={sectionProps.onMutated}
            />
          ) : null}

          {section === "admins" ? (
            <AdminsSection
              token={sectionProps.token}
              me={sectionProps.me}
              can={sectionProps.can}
              refreshTick={sectionProps.refreshTick}
              onMutated={sectionProps.onMutated}
            />
          ) : null}

          {section === "audit" ? (
            <AuditSection token={sectionProps.token} refreshTick={sectionProps.refreshTick} />
          ) : null}

          {section === "settings" ? (
            <SettingsSection
              token={sectionProps.token}
              can={sectionProps.can}
              refreshTick={sectionProps.refreshTick}
              onMutated={sectionProps.onMutated}
            />
          ) : null}
        </main>
      </div>

      <Dialog
        open={searchOpen}
        onOpenChange={(open) => {
          setSearchOpen(open);
          if (!open) {
            setSearchTerm("");
            setSearchResults([]);
            setSearchError("");
          }
        }}
      >
        <DialogContent className="max-w-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Search the console</DialogTitle>
            <DialogDescription>Find users, CV reviews, coaching applications and job listings.</DialogDescription>
          </DialogHeader>

          <label className="relative block">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Type at least 2 characters…"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-400"
              data-testid="input-admin-global-search"
            />
          </label>

          <div className="max-h-80 overflow-y-auto">
            {searchError ? (
              <p className="px-1 py-4 text-sm text-rose-600">{searchError}</p>
            ) : searching ? (
              <p className="px-1 py-4 text-sm text-slate-500">Searching…</p>
            ) : searchTerm.trim().length < 2 ? (
              <p className="px-1 py-4 text-sm text-slate-500">Start typing to search across every section.</p>
            ) : searchResults.length === 0 ? (
              <p className="px-1 py-4 text-sm text-slate-500">No results for “{searchTerm.trim()}”.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {searchResults.map((result) => (
                  <li key={`${result.section}-${result.id}-${result.title}`}>
                    <button
                      type="button"
                      onClick={() => openSearchResult(result)}
                      className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left transition hover:bg-slate-50"
                      data-testid={`button-admin-search-result-${result.section}-${result.id}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{result.title}</p>
                        {result.subtitle || result.detail ? (
                          <p className="truncate text-xs text-slate-500">{result.subtitle || result.detail}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        {NAV.find((item) => item.id === result.section)?.label ?? result.section}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminRoute() {
  const [location] = useLocation();
  useEffect(() => {
    // Admin pages are intentionally excluded from public visit tracking.
  }, [location]);
  return <AdminApp />;
}
