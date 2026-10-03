import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JobListingCard } from './JobListingCard';
import { MatchCountBanner } from './MatchCountBanner';
import type { JobListing } from '../../types/job';
import type { JobMatch } from '@workspace/api-client-react';
const job: JobListing = { id: '1', title: 'Clerk', company: 'Employer', location: 'Gauteng', isRemote: true, postedDate: 'Today', sourceBoard: 'PNet', shortSnippet: 'Office tasks', fullDescription: '', requirements: [], responsibilities: [], skills: ['Excel'], matchScore: 88, applicationUrl: 'https://www.pnet.co.za/jobs/1', matchReasoning: 'Relevant documented experience' };

test('shared card contains original content and right action stack', () => {
  const html = renderToStaticMarkup(createElement(JobListingCard, { job, onViewDetails() {} }));
  for (const text of ['Employer', 'Clerk', 'Remote', 'Gauteng', 'Today', 'Office tasks', 'Excel', 'PNet', 'View details', '88% Job Match', 'Cover Letter', 'Auto Apply PRO+', 'Auto Apply not connected']) assert.ok(html.includes(text), text);
  assert.match(html, /<aside/);
});

test('locked card retains score but does not expose employer, snippet or apply URL', () => {
  const html = renderToStaticMarkup(createElement(JobListingCard, { job, locked: true, onViewDetails() {} }));
  assert.match(html, /88% Job Match/);
  assert.match(html, /Unlock Match for R20/);
  assert.ok(!html.includes(job.applicationUrl!));
  assert.ok(!html.includes('Office tasks'));
  assert.ok(!html.includes('>Employer<'));
});

test('banner counts actual results and only scores of 50 or higher', () => {
  const html = renderToStaticMarkup(createElement(MatchCountBanner, { jobs: [{ match: 49 }, { match: 50 }, { match: 88 }] as JobMatch[], role: 'Customer Service' }));
  assert.match(html, /3 matches found/);
  assert.match(html, /2 high-score matches/);
  assert.match(html, /Customer Service/);
});
