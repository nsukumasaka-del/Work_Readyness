import { searchTrustedJobBoards, type SearchInput, type LiveJobListing } from './job-board-search';
import { calibrateJobListingScores, scoreJobListingsWithGemini, validateTargetRoleWithGemini, type JobScoringCandidate, type TargetRoleValidation } from './ai/gemini-client';
import { extractCvDataFromText } from './cv-builder';
import { estimateCareerYears } from './career-alignment';
import { candidateRoleSuggestions } from './candidate-role-suggestions';

const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 60) : [];
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
type JobSearchDependencies = {
  search: typeof searchTrustedJobBoards;
  score: typeof scoreJobListingsWithGemini;
  validate?: typeof validateTargetRoleWithGemini;
};
const defaultDependencies: JobSearchDependencies = { search: searchTrustedJobBoards, score: scoreJobListingsWithGemini, validate: validateTargetRoleWithGemini };
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

const roleDomain = (value: string) => {
  const rules = [
    ['pilot', /\b(?:pilot|first officer|aircraft captain|aviation)\b/i],
    ['legal', /\b(?:lawyer|attorney|advocate|legal practitioner|paralegal)\b/i],
    ['medical', /\b(?:doctor|physician|surgeon|medical practitioner)\b/i],
    ['nursing', /\b(?:registered nurse|professional nurse|nurse practitioner|nursing)\b/i],
    ['software', /\b(?:software|developer|programmer|devops|data engineer|web engineer)\b/i],
    ['engineering', /\b(?:mechanical|electrical|civil|chemical|industrial|professional)\s+engineer\b/i],
    ['finance', /\b(?:accountant|auditor|bookkeeper|financial analyst|finance manager)\b/i],
    ['logistics', /\b(?:logistics|freight|imports?|exports?|shipping|supply chain|warehouse)\b/i],
    ['customer-service', /\b(?:customer service|customer support|client service|call cent(?:er|re)|contact cent(?:er|re))\b/i],
    ['administration', /\b(?:administrat|office assistant|executive assistant|data entry|receptionist|secretary)\b/i],
    ['sales', /\b(?:sales|business development|account executive)\b/i],
    ['construction', /\b(?:construction|quantity surveyor|site manager|bricklayer|electrician|plumber)\b/i],
  ] as const;
  return rules.find(([, pattern]) => pattern.test(value))?.[0] || '';
};

const primaryCvRole = (candidate: JobScoringCandidate, targetRole: string) => candidateRoleSuggestions({ ...candidate, targetRole: '' })
  .find(item => item.basis !== 'target-role')?.title || candidate.experienceRoles?.find(Boolean) || targetRole;

