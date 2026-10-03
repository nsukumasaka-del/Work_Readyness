import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import type { JobListing } from '../../types/job';

export function JobCardActions({ job, locked, onViewDetails }: { job: JobListing; locked: boolean; onViewDetails: () => void }) {
  const [panel, setPanel] = useState<'reason' | 'letter' | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [letter, setLetter] = useState(`Dear Hiring Team,\n\nI would like to apply for the ${job.title} position at ${job.company}. Please find my CV attached for your consideration.\n\n[Add a specific example from your experience that meets the advertised requirements.]\n\nKind regards,\n[Your name]`);
  return <aside className="flex min-w-0 flex-col items-start gap-2 border-t border-slate-100 pt-4 sm:w-44 sm:shrink-0 sm:items-end sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
    <span className="max-w-full break-words rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">{locked ? 'Verified listing' : job.sourceBoard}</span>
    <button type="button" onClick={onViewDetails} className="min-h-9 text-xs font-semibold text-blue-700">View details &gt;</button>
    {locked ? <button type="button" onClick={onViewDetails} className="min-h-9 rounded bg-blue-600 px-3 py-2 text-xs font-bold text-white">🔒 Unlock Match for R20</button> : null}
    <button type="button" onClick={() => locked ? onViewDetails() : setPanel('reason')} className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold tabular-nums text-emerald-800" aria-label="View job match reasoning">{typeof job.matchScore === 'number' ? `${job.matchScore}% Job Match` : 'Match not assessed'} ⓘ</button>
    <button type="button" disabled={locked} onClick={() => setPanel('letter')} className="min-h-9 rounded border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Cover Letter</button>
    {!locked && job.applicationUrl ? <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer" className="min-h-9 rounded bg-slate-950 px-3 py-2 text-xs font-bold text-white">Apply on job board ↗</a> : null}
    <button type="button" disabled title="Automatic application submission is not connected yet." className="min-h-9 rounded bg-indigo-600 px-3 py-2 text-xs font-bold text-white opacity-50">Auto Apply PRO+</button>
    <span className="text-[10px] text-slate-500">Auto Apply not connected</span>
    <Dialog open={panel !== null} onOpenChange={open => { if (!open) { setPanel(null); setCopyStatus(''); } }}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>{panel === 'letter' ? 'Cover letter draft' : 'Why this match score?'}</DialogTitle><DialogDescription>{panel === 'letter' ? 'Personalise this draft with factual examples before using it. Nothing is submitted automatically.' : job.title}</DialogDescription></DialogHeader>
        {panel === 'reason' ? <p className="whitespace-pre-wrap break-words text-sm leading-6">{job.matchReasoning || (typeof job.matchScore === 'number' ? 'This saved match does not include a detailed explanation. Run a new CV review to refresh its reasoning.' : 'Upload and review your CV to assess this listing against your documented qualifications.')}</p> : <>
          <label className="text-xs font-semibold" htmlFor={`letter-${job.id}`}>Your cover letter</label>
          <textarea id={`letter-${job.id}`} value={letter} onChange={event => setLetter(event.target.value)} className="min-h-64 w-full rounded border border-slate-200 p-3 text-sm" />
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(letter); setCopyStatus('Copied.'); } catch { setCopyStatus('Select the draft and copy it manually.'); } }} className="rounded bg-slate-950 p-2 text-sm text-white">Copy draft</button>
          <p role="status" className="text-xs">{copyStatus}</p>
        </>}
      </DialogContent>
    </Dialog>
  </aside>;
}
