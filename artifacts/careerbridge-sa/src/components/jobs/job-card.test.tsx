import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JobListingCard, JobListingDetails } from './JobListingCard';
import { MatchCountBanner } from './MatchCountBanner';
import type { JobListing } from '../../types/job';
import type { JobMatch } from '@workspace/api-client-react';
const job: JobListing = { id: '1', title: 'Clerk', company: 'Employer', location: 'Gauteng', isRemote: true, postedDate: 'Today', sourceBoard: 'PNet', shortSnippet: 'Office tasks', fullDescription: '', requirements: [], responsibilities: [], skills: ['Excel'], matchScore: 88, applicationUrl: 'https://www.pnet.co.za/jobs/1', matchReasoning: 'Relevant documented experience' };

test('shared card contains original content and right action stack', () => {
  const html = renderToStaticMarkup(createElement(JobListingCard, { job, onViewDetails() {} }));
  for (const text of ['Employer', 'Clerk', 'Remote', 'Gauteng', 'Today', 'Office tasks', 'Excel', 'PNet', 'View details', '88% Job Match', 'Cover Letter', 'Auto Apply PRO+', 'Auto Apply not connected']) assert.ok(html.includes(text), text);
  assert.match(html, /<aside/);
  assert.match(html, /absolute right-4 top-4/);
  assert.match(html, /88% Match/);
});

test('locked card retains score but does not expose employer, snippet or apply URL', () => {
  const html = renderToStaticMarkup(createElement(JobListingCard, { job, locked: true, onViewDetails() {} }));
  assert.match(html, /88% Job Match/);
  assert.match(html, /Unlock Match for R20/);
  assert.ok(!html.includes(job.applicationUrl!));
  assert.ok(!html.includes('Office tasks'));
  assert.ok(!html.includes('>Employer<'));
  assert.match(html, /blur-\[3px\]/);
  assert.match(html, /View details/);
});

test('detail content includes salary, requirements and score reasoning', () => {
  const html = renderToStaticMarkup(createElement(JobListingDetails, { job: { ...job, salary: 'R12,000 pm', requirements: ['Excel proficiency'], fitBreakdown: { skills: 80, titleDomain: 90, seniority: 70, location: 100 } } }));
  for (const text of ['R12,000 pm', 'Excel proficiency', 'Why this rate was given', 'Relevant documented experience', '80/100']) assert.ok(html.includes(text), text);
});

test('banner counts actual results and only scores of 50 or higher', () => {
  const html = renderToStaticMarkup(createElement(MatchCountBanner, { jobs: [{ match: 49 }, { match: 50 }, { match: 88 }] as JobMatch[], role: 'Customer Service' }));
  assert.match(html, /3 matches found/);
  assert.match(html, /2 high-score matches/);
  assert.match(html, /Customer Service/);
});
