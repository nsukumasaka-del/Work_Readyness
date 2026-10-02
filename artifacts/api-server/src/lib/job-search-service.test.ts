import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateFromReport, searchManualJobs, searchWithLocationFallback } from './job-search-service';
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
});
test('manual search works before CV review without asserting a fit score', async () => {
  const response = await searchManualJobs({ keywords: 'Engineer', location: 'Gauteng' }, { search: async () => result([job]), score: async () => { throw new Error('must not score'); } });
  assert.equal(response.jobs[0].fitAvailable, false);
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
