import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAccess } from '../artifacts/careerbridge-sa/src/lib/safe-data';
import { normalizeDiagnosticReport } from '../artifacts/careerbridge-sa/src/lib/diagnostic-data';
import { normalizeJobResults, toJobListing } from '../artifacts/careerbridge-sa/src/types/job';

test('malformed paid access cannot overwrite array defaults or grant access', () => {
  for (const value of [null, undefined, [], { ownedTemplateIds: null, unlockedJobIds: {}, adminBypass: 'true', megaAccessActive: true, megaAccessUntil: 'invalid' }]) {
    const access = normalizeAccess(value);
    assert.deepEqual(access.ownedTemplateIds, []);
    assert.deepEqual(access.unlockedJobIds, []);
    assert.equal(access.adminBypass, false);
    assert.equal(access.megaAccessActive, false);
  }
  assert.equal(normalizeAccess({ adminBypass: true }).adminBypass, true);
});

test('partial diagnostic normalizes nested lists and removes invalid rows', () => {
  const report = normalizeDiagnosticReport({ targetRole: {}, strengths: [null, { title: 'Readable', detail: 'Good' }], improvements: {}, relatedJobs: null,
    careerAdvisory: { primarySystems: null, skillGaps: {}, strongestFitSectors: [null, 'Logistics'] }, jobSearch: { queriedBoards: null } });
  assert.equal(report.targetRole, '');
  assert.equal(report.strengths.length, 1);
  assert.deepEqual(report.relatedJobs, []);
  assert.deepEqual(report.careerAdvisory?.primarySystems, []);
  assert.deepEqual(report.careerAdvisory?.strongestFitSectors, ['Logistics']);
  assert.deepEqual(report.jobSearch.queriedBoards, []);
});

test('failed or empty review response does not become a successful diagnostic', () => {
  for (const value of [null, [], {}, { success: false, data: [] }, { error: 'Unavailable' }]) assert.throws(() => normalizeDiagnosticReport(value));
});

test('malformed job lists and optional strings render without property exceptions', () => {
  assert.deepEqual(normalizeJobResults({}), []);
  const jobs = normalizeJobResults([null, {}, { id: 1, title: 'Assistant', tags: null, requirements: [null, 'Experience'], jobType: {}, applicationUrl: {} }]);
  assert.equal(jobs.length, 1);
  assert.deepEqual(toJobListing(jobs[0]).skills, []);
  assert.deepEqual(toJobListing(jobs[0]).requirements, ['Experience']);
});
