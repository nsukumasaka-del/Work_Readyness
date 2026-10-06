import { searchTrustedJobBoards, type SearchInput, type LiveJobListing } from './job-board-search';
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

export function expandedSearchRoles(input: SearchInput) {
  const role = input.role.trim();
  const synonyms = /virtual assistant|remote assistant/i.test(role)
    ? ['Administrative Assistant', 'Remote Assistant', 'Executive Assistant']
    : /administrat|office assistant/i.test(role) ? ['Administrative Assistant', 'Office Administrator']
    : /customer service|customer support/i.test(role) ? ['Customer Support', 'Client Support Representative'] : [];
  const evidence = candidateRoleSuggestions({ experienceRoles: input.experienceRoles, skills: input.expertise })
    .filter(item => item.basis !== 'target-role').map(item => item.title);
  if (/data entry|excel|administrat|clerical/i.test((input.expertise || []).join(' '))) evidence.push('Data Entry Clerk');
  const unique = (roles: string[]) => [...new Set(roles.map(title => title.trim()).filter(title => title && title.toLowerCase() !== role.toLowerCase()))];
  return { synonyms: unique(synonyms).slice(0, 3), adjacent: unique(evidence).slice(0, 2) };
}

// One bounded request; two provider queries at a time. Never create vacancies.
export async function searchWithLocationFallback(input: SearchInput, search = searchTrustedJobBoards) {
  const requested = input.limit ?? 1;
  const requestedLocation = input.location || 'South Africa';
  const roles = expandedSearchRoles(input);
  const candidate = { targetRole: input.role, experienceRoles: input.experienceRoles, skills: input.expertise, credentials: input.credentials, yearsExperience: input.yearsExperience };
  const hasEvidence = Boolean(input.experienceRoles?.length || input.expertise?.length || input.credentials?.length);
  const combined = new Map<string, LiveJobListing>();
  const identities = new Set<string>();
  const boards = new Set<string>();
  const links = new Map<string, { board: string; url: string }>();
  const searchTiers: Array<{ tier: number; role: string; location: string; status: string }> = [];
  let effectiveLocation = requestedLocation;
  let minimumMatchScore = input.minimumMatchScore ?? (input.mode === 'recommendations' ? 60 : 35);
  let fetchedCount = 0;
  const deadline = Date.now() + 32_000;
  const query = [input.role, requestedLocation].join(' · ');
  const run = async (role: string, location: string, tier: number, floor = minimumMatchScore) => {
    if (Date.now() >= deadline || input.signal?.aborted) return;
    const controller = new AbortController();
    const signal = input.signal ? AbortSignal.any([input.signal, controller.signal]) : controller.signal;
    let timer: ReturnType<typeof setTimeout>;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
        controller.abort();
        // Let allSettled preserve fast-source results after cancelling slow sources.
        timer = setTimeout(() => reject(new Error('Search timeout')), 100);
      }, Math.min(3500, deadline - Date.now())); });
      const result = await Promise.race([search({ ...input, role, location, signal, progressive: true, minimumMatchScore: floor }), timeout]);
      searchTiers.push({ tier, role, location, status: result.jobs.length ? 'results' : signal.aborted ? 'timeout' : 'empty' });
      result.queriedBoards.forEach(board => boards.add(board));
      result.boardSearchLinks.forEach(link => links.set(link.url, link));
      fetchedCount += result.fetchedCount;
      const scored = hasEvidence && input.mode !== 'search' ? calibrateJobListingScores(candidate, result.jobs) : result.jobs;
      for (const job of scored) {
        if (input.mode !== 'search' && job.match < floor) continue;
        const url = job.url.replace(/#.*$/, '').toLowerCase();
        const identity = `${job.title}|${job.company}|${job.location}`.toLowerCase().replace(/\s+/g, ' ');
        if (combined.has(url) || identities.has(identity)) continue;
        identities.add(identity); combined.set(url, job);
      }
      effectiveLocation = location;
    } catch {
      searchTiers.push({ tier, role, location, status: signal.aborted ? 'timeout' : 'unavailable' });
    } finally { clearTimeout(timer!); controller.abort(); }
  };
  await run(input.role, requestedLocation, 1);
  if (!combined.size) {
    // Two synonyms per batch avoids an unbounded board fan-out.
    for (let i = 0; i < roles.synonyms.length && !combined.size; i += 2) await Promise.all(roles.synonyms.slice(i, i + 2).map(role => run(role, requestedLocation, 2)));
  }
  const locations = /johannesburg|pretoria|centurion|sandton|midrand/i.test(requestedLocation) ? ['Gauteng', 'South Africa'] : ['South Africa'];
  for (const location of locations) {
    if (combined.size >= requested) break;
    if (location.toLowerCase() !== requestedLocation.toLowerCase()) {
      await run(input.role, location, 3);
      if (!combined.size && roles.synonyms.length) await run(roles.synonyms.find(role => /remote/i.test(role)) || roles.synonyms[0], location, 3);
    }
  }
  if (!combined.size && hasEvidence && Date.now() < deadline) {
    // A lower relevance floor is not a waiver of mandatory credentials or seniority.
    minimumMatchScore = input.mode === 'recommendations' ? 60 : 30;
    const adjacent = roles.adjacent.length ? roles.adjacent : roles.synonyms.slice(0, 2);
    await Promise.all(adjacent.map(role => run(role, 'South Africa', 4, minimumMatchScore)));
  }
  const jobs = [...combined.values()].slice(0, input.limit ?? 10);
  const fallbackApplied = searchTiers.some(item => item.tier > 1);
  const exhausted = !jobs.length;
  const searchNotice = [fallbackApplied ? 'Showing expanded job matches based on your target role skills and nationwide or remote opportunities.' : '',
    exhausted ? 'No verified eligible vacancies were returned after expanded searches. Use the job-board search links or try again later; no listings were invented.' : '',
    searchTiers.some(item => item.status === 'timeout' || item.status === 'unavailable') ? 'Some job sources were unavailable or reached the search time limit.' : ''].filter(Boolean).join(' ');
  return { jobs, query, queriedBoards: [...boards], boardSearchLinks: [...links.values()], fetchedCount, liveResults: jobs.length > 0,
    effectiveLocation, fallbackApplied, minimumMatchScore, searchTiers, searchNotice };
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
  const calibrated = calibrateJobListingScores(candidate, scored || result.jobs).filter(job => job.match >= result.minimumMatchScore);
  const jobs = (calibrated.length ? calibrated : calibrateJobListingScores(candidate, result.jobs).filter(job => job.match >= result.minimumMatchScore)).slice(0, 10).map(job => ({ ...job, isAiMatch: true }));
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
