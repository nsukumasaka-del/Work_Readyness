import { type ChangeEvent, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox, Loader2, Search } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { humanizeStatus } from "./api";

/* --------------------------------------------------------------- layout */

export function SectionCard({
  title,
  description,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {title || actions || description ? (
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold text-slate-900">{title}</h2> : null}
            {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
          </div>
          {actions ? (
            <div className="flex min-w-0 w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={`min-w-0 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  icon,
  onClick,
  tone = "sky",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  onClick?: () => void;
  tone?: "sky" | "emerald" | "amber" | "rose" | "slate";
}) {
  const tones: Record<string, string> = {
    sky: "bg-sky-50 text-sky-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
  };
  const interactive = onClick
    ? "cursor-pointer transition hover:border-sky-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
    : "";
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${interactive}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- feedback */

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-slate-500" role="status">
      <Loader2 size={16} className="animate-spin text-sky-500" />
      {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <AlertTriangle size={15} />
          {message}
        </span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-400 shadow-sm">
        {icon ?? <Inbox size={18} />}
      </span>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description ? <p className="max-w-md text-xs text-slate-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- badges */

const STATUS_TONES: Array<{ match: string[]; className: string }> = [
  {
    match: ["active", "approved", "published", "completed", "ok", "healthy", "up", "connected", "online"],
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    match: ["pending", "under_review", "reviewing", "received", "draft", "scheduled", "degraded", "contacted"],
    className: "border-amber-200 bg-amber-50 text-amber-800",
  },
  {
    match: ["rejected", "cancelled", "deleted", "error", "down", "failed", "inactive", "disabled", "suspended"],
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
  {
    match: ["archived", "closed"],
    className: "border-slate-200 bg-slate-100 text-slate-600",
  },
];

export function StatusBadge({ status, className = "" }: { status?: string | null; className?: string }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  const key = status.toLowerCase();
  const tone =
    STATUS_TONES.find((entry) => entry.match.includes(key))?.className ??
    "border-sky-200 bg-sky-50 text-sky-700";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tone} ${className}`}
    >
      {humanizeStatus(status)}
    </span>
  );
}

/* --------------------------------------------------------------- inputs */

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  testId,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
  className?: string;
}) {
  return (
    <label className={`relative block w-full min-w-0 sm:max-w-xs sm:flex-1 ${className}`}>
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-400"
        data-testid={testId}
      />
    </label>
  );
}

export function FilterSelect({
  value,
  onChange,
  options,
  testId,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className="w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-sky-400 sm:w-auto"
      data-testid={testId}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function ActionButton({
  children,
  onClick,
  variant = "default",
  type = "button",
  disabled,
  testId,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  type?: "button" | "submit";
  disabled?: boolean;
  testId?: string;
  className?: string;
}) {
  const variants: Record<string, string> = {
    default: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
    primary: "bg-slate-900 text-white hover:bg-slate-800",
    danger: "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  disabled,
  min,
  testId,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  min?: number;
  testId?: string;
  className?: string;
}) {
  return (
    <label className={`block text-xs font-semibold text-slate-600 ${className}`}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        minLength={min}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-sky-400 disabled:bg-slate-50"
        data-testid={testId}
      />
    </label>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
  disabled,
  testId,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <label className={`block text-xs font-semibold text-slate-600 ${className}`}>
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-sky-400 disabled:bg-slate-50"
        data-testid={testId}
      />
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
  testId,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <label className={`block text-xs font-semibold text-slate-600 ${className}`}>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-sky-400 disabled:bg-slate-50"
        data-testid={testId}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/* --------------------------------------------------------------- tables */

export function SortHeader({
  label,
  columnKey,
  sortKey,
  direction,
  onSort,
  className = "",
}: {
  label: string;
  columnKey: string;
  sortKey: string;
  direction: "asc" | "desc";
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = sortKey === columnKey;
  return (
    <th className={`px-2 py-2 font-semibold ${className}`}>
      <button
        type="button"
        onClick={() => onSort(columnKey)}
        className={`inline-flex items-center gap-1 ${active ? "text-slate-900" : "hover:text-slate-700"}`}
      >
        {label}
        {active ? direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null}
      </button>
    </th>
  );
}

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
      <p className="text-xs text-slate-500">
        Showing {start}–{end} of {total.toLocaleString("en-ZA")}
      </p>
      <div className="flex items-center gap-2">
        <ActionButton onClick={() => onPageChange(page - 1)} disabled={page <= 1} testId="button-admin-prev-page">
          <ChevronLeft size={13} /> Prev
        </ActionButton>
        <span className="text-xs font-semibold text-slate-600">
          Page {page} of {pages}
        </span>
        <ActionButton onClick={() => onPageChange(page + 1)} disabled={page >= pages} testId="button-admin-next-page">
          Next <ChevronRight size={13} />
        </ActionButton>
      </div>
    </div>
  );
}

export function BulkBar({ count, children }: { count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5">
      <p className="text-xs font-semibold text-sky-900">{count} selected</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function RowCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={label}
      onChange={(event) => onChange(event.target.checked)}
      onClick={(event) => event.stopPropagation()}
      className="h-4 w-4 rounded border-slate-300 text-sky-600 accent-sky-600"
    />
  );
}

/* --------------------------------------------------------------- detail */

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-2.5 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      <span className="min-w-0 max-w-full break-words text-sm text-slate-800 sm:max-w-[65%] sm:text-right">
        {value ?? "—"}
      </span>
    </div>
  );
}

export function DetailBlock({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-b border-slate-100 py-2.5 last:border-0">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{value ?? "—"}</div>
    </div>
  );
}

/* ------------------------------------------------------------- confirm */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  destructive = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={`rounded-xl ${
              destructive ? "bg-rose-600 text-white hover:bg-rose-500" : "bg-slate-900 text-white hover:bg-slate-800"
            }`}
            data-testid="button-admin-confirm"
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
