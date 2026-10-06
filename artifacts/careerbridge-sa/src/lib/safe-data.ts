export function objectData(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
export function objectList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item)) : [];
}
export function normalizeAccess(value: unknown) {
  const data = objectData(value);
  const expiry = typeof data.megaAccessUntil === 'string' && Number.isFinite(Date.parse(data.megaAccessUntil)) ? data.megaAccessUntil : null;
  const jobExpiry = typeof data.jobAccessUntil === 'string' && Number.isFinite(Date.parse(data.jobAccessUntil)) ? data.jobAccessUntil : null;
  return {
    adminBypass: data.adminBypass === true,
    megaAccessActive: data.megaAccessActive === true && expiry !== null && Date.parse(expiry) > Date.now(),
    megaAccessUntil: expiry,
    jobAccessUntil: jobExpiry,
    jobAccessActive: data.jobAccessActive === true && jobExpiry !== null && Date.parse(jobExpiry) > Date.now(),
    ownedTemplateIds: stringList(data.ownedTemplateIds),
    unlockedJobIds: stringList(data.unlockedJobIds),
  };
}