export function deterministicTargetRoleValidation(candidate: JobScoringCandidate, targetRole: string): TargetRoleValidation {
  const original = targetRole.trim().slice(0, 120);
  const experience = (candidate.experienceRoles || []).join(' ');
  const credentials = (candidate.credentials || []).join(' ');
  const required = [
    { applies: /\b(?:pilot|first officer|aircraft captain)\b/i.test(original), credential: /\b(?:CPL|ATPL|commercial pilot licen[cs]e|airline transport pilot licen[cs]e)\b/i, experience: /\b(?:pilot|first officer|aircraft captain|flight hours?)\b/i },
    { applies: /\b(?:lawyer|attorney|advocate|legal practitioner)\b/i.test(original), credential: /\b(?:LLB|bachelor of laws|admitted attorney|admitted advocate|legal practice council|LPC registration)\b/i, experience: /\b(?:lawyer|attorney|advocate|legal practitioner|candidate attorney)\b/i },
    { applies: /\b(?:doctor|physician|surgeon|medical practitioner)\b/i.test(original), credential: /\b(?:MBChB|MBBS|medical degree|HPCSA|registered medical practitioner)\b/i, experience: /\b(?:doctor|physician|surgeon|medical practitioner)\b/i },
    { applies: /\b(?:registered nurse|professional nurse|nurse practitioner)\b/i.test(original), credential: /\b(?:SANC|South African Nursing Council|registered (?:professional )?nurse)\b/i, experience: /\b(?:registered nurse|professional nurse|nurse practitioner)\b/i },
    { applies: /\b(?:mechanical|electrical|civil|chemical|industrial|professional)\s+engineer\b/i.test(original), credential: /\b(?:BEng|BSc|BTech|bachelor)[^.]{0,60}\b(?:engineering|engineer)\b|\b(?:Pr\.?\s*Eng\.?|ECSA)\b/i, experience: /\b(?:mechanical|electrical|civil|chemical|industrial|professional)\s+engineer\b/i },
  ];
  const regulatedMismatch = required.some(rule => rule.applies && (!rule.credential.test(credentials) || !rule.experience.test(experience)));
  const targetDomain = roleDomain(original);
  const experienceDomains = new Set((candidate.experienceRoles || []).map(roleDomain).filter(Boolean));
  const domainMismatch = Boolean(targetDomain && experienceDomains.size && !experienceDomains.has(targetDomain));
  const aligned = !regulatedMismatch && !domainMismatch;
  const recommended = aligned ? original : primaryCvRole(candidate, original).slice(0, 120);
  return {
    target_role_aligned: aligned,
    original_target_role: original,
    recommended_search_role: recommended,
    user_message_banner: aligned ? null : `Your specified target role (${original}) does not align with the experience on your CV. Below, we have generated job matches tailored specifically to your true career background (${recommended}).`,
  };
}

export async function resolveValidatedSearchRole(input: { targetRole: string; candidate: JobScoringCandidate; apiKey?: string; model?: string }, validator: JobSearchDependencies['validate'] = validateTargetRoleWithGemini) {
  const deterministic = deterministicTargetRoleValidation(input.candidate, input.targetRole);
  let gemini: TargetRoleValidation | null = null;
  if (validator) try { gemini = await validator({ apiKey: input.apiKey, model: input.model, targetRole: input.targetRole, candidateEvidence: input.candidate }); } catch { /* Fail closed to deterministic CV evidence. */ }
  if (!deterministic.target_role_aligned) return deterministic;
  if (!gemini || gemini.target_role_aligned) return gemini ? { ...gemini, original_target_role: deterministic.original_target_role, recommended_search_role: deterministic.original_target_role, user_message_banner: null } : deterministic;
  const supported = new Set(candidateRoleSuggestions({ ...input.candidate, targetRole: '' }).map(item => item.title.toLowerCase()));
  for (const role of input.candidate.experienceRoles || []) supported.add(role.trim().toLowerCase());
  const recommended = supported.has(gemini.recommended_search_role.trim().toLowerCase()) ? gemini.recommended_search_role.trim() : primaryCvRole(input.candidate, input.targetRole);
  return { target_role_aligned: false, original_target_role: deterministic.original_target_role, recommended_search_role: recommended,
    user_message_banner: `Your specified target role (${deterministic.original_target_role}) does not align with the experience on your CV. Below, we have generated job matches tailored specifically to your true career background (${recommended}).` };
}

