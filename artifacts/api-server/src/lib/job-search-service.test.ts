import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateFromReport, normalizeJobRequest, searchCandidateJobs, searchManualJobs, searchWithLocationFallback } from './job-search-service';
import { normalizeJobSearchRole, type LiveJobListing } from './job-board-search';
import { parseGeminiJsonObject } from './ai/json-output';

const job: LiveJobListing = { id: 1, title: 'Principal Mechanical Engineer', company: 'Example', location: 'Gauteng', sector: 'Engineering', salary: '', match: 10, posted: '', tags: [], source: 'PNet', url: 'https://www.pnet.co.za/jobs/1', description: 'BEng and engineering management required' };
const result = (jobs: LiveJobListing[]) => ({ jobs, query: 'engineer', queriedBoards: ['PNet'], liveResults: jobs.length > 0, boardSearchLinks: [], fetchedCount: jobs.length });

test('structured JSON accepts fences and BOM but rejects malformed/non-object output', () => {
  assert.deepEqual(parseGeminiJsonObject('\uFEFF```json\n{"score":12}\n```'), { score: 12 });
  for (const value of ['not JSON', '[]', 'null', '{']) assert.throws(() => parseGeminiJsonObject(value));
});
test('provider search role does not contain compound headline or quotes', () => {
  assert.equal(normalizeJobSearchRole('"Customer Service" | Administration Officer'), 'Customer Service');
});
test('bad legacy profile fields cannot crash array processing', () => {
  const candidate = candidateFromReport({ candidateProfile: { skills: 'bad', experienceRoles: [null, 'Clerk'], yearsExperience: '20' } });
  assert.deepEqual(candidate.skills, []);
  assert.deepEqual(candidate.experienceRoles, ['Clerk']);
  assert.equal(candidate.yearsExperience, undefined);
});
test('manual search keeps real low-fit openings when AI rate limits and does not invent candidate skills', async () => {
  const candidateProfile = { experienceRoles: ['Customer Service Representative'], skills: ['CRM'], credentials: ['N3'], targetRole: 'Customer Service' };
  const response = await searchManualJobs({ keywords: 'Mechanical Engineer', location: 'Gauteng', report: { candidateProfile } }, {
    search: async input => { assert.equal(input.mode, 'search'); assert.deepEqual(input.expertise, ['CRM']); return result([job]); },
    score: async () => { throw new Error('429'); },
  });
  assert.equal(response.jobs.length, 1);
  assert.ok(response.jobs[0].match <= 20);
  assert.equal(response.scoring, 'evidence-based-fallback');
  assert.equal(response.jobs[0].isAiMatch, true, 'CV-scored manual results follow paid-access rules');
});
test('manual search works before CV review without asserting a fit score', async () => {
  const response = await searchManualJobs({ keywords: 'Engineer', location: 'Gauteng' }, { search: async () => result([job]), score: async () => { throw new Error('must not score'); } });
  assert.equal(response.jobs[0].fitAvailable, false);
  assert.equal(response.jobs[0].isAiMatch, false, 'unscored manual results remain free');
});
test('empty exact location broadens transparently while retaining recommendation gating', async () => {
  const calls: string[] = [];
  const response = await searchWithLocationFallback({ role: 'Engineer', location: 'Pretoria', mode: 'recommendations' }, async input => {
    calls.push(input.location!); assert.equal(input.mode, 'recommendations'); return result(input.location === 'Gauteng' ? [job] : []);
  });
  assert.deepEqual(calls, ['Pretoria', 'Gauteng']);
  assert.equal(response.effectiveLocation, 'Gauteng');
  assert.equal(response.fallbackApplied, true);
});

test('empty province search continues nationally without inventing vacancies', async () => {
  const calls: string[] = [];
  const response = await searchWithLocationFallback({ role: 'Lawyer', location: 'Johannesburg' }, async input => {
    calls.push(input.location!); return result([]);
  });
  assert.deepEqual(calls, ['Johannesburg', 'Gauteng', 'South Africa']);
  assert.deepEqual(response.jobs, []);
  assert.equal(response.effectiveLocation, 'South Africa');
});

