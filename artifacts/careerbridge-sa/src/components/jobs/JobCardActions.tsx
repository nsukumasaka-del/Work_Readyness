import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import type { JobListing } from '../../types/job';

export function JobCardActions({ job, locked, onViewDetails, onUnlock }: { job: JobListing; locked: boolean; onViewDetails: () => void; onUnlock?: () => void }) {
  const [letterOpen, setLetterOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const draft = () => `Dear Hiring Team,\n\nI would like to apply for the ${job.title} position at ${job.company}. Please find my CV attached for your consideration.\n\n[Add a specific example from your experience that meets the advertised requirements.]\n\nKind regards,\n[Your name]`;
  const [letter, setLetter] = useState('');
  return <aside className="grid min-w-0 grid-cols-2 gap-2 border-t border-slate-100 pt-3 md:flex md:flex-col md:border-l md:border-t-0 md:pl-4 md:pt-0">
    <span className="max-w-full break-words rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">{locked ? 'Verified listing' : job.sourceBoard}</span>
    <button type="button" onClick={onViewDetails} className="min-h-10 text-xs font-semibold text-indigo-700 hover:text-indigo-900">View details ›</button>
    {locked ? <button type="button" onClick={onUnlock || onViewDetails} className="col-span-2 min-h-10 rounded-lg border border-amber-300 bg-amber-400 px-3 py-2 text-xs font-bold text-amber-950 hover:bg-amber-500">Unlock Match for R20</button> : null}
    {!locked ? <button type="button" onClick={() => { setLetter(draft()); setCopyStatus(''); setLetterOpen(true); }} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cover Letter</button> : null}
    {!locked && job.applicationUrl ? <a href={job.applicationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-950 px-3 py-2 text-center text-xs font-bold text-white hover:bg-slate-800">Apply on job board ↗</a> : null}
    <Dialog open={letterOpen && !locked} onOpenChange={open => { setLetterOpen(open); if (!open) setCopyStatus(''); }}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto">
        <DialogHeader><DialogTitle>Cover letter draft</DialogTitle><DialogDescription>Personalise this draft with factual examples before using it. Nothing is submitted automatically.</DialogDescription></DialogHeader>
        <>
          <label className="text-xs font-semibold" htmlFor={`letter-${job.id}`}>Your cover letter</label>
          <textarea id={`letter-${job.id}`} value={letter} onChange={event => setLetter(event.target.value)} className="min-h-64 w-full rounded border border-slate-200 p-3 text-sm" />
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(letter); setCopyStatus('Copied.'); } catch { setCopyStatus('Select the draft and copy it manually.'); } }} className="rounded bg-slate-950 p-2 text-sm text-white">Copy draft</button>
          <p role="status" className="text-xs">{copyStatus}</p>
        </>
      </DialogContent>
    </Dialog>
  </aside>;
}