// One bounded request; two provider queries at a time. Never create vacancies.
export async function searchWithLocationFallback(input: SearchInput, search = searchTrustedJobBoards) {
  const requested = Math.max(1, Math.min(100, Math.round(input.limit ?? 10)));
  const minimumResults = Math.min(requested, Math.max(1, Math.round(input.minimumResults ?? 10)));
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
  if (combined.size < minimumResults) {
    // Two synonyms per batch avoids an unbounded board fan-out.
    for (let i = 0; i < roles.synonyms.length && combined.size < minimumResults; i += 2) await Promise.all(roles.synonyms.slice(i, i + 2).map(role => run(role, requestedLocation, 2)));
  }
  const locations = /johannesburg|pretoria|centurion|sandton|midrand/i.test(requestedLocation) ? ['Gauteng', 'South Africa'] : ['South Africa'];
  for (const location of locations) {
    if (combined.size >= requested) break;
    if (location.toLowerCase() !== requestedLocation.toLowerCase()) {
      await run(input.role, location, 3);
      if (combined.size < minimumResults && roles.synonyms.length) await run(roles.synonyms.find(role => /remote/i.test(role)) || roles.synonyms[0], location, 3);
    }
  }
  if (combined.size < minimumResults && hasEvidence && Date.now() < deadline) {
    // A lower relevance floor is not a waiver of mandatory credentials or seniority.
    minimumMatchScore = input.mode === 'recommendations' ? 60 : 30;
    const adjacent = roles.adjacent.length ? roles.adjacent : roles.synonyms.slice(0, 2);
    await Promise.all(adjacent.map(role => run(role, 'South Africa', 4, minimumMatchScore)));
  }
  const jobs = [...combined.values()].slice(0, requested);
  const fallbackApplied = searchTiers.some(item => item.tier > 1);
  const exhausted = !jobs.length;
  const searchNotice = [fallbackApplied ? 'Showing expanded job matches based on your target role skills and nationwide or remote opportunities.' : '',
    jobs.length > 0 && jobs.length < minimumResults ? `Found ${jobs.length} verified relevant ${jobs.length === 1 ? 'listing' : 'listings'} after exhausting available expanded searches; no vacancies were invented to reach the ${minimumResults}-result target.` : '',
    exhausted ? 'No verified eligible vacancies were returned after expanded searches. Use the job-board search links or try again later; no listings were invented.' : '',
    searchTiers.some(item => item.status === 'timeout' || item.status === 'unavailable') ? 'Some job sources were unavailable or reached the search time limit.' : ''].filter(Boolean).join(' ');
  return { jobs, query, queriedBoards: [...boards], boardSearchLinks: [...links.values()], fetchedCount, liveResults: jobs.length > 0,
    effectiveLocation, fallbackApplied, minimumMatchScore, searchTiers, searchNotice };
}

export function normalizeJobRequest(value: unknown) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return { keywords: (text(input.keywords) || text(input.query) || text(input.targetRole) || text(input.role)).slice(0, 120),
    location: (text(input.location) || [text(input.city), text(input.province)].filter(Boolean).join(', ')).slice(0, 100),
    cvText: (text(input.cvText) || text(input.text)).slice(0, 100_000),
    industry: text(input.industry).slice(0, 100), postedRange: text(input.postedRange).slice(0, 30),
    jobType: text(input.jobType).slice(0, 30), remoteOption: text(input.remoteOption).slice(0, 30),
    deepSearch: input.deepSearch === true || text(input.deepSearch).toLowerCase() === 'true' };
}

export async function searchCandidateJobs(input: Parameters<typeof searchManualJobs>[0] & { cvText?: string }, dependencies: JobSearchDependencies = defaultDependencies) {
  let candidate = candidateFromReport(input.report);
  if (input.cvText?.trim()) {
    const cv = extractCvDataFromText(input.cvText, 'candidate.txt');
    candidate = { targetRole: input.keywords || cv.personal.professionalTitle || '', summary: cv.summary,
      experienceRoles: cv.experiences.map(item => item.role), skills: cv.skills, systems: cv.toolsAndSoftware,
      credentials: [...cv.education.map(item => item.degree), ...cv.certifications.map(item => item.name)],
      yearsExperience: estimateCareerYears(cv.experiences), location: input.location || cv.personal.location };
  }
  if (!candidate.experienceRoles?.length && !candidate.skills?.length && !candidate.credentials?.length) throw new Error('Upload a readable CV or complete a CV review before requesting matches.');
  const originalTargetRole = input.keywords || candidate.targetRole || 'Professional';
  const validation = await resolveValidatedSearchRole({ targetRole: originalTargetRole, candidate, apiKey: input.apiKey, model: input.model }, dependencies.validate);
  const resultLimit = Math.max(10, Math.min(100, Math.round(input.limit ?? 10)));
  const result = await searchWithLocationFallback({ role: validation.recommended_search_role, location: input.location || candidate.location || 'South Africa',
    mode: 'candidate-options', limit: resultLimit, minimumResults: 10, includeAllBoards: input.deepSearch === true,
    experienceRoles: candidate.experienceRoles, expertise: [...candidate.skills || [], ...candidate.systems || []],
    credentials: candidate.credentials, yearsExperience: candidate.yearsExperience, adzunaAppId: input.adzunaAppId, adzunaAppKey: input.adzunaAppKey }, dependencies.search);
  let scored = null;
  try { scored = await dependencies.score({ apiKey: input.apiKey, model: input.model, candidateProfile: candidate, jobs: result.jobs }); } catch { /* Keep real listings and strict deterministic scores. */ }
  const calibrated = calibrateJobListingScores(candidate, scored || result.jobs).filter(job => job.match >= result.minimumMatchScore);
  const jobs = (calibrated.length ? calibrated : calibrateJobListingScores(candidate, result.jobs).filter(job => job.match >= result.minimumMatchScore)).slice(0, resultLimit).map(job => ({ ...job, isAiMatch: true }));
  return { ...result, jobs, targetRoleAligned: validation.target_role_aligned, originalTargetRole: validation.original_target_role,
    recommendedRole: validation.recommended_search_role, noticeBanner: validation.user_message_banner,
    roleSuggestions: candidateRoleSuggestions({ ...candidate, targetRole: originalTargetRole, location: input.location || candidate.location }), candidateProfile: candidate, liveResults: jobs.length > 0, scoring: scored ? 'gemini' : 'evidence-based-fallback', isFallback: !scored };
}

