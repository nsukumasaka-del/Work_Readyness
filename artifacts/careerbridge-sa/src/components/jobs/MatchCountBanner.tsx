import type { JobMatch } from '@workspace/api-client-react';
import React from 'react';
export function MatchCountBanner({ jobs, role }: { jobs: JobMatch[]; role?: string }) {
  const high = jobs.filter(job => Number.isFinite(job.match) && job.match >= 50).length;
  return <div role="status" className="w-full min-w-0 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
    ⚡ {jobs.length} {jobs.length === 1 ? 'match' : 'matches'} found{role ? ` for ${role}` : ''} · {high} high-score {high === 1 ? 'match' : 'matches'} (50%+)
  </div>;
}
