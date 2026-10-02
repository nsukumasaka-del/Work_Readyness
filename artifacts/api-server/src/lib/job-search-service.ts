import { searchTrustedJobBoards, type SearchInput } from './job-board-search';
import { calibrateJobListingScores, scoreJobListingsWithGemini, type JobScoringCandidate } from './ai/gemini-client';

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 60) : [];
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
export function candidateFromReport(value: unknown): JobScoringCandidate & { location?: string } {
  const report = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const profile = report.candidateProfile && typeof report.candidateProfile === 'object' ? report.candidateProfile as Record<string, unknown> : {};
  return {
    targetRole: text(profile.targetRole) || text(report.targetRole), summary: text(profile.summary),
    experienceRoles: strings(profile.experienceRoles), skills: strings(profile.skills), systems: strings(profile.systems), credentials: strings(profile.credentials),
    yearsExperience: typeof profile.yearsExperience === 'number' && Number.isFinite(profile.yearsExperience) ? Math.max(0, profile.yearsExperience) : undefined,
    location: text(profile.location),
  };
}

export async function searchWithLocationFallback(input: SearchInput, search = searchTrustedJobBoards) {
  let result = await search(input);
  let effectiveLocation = input.location || 'South Africa';
  let fallbackApplied = false;
  if (!result.jobs.length) {
    const broader = /johannesburg|pretoria|centurion|sandton|midrand/i.test(effectiveLocation) ? 'Gauteng' : 'South Africa';
    if (broader.toLowerCase() !== effectiveLocation.toLowerCase()) {
      result = await search({ ...input, location: broader });
      effectiveLocation = broader;
      fallbackApplied = true;
    }
  }
  const notices = [fallbackApplied ? `Search broadened to ${effectiveLocation}.` : ''];
  if (!result.jobs.length) notices.push(result.fetchedCount && input.mode !== 'search'
    ? 'Listings were found, but none met the evidence-based qualification requirements.'
    : 'No verified listings were returned. Try another role or area; some job boards may be temporarily unavailable.');
  return { ...result, effectiveLocation, fallbackApplied, searchNotice: notices.filter(Boolean).join(' ') };
}

export async function searchManualJobs(input: {
  keywords: string; location: string; report?: unknown; apiKey?: string; model?: string;
  industry?: string; postedRange?: string; adzunaAppId?: string; adzunaAppKey?: string;
}, dependencies = { search: searchTrustedJobBoards, score: scoreJobListingsWithGemini }) {
  const candidate = candidateFromReport(input.report);
  const role = input.keywords.trim().slice(0, 120) || candidate.targetRole;
  if (!role) throw new Error('Enter a job title to search.');
  const result = await searchWithLocationFallback({
    role, location: input.location.trim().slice(0, 100) || candidate.location || 'South Africa', mode: 'search', limit: 18,
    experienceRoles: candidate.experienceRoles, expertise: [...candidate.skills || [], ...candidate.systems || []],
    credentials: candidate.credentials, yearsExperience: candidate.yearsExperience,
    adzunaAppId: input.adzunaAppId, adzunaAppKey: input.adzunaAppKey,
  }, dependencies.search);
  const fitAvailable = Boolean(candidate.experienceRoles?.length || candidate.skills?.length || candidate.credentials?.length);
  let scored = null;
  if (fitAvailable && result.jobs.length) {
    try { scored = await dependencies.score({ apiKey: input.apiKey, model: input.model, candidateProfile: candidate, jobs: result.jobs,
      searchPreferences: { industry: input.industry, postedRange: input.postedRange } }); } catch { /* Keep real vacancies when AI is unavailable. */ }
  }
  const jobs = (fitAvailable ? calibrateJobListingScores(candidate, scored || result.jobs) : result.jobs)
    .map(job => ({ ...job, fitAvailable }));
  return { ...result, jobs, liveResults: jobs.length > 0, scoring: scored ? 'gemini' : 'evidence-based-fallback' };
}