export async function searchManualJobs(input: {
  keywords: string; location: string; report?: unknown; apiKey?: string; model?: string;
  industry?: string; postedRange?: string; jobType?: string; remoteOption?: string; adzunaAppId?: string; adzunaAppKey?: string;
  limit?: number; deepSearch?: boolean;
}, dependencies: JobSearchDependencies = defaultDependencies) {
  const candidate = candidateFromReport(input.report);
  const role = input.keywords.trim().slice(0, 120) || candidate.targetRole;
  if (!role) throw new Error('Enter a job title to search.');
  const fitAvailable = Boolean(candidate.experienceRoles?.length || candidate.skills?.length || candidate.credentials?.length);
  const validation = fitAvailable ? await resolveValidatedSearchRole({ targetRole: role, candidate, apiKey: input.apiKey, model: input.model }, dependencies.validate)
    : { target_role_aligned: true, original_target_role: role, recommended_search_role: role, user_message_banner: null };
  const resultLimit = Math.max(20, Math.min(100, Math.round(input.limit ?? 50)));
  const result = await searchWithLocationFallback({
    role: validation.recommended_search_role, location: input.location.trim().slice(0, 100) || candidate.location || 'South Africa', mode: 'search', limit: resultLimit,
    minimumResults: 20, includeAllBoards: input.deepSearch === true,
    industry: input.industry, postedRange: input.postedRange, jobType: input.jobType, remoteOption: input.remoteOption,
    experienceRoles: candidate.experienceRoles, expertise: [...candidate.skills || [], ...candidate.systems || []],
    credentials: candidate.credentials, yearsExperience: candidate.yearsExperience,
    adzunaAppId: input.adzunaAppId, adzunaAppKey: input.adzunaAppKey,
  }, dependencies.search);
  let scored = null;
  if (fitAvailable && result.jobs.length) {
    try { scored = await dependencies.score({ apiKey: input.apiKey, model: input.model, candidateProfile: candidate, jobs: result.jobs,
      searchPreferences: { industry: input.industry, postedRange: input.postedRange } }); } catch { /* Keep real vacancies when AI is unavailable. */ }
  }
  const jobs = (fitAvailable ? calibrateJobListingScores(candidate, scored || result.jobs) : result.jobs)
    .map(job => ({ ...job, fitAvailable, isAiMatch: fitAvailable }));
  return { ...result, jobs, targetRoleAligned: validation.target_role_aligned, originalTargetRole: validation.original_target_role,
    recommendedRole: validation.recommended_search_role, noticeBanner: validation.user_message_banner,
    liveResults: jobs.length > 0, scoring: scored ? 'gemini' : 'evidence-based-fallback' };
}
