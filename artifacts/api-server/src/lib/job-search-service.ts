import { searchTrustedJobBoards, type SearchInput } from './job-board-search';
import { calibrateJobListingScores, scoreJobListingsWithGemini, type JobScoringCandidate } from './ai/gemini-client';
import { extractCvDataFromText } from './cv-builder';
import { estimateCareerYears } from './career-alignment';
import { candidateRoleSuggestions } from './candidate-role-suggestions';

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
  const requested = input.limit ?? 1;
  const combined = new Map(result.jobs.map(job => [job.url || String(job.id), job]));
  const locations = /johannesburg|pretoria|centurion|sandton|midrand/i.test(effectiveLocation) ? ['Gauteng', 'South Africa'] : ['South Africa'];
  for (const broader of locations) {
    if (combined.size >= requested) break;
    if (broader.toLowerCase() !== effectiveLocation.toLowerCase()) {
      result = await search({ ...input, location: broader });
      for (const job of result.jobs) if (!combined.has(job.url || String(job.id))) combined.set(job.url || String(job.id), job);
      effectiveLocation = broader;
      fallbackApplied = true;
    }
  }
  result.jobs = [...combined.values()].sort((a, b) => b.match - a.match).slice(0, input.limit ?? 10);
  result.liveResults = result.jobs.length > 0;
  const notices = [fallbackApplied ? `Search broadened to ${effectiveLocation}.` : ''];
  if (!result.jobs.length) notices.push(result.fetchedCount && input.mode !== 'search'
    ? 'Listings were found, but none met the evidence-based qualification requirements.'
    : 'No verified listings were returned. Try another role or area; some job boards may be temporarily unavailable.');
  return { ...result, effectiveLocation, fallbackApplied, searchNotice: notices.filter(Boolean).join(' ') };
}

export function normalizeJobRequest(value: unknown) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return { keywords: (text(input.keywords) || text(input.query) || text(input.targetRole) || text(input.role)).slice(0, 120),
    location: (text(input.location) || [text(input.city), text(input.province)].filter(Boolean).join(', ')).slice(0, 100),
    cvText: (text(input.cvText) || text(input.text)).slice(0, 100_000) };
}

export async function searchCandidateJobs(input: Parameters<typeof searchManualJobs>[0] & { cvText?: string }, dependencies = { search: searchTrustedJobBoards, score: scoreJobListingsWithGemini }) {
  let candidate = candidateFromReport(input.report);
  if (input.cvText?.trim()) {
    const cv = extractCvDataFromText(input.cvText, 'candidate.txt');
    candidate = { targetRole: input.keywords || cv.personal.professionalTitle || '', summary: cv.summary,
      experienceRoles: cv.experiences.map(item => item.role), skills: cv.skills, systems: cv.toolsAndSoftware,
      credentials: [...cv.education.map(item => item.degree), ...cv.certifications.map(item => item.name)],
      yearsExperience: estimateCareerYears(cv.experiences), location: input.location || cv.personal.location };
  }
  if (!candidate.experienceRoles?.length && !candidate.skills?.length && !candidate.credentials?.length) throw new Error('Upload a readable CV or complete a CV review before requesting matches.');
  const result = await searchWithLocationFallback({ role: input.keywords || candidate.targetRole || 'Professional', location: input.location || candidate.location || 'South Africa',
    mode: 'candidate-options', limit: 10, experienceRoles: candidate.experienceRoles, expertise: [...candidate.skills || [], ...candidate.systems || []],
    credentials: candidate.credentials, yearsExperience: candidate.yearsExperience, adzunaAppId: input.adzunaAppId, adzunaAppKey: input.adzunaAppKey }, dependencies.search);
  let scored = null;
  try { scored = await dependencies.score({ apiKey: input.apiKey, model: input.model, candidateProfile: candidate, jobs: result.jobs }); } catch { /* Keep real listings and strict deterministic scores. */ }
  const jobs = calibrateJobListingScores(candidate, scored || result.jobs).filter(job => job.match >= 35).slice(0, 10).map(job => ({ ...job, isAiMatch: true }));
  return { ...result, jobs, roleSuggestions: candidateRoleSuggestions({ ...candidate, targetRole: input.keywords || candidate.targetRole, location: input.location || candidate.location }), candidateProfile: candidate, liveResults: jobs.length > 0, scoring: scored ? 'gemini' : 'evidence-based-fallback', isFallback: !scored };
}

export async function searchManualJobs(input: {
  keywords: string; location: string; report?: unknown; apiKey?: string; model?: string;
  industry?: string; postedRange?: string; adzunaAppId?: string; adzunaAppKey?: string;
}, dependencies = { search: searchTrustedJobBoards, score: scoreJobListingsWithGemini }) {
  const candidate = candidateFromReport(input.report);
  const role = input.keywords.trim().slice(0, 120) || candidate.targetRole;
  if (!role) throw new Error('Enter a job title to search.');
  const result = await searchWithLocationFallback({
    role, location: input.location.trim().slice(0, 100) || candidate.location || 'South Africa', mode: 'search', limit: 10,
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
    .map(job => ({ ...job, fitAvailable, isAiMatch: fitAvailable }));
  return { ...result, jobs, liveResults: jobs.length > 0, scoring: scored ? 'gemini' : 'evidence-based-fallback' };
}
