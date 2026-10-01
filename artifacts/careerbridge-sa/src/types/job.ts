import type { JobMatch } from '@workspace/api-client-react';

export type JobListingSource = JobMatch & {
  shortSnippet?: string;
  fullDescription?: string;
  requirements?: string[];
  responsibilities?: string[];
  skills?: string[];
  applicationUrl?: string;
  logoUrl?: string;
  isRemote?: boolean;
};

export type JobDetailsPayload = Pick<JobListingSource, 'fullDescription' | 'requirements' | 'responsibilities' | 'skills'>;

export interface JobListing {
  id: string;
  title: string;
  company: string;
  logoUrl?: string;
  location: string;
  isRemote: boolean;
  postedDate: string;
  sourceBoard: string;
  applicationUrl?: string;
  shortSnippet: string;
  fullDescription: string;
  requirements: string[];
  responsibilities: string[];
  skills: string[];
  matchScore?: number;
}

export function directApplicationUrl(job: { applicationUrl?: string; url?: string }): string | undefined {
  const raw = job.applicationUrl || job.url;
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function toJobListing(source: JobMatch): JobListing {
  const job = source as JobListingSource;
  const description = job.fullDescription?.trim() || job.description?.trim() || '';
  const snippet = job.shortSnippet?.trim() || job.description?.trim() || '';
  return {
    id: String(job.id),
    title: job.title,
    company: job.company,
    logoUrl: job.logoUrl,
    location: job.location,
    isRemote: job.isRemote ?? /\bremote\b/i.test(`${job.location} ${(job.tags || []).join(' ')}`),
    postedDate: job.posted,
    sourceBoard: job.source || 'Job board',
    applicationUrl: directApplicationUrl(job),
    shortSnippet: snippet,
    fullDescription: description,
    requirements: job.requirements || [],
    responsibilities: job.responsibilities || [],
    skills: job.skills?.length ? job.skills : (job.tags || []).filter((tag) => !/trusted board|jobmail|pnet|linkedin|indeed/i.test(tag)),
    matchScore: job.match,
  };
}
