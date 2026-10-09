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
    calls.push(input.location!); assert.equal(input.mode, 'recommendations'); return result(input.location === 'Gauteng' ? [{ ...job, match: 70 }] : []);
  });
  assert.deepEqual(calls, ['Pretoria', 'Gauteng', 'South Africa']);
  assert.equal(response.effectiveLocation, 'South Africa');
  assert.equal(response.fallbackApplied, true);
});

test('empty province search continues nationally without inventing vacancies', async () => {
  const calls: string[] = [];
  const response = await searchWithLocationFallback({ role: 'Lawyer', location: 'Johannesburg' }, async input => {
    calls.push(input.location!); return result([]);
  });
  assert.equal(calls[0], 'Johannesburg');
  assert.ok(calls.includes('Gauteng'));
  assert.ok(calls.includes('South Africa'));
  assert.deepEqual(response.jobs, []);
  assert.equal(response.effectiveLocation, 'South Africa');
});

test('public job payload aliases normalize null and object values', () => {
  assert.deepEqual(normalizeJobRequest({ query: ' Freight Controller ', city: 'Johannesburg', province: 'Gauteng', cvText: null }), {
    keywords: 'Freight Controller', location: 'Johannesburg, Gauteng', cvText: '', industry: '', postedRange: '', jobType: '', remoteOption: '', deepSearch: false,
  });
  assert.deepEqual(normalizeJobRequest(null), { keywords: '', location: '', cvText: '', industry: '', postedRange: '', jobType: '', remoteOption: '', deepSearch: false });
  assert.deepEqual(normalizeJobRequest({ query: {}, province: [] }), { keywords: '', location: '', cvText: '', industry: '', postedRange: '', jobType: '', remoteOption: '', deepSearch: false });
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

test('pilot aspiration is replaced with the primary CV role before any board query', async () => {
  const queriedRoles: string[] = [];
  const candidateProfile = { targetRole: 'Pilot', experienceRoles: ['Customer Service Representative'], skills: ['CRM', 'Customer enquiries'], credentials: ['Matric'] };
  const response = await searchManualJobs({ keywords: 'Pilot', location: 'Johannesburg', report: { candidateProfile } }, {
    search: async input => {
      queriedRoles.push(input.role);
      return result(Array.from({ length: 10 }, (_, index) => ({ ...job, id: index + 1, title: 'Customer Service Representative', sector: 'Customer Service', description: 'CRM customer enquiries', url: `https://www.pnet.co.za/jobs/customer-${index + 1}` })));
    },
    score: async input => input.jobs,
    validate: async () => ({ target_role_aligned: false, original_target_role: 'Pilot', recommended_search_role: 'Customer Service Representative', user_message_banner: 'mismatch' }),
  });
  assert.equal(queriedRoles[0], 'Customer Service Representative');
  assert.equal(response.targetRoleAligned, false);
  assert.equal(response.recommendedRole, 'Customer Service Representative');
  assert.match(response.noticeBanner || '', /Pilot.*Customer Service Representative/);
});

test('deterministic credential gate overrides a mistaken Gemini approval', async () => {
  let queriedRole = '';
  const candidateProfile = { targetRole: 'Pilot', experienceRoles: ['Customer Service Representative'], skills: ['CRM'], credentials: ['Matric'] };
  const response = await searchCandidateJobs({ keywords: 'Pilot', location: 'Gauteng', report: { candidateProfile } }, {
    search: async input => { queriedRole ||= input.role; return result([]); },
    score: async input => input.jobs,
    validate: async () => ({ target_role_aligned: true, original_target_role: 'Pilot', recommended_search_role: 'Pilot', user_message_banner: null }),
  });
  assert.equal(queriedRole, 'Customer Service Representative');
  assert.equal(response.targetRoleAligned, false);
  assert.equal(response.recommendedRole, 'Customer Service Representative');
});

test('aligned target role remains the board query', async () => {
  let queriedRole = '';
  const candidateProfile = { targetRole: 'Customer Service Representative', experienceRoles: ['Customer Service Representative'], skills: ['CRM'], credentials: ['Matric'] };
  const response = await searchManualJobs({ keywords: 'Customer Service Representative', location: 'Gauteng', report: { candidateProfile } }, {
    search: async input => { queriedRole ||= input.role; return result([]); },
    score: async input => input.jobs,
    validate: async () => ({ target_role_aligned: true, original_target_role: 'Customer Service Representative', recommended_search_role: 'Customer Service Representative', user_message_banner: null }),
  });
  assert.equal(queriedRole, 'Customer Service Representative');
  assert.equal(response.targetRoleAligned, true);
  assert.equal(response.noticeBanner, null);
});

test('partial city results broaden and merge up to ten distinct real listings', async () => {
  const calls: string[] = [];
  const response = await searchWithLocationFallback({ role: 'Customer Service', location: 'Johannesburg', limit: 10, mode: 'candidate-options' }, async input => {
    calls.push(input.location!);
    const count = input.location === 'Johannesburg' ? 3 : input.location === 'Gauteng' ? 7 : 12;
    return result(Array.from({ length: count }, (_, index) => ({ ...job, id: index + 1, title: `Customer Service Representative ${index + 1}`, match: 40 + index, url: `https://www.pnet.co.za/jobs/${index + 1}` })));
  });
  assert.equal(calls[0], 'Johannesburg');
  assert.ok(calls.includes('Gauteng'));
  assert.ok(calls.includes('South Africa'));
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

test('standard and premium searches enforce 50/100 limits and premium deep-board fan-out', async () => {
  const makeJobs = (count: number) => Array.from({ length: count }, (_, index) => ({
    ...job,
    id: index + 1,
    title: `Customer Service Representative ${index + 1}`,
    sector: 'Customer Service',
    match: 60,
    url: `https://www.pnet.co.za/jobs/customer-${index + 1}`,
    description: 'Customer support and CRM enquiries',
  }));
  const standard = await searchManualJobs({ keywords: 'Customer Service', location: 'South Africa', limit: 50 }, {
    search: async input => { assert.equal(input.limit, 50); assert.equal(input.includeAllBoards, false); return result(makeJobs(80)); },
    score: async () => { throw new Error('No CV means scoring is not called'); },
  });
  assert.equal(standard.jobs.length, 50);
  const premium = await searchManualJobs({ keywords: 'Customer Service', location: 'South Africa', limit: 100, deepSearch: true }, {
    search: async input => { assert.equal(input.limit, 100); assert.equal(input.includeAllBoards, true); return result(makeJobs(120)); },
    score: async () => { throw new Error('No CV means scoring is not called'); },
  });
  assert.equal(premium.jobs.length, 100);
});

test('manual search targets twenty results and forwards every server-side filter', async () => {
  let first = true;
  await searchManualJobs({ keywords: 'Customer Service', location: 'South Africa', industry: 'Customer Service', postedRange: 'week', jobType: 'Contract', remoteOption: 'remote' }, {
    search: async input => {
      if (first) {
        first = false;
        assert.equal(input.minimumResults, 20);
        assert.equal(input.industry, 'Customer Service');
        assert.equal(input.postedRange, 'week');
        assert.equal(input.jobType, 'Contract');
        assert.equal(input.remoteOption, 'remote');
      }
      return result([]);
    },
    score: async input => input.jobs,
  });
  assert.equal(first, false);
});

const assistant = { ...job, title: 'Administrative Assistant', sector: 'Administration', match: 55, description: 'Office administration, Excel and customer enquiries', tags: ['Excel'], url: 'https://www.pnet.co.za/jobs/assistant' };
const assistantInput = { role: 'Virtual Assistant', location: 'Johannesburg', limit: 10, mode: 'candidate-options' as const, experienceRoles: ['Office Administrator'], expertise: ['Excel', 'office administration'], yearsExperience: 3 };

test('Virtual Assistant review score of 45 does not gate discovery; synonyms yield real jobs', async () => {
  const calls: string[] = [];
  const response = await searchCandidateJobs({ keywords: 'Virtual Assistant', location: 'Johannesburg', report: { overallScore: 45, candidateProfile: { targetRole: 'Virtual Assistant', experienceRoles: assistantInput.experienceRoles, skills: assistantInput.expertise, yearsExperience: 3 } } }, {
    search: async input => { calls.push(input.role); return result(input.role === 'Administrative Assistant' ? [assistant] : []); }, score: async () => null,
  });
  assert.equal(calls[0], 'Virtual Assistant');
  assert.ok(calls.includes('Administrative Assistant'));
  assert.equal(response.jobs.length, 1);
  assert.equal(response.jobs[0].url, assistant.url);
  assert.match(response.searchNotice, /expanded job matches/);
  assert.ok(response.jobs[0].match <= assistant.match, 'no score inflation');
});

test('nationwide/remote search follows empty synonyms and preserves source metadata', async () => {
  const response = await searchWithLocationFallback(assistantInput, async input => ({ ...result(input.role === 'Remote Assistant' && input.location === 'South Africa' ? [{ ...assistant, title: 'Remote Assistant', location: 'Remote - South Africa' }] : []), queriedBoards: [input.role] }));
  assert.equal(response.jobs.length, 1);
  assert.ok(response.searchTiers.some(item => item.tier === 2));
  assert.ok(response.searchTiers.some(item => item.tier === 3 && item.role === 'Remote Assistant'));
  assert.ok(response.queriedBoards.includes('Virtual Assistant'));
});

test('adjacent evidence-based tier retains honest lower-fit jobs, deduplicated', async () => {
  const response = await searchWithLocationFallback(assistantInput, async input => result(input.minimumMatchScore === 30 && input.role === 'Office Administrator' ? [{ ...assistant, match: 32 }, { ...assistant, id: 123, match: 32, url: assistant.url + '#duplicate' }] : []));
  assert.equal(response.jobs.length, 1);
  assert.equal(response.jobs[0].match, 32);
  assert.equal(response.minimumMatchScore, 30);
  assert.ok(response.searchTiers.some(item => item.tier === 4));
});

test('provider failure continues fallback; total failure is honest and attempts all tiers', async () => {
  const recovered = await searchWithLocationFallback(assistantInput, async input => { if (input.role === 'Virtual Assistant') throw Error('429'); return result([assistant]); });
  assert.equal(recovered.jobs.length, 1);
  assert.match(recovered.searchNotice, /unavailable/);
  const empty = await searchWithLocationFallback(assistantInput, async () => result([]));
  assert.deepEqual(empty.jobs, []);
  assert.ok(empty.searchTiers.some(item => item.tier === 4));
  assert.match(empty.searchNotice, /no listings were invented/);
});

test('pre-scoring qualification filter triggers expansion, not a post-review empty screen', async () => {
  const response = await searchWithLocationFallback(assistantInput, async input => result(input.role === 'Virtual Assistant' ? [job] : [assistant]));
  assert.equal(response.jobs.length, 1);
  assert.equal(response.jobs[0].title, 'Administrative Assistant');
  assert.ok(response.fallbackApplied);
});

test('slow sources receive cancellation and do not hang the fallback chain', async () => {
  let aborted = false;
  const started = Date.now();
  const response = await searchWithLocationFallback({ role: 'Virtual Assistant', location: 'South Africa', limit: 1 }, async input => {
    if (input.role !== 'Virtual Assistant') return result([assistant]);
    return new Promise((_, reject) => input.signal!.addEventListener('abort', () => { aborted = true; reject(Error('aborted')); }, { once: true }));
  });
  assert.ok(aborted);
  assert.ok(Date.now() - started < 8000);
  assert.equal(response.jobs.length, 1);
  assert.ok(response.searchTiers.some(item => item.status === 'timeout'));
});

test('cancelling slow sources preserves listings already found by fast sources', async () => {
  const response = await searchWithLocationFallback({ ...assistantInput, limit: 1 }, async input => new Promise(resolve => {
    input.signal!.addEventListener('abort', () => resolve(result([assistant])), { once: true });
  }));
  assert.equal(response.jobs.length, 1);
  assert.equal(response.jobs[0].url, assistant.url);
  assert.equal(response.fallbackApplied, false);
});
