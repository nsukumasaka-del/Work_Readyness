import type { JobMatch } from '@workspace/api-client-react';

export type JobListingSource = JobMatch & {
  matchReasoning?: string;
  matchRationale?: string;
  fitAvailable?: boolean;
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
  matchReasoning?: string;
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
    matchScore: job.fitAvailable === false ? undefined : job.match,
    matchReasoning: job.matchReasoning || job.matchRationale,
  };
}

export function normalizeJobResults(value: unknown): JobListingSource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || typeof item.title !== 'string' || !item.title.trim()) return [];
    const string = (key: string, fallback = '') => typeof item[key] === 'string' ? item[key] : fallback;
    const strings = (key: string) => Array.isArray(item[key]) ? item[key].filter((v: unknown) => typeof v === 'string') : [];
    return [{ ...item, id: Number.isFinite(Number(item.id)) ? Number(item.id) : 0,
      title: item.title, company: string('company', 'Employer not specified'), location: string('location'),
      sector: string('sector'), salary: string('salary'), posted: string('posted'), source: string('source', 'Job board'),
      url: string('url'), description: string('description'), fullDescription: string('fullDescription'), shortSnippet: string('shortSnippet'),
      applicationUrl: string('applicationUrl'), logoUrl: string('logoUrl'), employmentType: string('employmentType'), jobType: string('jobType'), remoteOption: string('remoteOption'),
      matchReasoning: string('matchReasoning') || string('matchRationale'), matchRationale: string('matchRationale'),
      match: typeof item.match === 'number' && Number.isFinite(item.match) ? Math.max(0, Math.min(100, item.match)) : 0,
      tags: strings('tags'), skills: strings('skills'), requirements: strings('requirements'), responsibilities: strings('responsibilities'),
    } as JobListingSource];
  });
}
