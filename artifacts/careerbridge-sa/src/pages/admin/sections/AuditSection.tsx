import { useEffect, useState } from "react";
import { Download, ScrollText } from "lucide-react";

import { toast } from "@/hooks/use-toast";

import {
  type AdminAuditEntry,
  type SectionProps,
  adminFetch,
  buildQuery,
  errorMessage,
  exportEntity,
  formatDateTime,
  formatNumber,
  humanizeStatus,
  useAdminData,
  useDebouncedValue,
} from "../api";
import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  SearchInput,
  SectionCard,
} from "../ui";

type AuditResponse = {
  entries?: AdminAuditEntry[];
  logs?: AdminAuditEntry[];
  audit?: AdminAuditEntry[];
  total?: number;
  page?: number;
  limit?: number;
};

type Props = Pick<SectionProps, "token" | "refreshTick">;

const LIMIT = 30;

export default function AuditSection({ token, refreshTick }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  const { data, loading, error, reload } = useAdminData<AuditResponse>(
    () => adminFetch<AuditResponse>(`/admin/audit${buildQuery({ q: debouncedSearch, page, limit: LIMIT })}`, token),
    [token, debouncedSearch, page],
    refreshTick,
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const entries = data?.entries ?? data?.logs ?? data?.audit ?? [];
  const total = data?.total ?? entries.length;

  async function handleExport() {
    setExporting(true);
    try {
      const count = await exportEntity(token, "audit");
      toast({ title: "Export ready", description: `${count} row(s) downloaded as CSV.` });
    } catch (err) {
      toast({ title: "Export failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <SectionCard
      title="Audit log"
      description={`${formatNumber(total)} recorded action(s)`}
      actions={
        <>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search action, admin, entity…"
            testId="input-admin-audit-search"
          />
          <ActionButton onClick={() => void handleExport()} disabled={exporting} testId="button-admin-export-audit">
            <Download size={13} /> {exporting ? "Exporting…" : "Export CSV"}
          </ActionButton>
        </>
      }
    >
      {error && !data ? (
        <ErrorState message={error} onRetry={() => void reload(false)} />
      ) : loading && !data ? (
        <LoadingState label="Loading audit log…" />
      ) : entries.length === 0 ? (
        <EmptyState
          title="No audit entries"
          description={
            debouncedSearch ? "No entry matches that search." : "Administrative actions are recorded here automatically."
          }
          icon={<ScrollText size={18} />}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-2 py-2 font-semibold">Action</th>
                  <th className="px-2 py-2 font-semibold">Administrator</th>
                  <th className="px-2 py-2 font-semibold">Entity</th>
                  <th className="px-2 py-2 font-semibold">Detail</th>
                  <th className="px-2 py-2 font-semibold">IP</th>
                  <th className="px-2 py-2 font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100">
                    <td className="px-2 py-3 font-medium text-slate-800">{humanizeStatus(entry.action)}</td>
                    <td className="px-2 py-3 text-slate-600">{entry.actorEmail || entry.actorName || "System"}</td>
                    <td className="px-2 py-3 text-slate-600">
                      {entry.entity ? `${entry.entity}${entry.entityId ? ` #${entry.entityId}` : ""}` : "—"}
                    </td>
                    <td className="max-w-sm px-2 py-3 text-slate-600">
                      <span className="block truncate" title={entry.detail || undefined}>
                        {entry.detail ||
                          (entry.metadata ? JSON.stringify(entry.metadata) : "—")}
                      </span>
                    </td>
                    <td className="px-2 py-3 font-mono text-xs text-slate-500">{entry.ipAddress || "—"}</td>
                    <td className="px-2 py-3 text-slate-500">{formatDateTime(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data?.page ?? page} limit={data?.limit ?? LIMIT} total={total} onPageChange={setPage} />
        </>
      )}
    </SectionCard>
  );
}
