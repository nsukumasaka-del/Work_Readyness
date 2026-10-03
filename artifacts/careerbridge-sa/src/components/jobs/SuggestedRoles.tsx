import { candidateRoleSuggestions } from '../../../../api-server/src/lib/candidate-role-suggestions';
import { objectData } from '../../lib/safe-data';

export function SuggestedRoles({ report }: { report: unknown }) {
  const data = objectData(report);
  const candidate = objectData(data.candidateProfile);
  const roles = candidateRoleSuggestions({ ...candidate, targetRole: candidate.targetRole || data.targetRole });
  return <section className="w-full min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
    <h3 className="text-sm font-bold text-slate-900">Suggested roles to explore</h3>
    <p className="mt-2 text-xs leading-5 text-slate-600">Verified vacancies aren’t available right now. These are search suggestions from your target role and CV evidence—not advertised jobs or confirmed qualification matches.</p>
    {roles.length ? <ul className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">{roles.map(role => <li key={role.id} className="min-w-0 rounded-lg border border-slate-200 p-3">
      <p className="break-words text-sm font-semibold text-slate-900">{role.title}</p>
      <p className="mt-1 text-xs text-slate-500">{role.location} · {role.basis === 'target-role' ? 'Your target role' : role.basis === 'experience' ? 'From your experience' : 'From your skills'}</p>
      <a href={`https://www.pnet.co.za/jobs?what=${encodeURIComponent(role.title)}&where=${encodeURIComponent(role.location)}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-xs font-semibold text-blue-700">Search current vacancies ↗</a>
    </li>)}</ul> : <p className="mt-4 text-sm text-slate-600">Add a target role or upload a CV to get personalised search suggestions.</p>}
  </section>;
}
