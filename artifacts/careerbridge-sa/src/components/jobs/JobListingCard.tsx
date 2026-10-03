import { ExternalLink, MapPin } from 'lucide-react';
import React from 'react';
import type { JobListing } from '@/types/job';
import { JobCardActions } from './JobCardActions';

export function JobListingCard({ job, onViewDetails, locked = false }: {
  job: JobListing;
  onViewDetails: () => void;
  locked?: boolean;
}) {
  return (
    <article className="relative box-border flex w-full min-w-0 max-w-full flex-col gap-4 overflow-hidden [overflow-wrap:anywhere] rounded-2xl border border-slate-200/80 bg-white p-4 pt-14 shadow-sm transition hover:border-blue-200 hover:shadow-md sm:flex-row sm:p-6 sm:pt-14">
      <span className="absolute right-4 top-4 z-10 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold tabular-nums text-emerald-800">{typeof job.matchScore === 'number' ? `⚡ ${job.matchScore}% Match` : 'Match not assessed'}</span>
      <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-950 text-lg font-bold text-white sm:h-14 sm:w-14 sm:rounded-2xl">
          {!locked && job.logoUrl ? <img src={job.logoUrl} alt="" className="h-full w-full object-contain" /> : <span aria-hidden="true" className="text-sm font-black tracking-tight">{locked ? '?' : (job.company || job.sourceBoard).slice(0, 1).toUpperCase()}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="break-words text-sm font-bold leading-snug text-slate-950 sm:text-base">{locked ? 'Premium job match' : job.title}</h3>
                {!locked && job.isRemote ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700">Remote</span> : null}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                <span className={`break-words ${locked ? 'select-none blur-[3px]' : ''}`}>{locked ? 'Employer details locked' : job.company}</span>
                {!locked && job.location ? <span className="inline-flex items-center gap-1"><MapPin size={13} />{job.location}</span> : null}
                {job.postedDate && job.postedDate !== 'Date unavailable' ? <span className="text-slate-400">{job.postedDate}</span> : null}
              </p>
            </div>
          </div>
          {locked ? <p aria-hidden="true" className="mt-3 select-none blur-[3px] text-sm text-slate-500">Unlock to view the complete job description and application details.</p> : job.shortSnippet ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{job.shortSnippet}</p> : null}
          {!locked && job.skills.length ? <div className="mt-3 flex flex-wrap gap-1.5">{job.skills.slice(0, 6).map((skill) => <span key={skill} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">{skill}</span>)}</div> : null}
        </div>
      </div>
      <JobCardActions job={job} locked={locked} onViewDetails={onViewDetails} />
    </article>
  );
}

export function JobListingDetails({ job, loading = false }: { job: JobListing; loading?: boolean }) {
  const list = (title: string, items: string[]) => items.length ? <section className="mt-5"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-800">{title}</h4><ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-slate-600">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section> : null;
  return (
    <div className="min-w-0 max-w-full space-y-5 [overflow-wrap:anywhere]">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-blue-700">{job.sourceBoard}</p>
        <h3 className="mt-1 text-xl font-bold text-slate-950">{job.title}</h3>
        <p className="mt-1 text-sm text-slate-600">{[job.company, job.location, job.postedDate && job.postedDate !== 'Date unavailable' ? job.postedDate : null].filter(Boolean).join(' · ')}</p>
        {typeof job.matchScore === 'number' ? <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{job.matchScore}% CV match</span> : null}
      </div>
      <section className="border-t border-slate-100 pt-5"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-800">Job summary</h4><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{job.fullDescription || job.shortSnippet || 'This board did not provide a full description. Open the original listing for complete details.'}</p></section>
      <section><h4 className="text-xs font-bold uppercase tracking-wide text-slate-800">Salary</h4><p className="mt-2 text-sm text-slate-600">{job.salary || 'Not supplied by the job board'}</p></section>
      <section><h4 className="text-xs font-bold uppercase tracking-wide text-slate-800">Why this rate was given</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{job.matchReasoning || 'Detailed reasoning is unavailable for this saved match. Run a new CV review to refresh it.'}</p>
        {job.fitBreakdown ? <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">{Object.entries(job.fitBreakdown).filter(([, value]) => typeof value === 'number' && Number.isFinite(value)).map(([key, value]) => <div key={key} className="rounded bg-slate-50 p-2"><dt>{key === 'titleDomain' ? 'Role/domain' : key}</dt><dd className="mt-1 font-semibold">{value}/100</dd></div>)}</dl> : null}
      </section>
      {loading ? <p className="text-xs text-slate-500" role="status">Loading more details from the job board…</p> : null}
      {list('Key responsibilities', job.responsibilities)}
      {list('Requirements & qualifications', job.requirements)}
      {job.skills.length ? <section className="mt-5"><h4 className="text-xs font-bold uppercase tracking-wide text-slate-800">Skills</h4><div className="mt-2 flex flex-wrap gap-2">{job.skills.map((skill) => <span key={skill} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{skill}</span>)}</div></section> : null}
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
        {job.applicationUrl ? <><a href={job.applicationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-950 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800">Apply on job board <ExternalLink size={14} /></a><a href={job.applicationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">View on {job.sourceBoard}</a></> : <p className="text-xs text-slate-500">A direct application link was not provided for this listing.</p>}
      </div>
    </div>
  );
}