test('public job payload aliases normalize null and object values', () => {
  assert.deepEqual(normalizeJobRequest({ query: ' Freight Controller ', city: 'Johannesburg', province: 'Gauteng', cvText: null }), {
    keywords: 'Freight Controller', location: 'Johannesburg, Gauteng', cvText: '',
  });
  assert.deepEqual(normalizeJobRequest(null), { keywords: '', location: '', cvText: '' });
  assert.deepEqual(normalizeJobRequest({ query: {}, province: [] }), { keywords: '', location: '', cvText: '' });
});

test('AI rate limits preserve aligned real listings and filter unqualified engineering matches', async () => {
  const report = { candidateProfile: { targetRole: 'Customer Service', experienceRoles: ['Customer Service Representative'], skills: ['CRM'], credentials: ['N3'] } };
  const response = await searchCandidateJobs({ keywords: 'Mechanical Engineer', location: 'Gauteng', report }, {
    search: async input => { assert.equal(input.mode, 'candidate-options'); return result([job]); },
    score: async () => { throw new Error('429'); },
  });
  assert.equal(response.isFallback, true);
  assert.deepEqual(response.jobs, []);
  assert.ok(response.roleSuggestions.length > 0);
  const aligned = { ...job, id: 2, title: 'Customer Service Representative', sector: 'Customer Service', match: 80, description: 'Customer service enquiries and CRM support', tags: ['CRM'] };
  const fallback = await searchCandidateJobs({ keywords: 'Customer Service', location: 'Gauteng', report }, {
    search: async () => result([aligned]), score: async () => { throw new Error('Malformed JSON'); },
  });
  assert.equal(fallback.jobs.length, 1);
  assert.equal(fallback.jobs[0].url, aligned.url);
  assert.equal(fallback.jobs[0].isAiMatch, true);
  assert.match(fallback.jobs[0].matchReasoning || '', /Evidence-based score/);
});

test('AI matching requires CV evidence rather than trusting request user privileges', async () => {
  await assert.rejects(searchCandidateJobs({ keywords: 'Lawyer', location: 'Gauteng', report: { user: { email: 'nsukumasaka@gmail.com' } } }), /Upload a readable CV/);
});

test('partial city results broaden and merge up to ten distinct real listings', async () => {
  const calls: string[] = [];
  const response = await searchWithLocationFallback({ role: 'Customer Service', location: 'Johannesburg', limit: 10, mode: 'candidate-options' }, async input => {
    calls.push(input.location!);
    const count = input.location === 'Johannesburg' ? 3 : input.location === 'Gauteng' ? 7 : 12;
    return result(Array.from({ length: count }, (_, index) => ({ ...job, id: index + 1, match: 40 + index, url: `https://www.pnet.co.za/jobs/${index + 1}` })));
  });
  assert.deepEqual(calls, ['Johannesburg', 'Gauteng', 'South Africa']);
  assert.equal(response.jobs.length, 10);
  assert.equal(new Set(response.jobs.map(job => job.url)).size, 10);
});

test('AI results retain lower-fit vacancies without inflating scores', async () => {
  const candidateProfile = { targetRole: 'Customer Service', experienceRoles: ['Customer Service Representative'], skills: ['CRM'] };
  const lower = { ...job, title: 'Customer Service Representative', sector: 'Customer Service', match: 40, description: 'CRM enquiries' };
  const response = await searchCandidateJobs({ keywords: 'Customer Service', location: 'South Africa', report: { candidateProfile } }, {
    search: async input => { assert.equal(input.limit, 10); return result([lower]); }, score: async () => null,
  });
  assert.equal(response.jobs.length, 1);
  assert.equal(response.jobs[0].match, 40);
});
