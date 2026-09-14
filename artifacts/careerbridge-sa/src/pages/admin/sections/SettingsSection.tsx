import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Save, Settings as SettingsIcon } from "lucide-react";

import { toast } from "@/hooks/use-toast";

import {
  PERMISSIONS,
  type SectionProps,
  adminFetch,
  errorMessage,
  humanizeKey,
  useAdminData,
} from "../api";
import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionCard,
  TextAreaField,
  TextField,
} from "../ui";

type SettingsResponse = Record<string, string> | { settings: Record<string, string> };

type Props = Pick<SectionProps, "token" | "can" | "refreshTick" | "onMutated">;

const LONG_VALUE_KEYS = /(description|message|body|html|content|about|notes|template|banner|announcement)/i;

function normalize(payload: SettingsResponse | null): Record<string, string> {
  if (!payload) return {};
  const source =
    typeof payload === "object" && payload !== null && "settings" in payload
      ? (payload as { settings: Record<string, string> }).settings
      : (payload as Record<string, string>);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    result[key] = value === null || value === undefined ? "" : String(value);
  }
  return result;
}

export default function SettingsSection({ token, can, refreshTick, onMutated }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState("");

  const canManage = can(PERMISSIONS.settings);

  const { data, loading, error, reload } = useAdminData<SettingsResponse>(
    () => adminFetch<SettingsResponse>("/admin/settings", token),
    [token],
    refreshTick,
  );

  const remote = useMemo(() => normalize(data), [data]);

  useEffect(() => {
    setValues(remote);
  }, [remote]);

  const keys = useMemo(() => Object.keys(values).sort((a, b) => a.localeCompare(b)), [values]);
  const dirty = useMemo(
    () => keys.some((key) => (remote[key] ?? "") !== values[key]) || keys.length !== Object.keys(remote).length,
    [keys, remote, values],
  );

  async function handleSave() {
    setSaving(true);
    try {
      await adminFetch("/admin/settings", token, { method: "PUT", body: JSON.stringify(values) });
      toast({ title: "Settings saved", description: `${keys.length} key(s) updated.` });
      await reload(true);
      onMutated();
    } catch (err) {
      toast({ title: "Save failed", description: errorMessage(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function handleAddKey() {
    const key = newKey.trim();
    if (!key) return;
    if (key in values) {
      toast({ title: "Key already exists", description: key, variant: "destructive" });
      return;
    }
    setValues((current) => ({ ...current, [key]: "" }));
    setNewKey("");
  }

  return (
    <SectionCard
      title="Platform settings"
      description="Values are stored as key/value pairs and applied across the public site."
      actions={
        canManage ? (
          <>
            <ActionButton onClick={() => setValues(remote)} disabled={!dirty || saving}>
              <RotateCcw size={13} /> Reset
            </ActionButton>
            <ActionButton
              variant="primary"
              onClick={() => void handleSave()}
              disabled={!dirty || saving}
              testId="button-admin-save-settings"
            >
              <Save size={13} /> {saving ? "Saving…" : "Save settings"}
            </ActionButton>
          </>
        ) : undefined
      }
    >
      {error && !data ? (
        <ErrorState message={error} onRetry={() => void reload(false)} />
      ) : loading && !data ? (
        <LoadingState label="Loading settings…" />
      ) : (
        <div className="space-y-5">
          {keys.length === 0 ? (
            <EmptyState
              title="No settings configured"
              description="Add a key below to start configuring the platform."
              icon={<SettingsIcon size={18} />}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {keys.map((key) =>
                LONG_VALUE_KEYS.test(key) || (values[key] ?? "").length > 80 ? (
                  <TextAreaField
                    key={key}
                    label={humanizeKey(key)}
                    value={values[key] ?? ""}
                    onChange={(value) => setValues((current) => ({ ...current, [key]: value }))}
                    disabled={!canManage}
                    rows={4}
                    className="sm:col-span-2"
                    testId={`input-admin-setting-${key}`}
                  />
                ) : (
                  <TextField
                    key={key}
                    label={humanizeKey(key)}
                    value={values[key] ?? ""}
                    onChange={(value) => setValues((current) => ({ ...current, [key]: value }))}
                    disabled={!canManage}
                    testId={`input-admin-setting-${key}`}
                  />
                ),
              )}
            </div>
          )}

          {canManage ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
              <TextField
                label="Add a new setting key"
                value={newKey}
                onChange={setNewKey}
                placeholder="e.g. support_email"
                className="w-64"
                testId="input-admin-setting-new-key"
              />
              <ActionButton onClick={handleAddKey} disabled={!newKey.trim()}>
                Add key
              </ActionButton>
            </div>
          ) : (
            <p className="text-xs text-slate-500">You do not have permission to change platform settings.</p>
          )}
        </div>
      )}
    </SectionCard>
  );
}
