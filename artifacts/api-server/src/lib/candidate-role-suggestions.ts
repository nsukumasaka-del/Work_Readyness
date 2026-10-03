export type CandidateRoleSuggestion = { id: string; title: string; location: string; basis: 'target-role' | 'experience' | 'skills'; kind: 'role-suggestion'; isVerifiedVacancy: false; matchScore: null };
export function candidateRoleSuggestions(value: unknown): CandidateRoleSuggestion[] {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
  const location = typeof input.location === 'string' && input.location.trim() ? input.location.trim() : 'South Africa';
  const roles: Array<{ title: string; basis: CandidateRoleSuggestion['basis'] }> = [];
  if (typeof input.targetRole === 'string') for (const title of input.targetRole.split(/[|/;]/)) if (title.trim() && !/^professional$/i.test(title.trim())) roles.push({ title: title.trim(), basis: 'target-role' });
  for (const title of strings(input.experienceRoles)) roles.push({ title: title.trim(), basis: 'experience' });
  const skills = strings(input.skills).join(' ').toLowerCase();
  const rules = [
    [/customer|client|crm|call cent/, ['Customer Services Agent', 'Client Support Representative']],
    [/administrat|office|data entry|clerical/, ['Administration Officer', 'Office Administrator']],
    [/import|export|freight|shipping|logistics/, ['Imports Controller', 'Freight Controller', 'Logistics Coordinator']],
  ] as const;
  for (const [pattern, titles] of rules) if (pattern.test(skills)) for (const title of titles) roles.push({ title, basis: 'skills' });
  const seen = new Set<string>();
  return roles.filter(role => { const key = role.title.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 7)
    .map((role, index) => ({ ...role, id: `suggested-role-${index + 1}`, location, kind: 'role-suggestion', isVerifiedVacancy: false, matchScore: null }));
}
