import { useEffect, useState } from 'react';

const labels: Record<string, string> = { experiences: 'Work experience', education: 'Education', skillGroups: 'Skill groups', skills: 'Skills', toolsAndSoftware: 'Tools and software', competencies: 'Competencies', languages: 'Languages', references: 'References', referenceDetails: 'Reference contacts', projects: 'Projects', certifications: 'Certifications', sections: 'Additional information' };
function Content({ value }: { value: unknown }) {
  if (typeof value === 'string' || typeof value === 'number') return <p className="whitespace-pre-wrap break-words">{value}</p>;
  if (Array.isArray(value)) return <div className="space-y-3">{value.map((item, i) => <div key={i}><Content value={item} /></div>)}</div>;
  if (value && typeof value === 'object') return <div>{Object.entries(value).filter(([key]) => !['id', 'classification', 'source'].includes(key)).map(([key, item]) => <Content key={key} value={item} />)}</div>;
  return null;
}
export default function SharedCvPage() {
  const [data, setData] = useState<{ title: string; document: Record<string, unknown> } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex, nofollow';
    const referrer = document.createElement('meta');
    referrer.name = 'referrer'; referrer.content = 'no-referrer';
    document.head.append(robots, referrer);
    const controller = new AbortController();
    const token = window.location.pathname.split('/').pop();
    void fetch(`/api/career/cv/shared/${token}`, { signal: controller.signal, credentials: 'omit' }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'This CV is unavailable.');
      setData(body);
    }).catch(error => { if (error.name !== 'AbortError') setError(error.message); });
    return () => { controller.abort(); robots.remove(); referrer.remove(); };
  }, []);
  if (!data) return <main className="p-8 text-center" role="status">{error || 'Loading shared CV…'}</main>;
  const cv = data.document;
  return <main className="min-h-screen bg-slate-100 p-4 sm:p-8"><article className="mx-auto max-w-3xl space-y-5 bg-white p-6 text-slate-800 shadow sm:p-10">
    <header><h1 className="text-2xl font-bold"><Content value={cv.fullName} /></h1><Content value={cv.headline} /><Content value={cv.contactLine || [cv.email, cv.phone, cv.location].filter(Boolean).join(' · ')} /></header>
    <Content value={cv.summary} />
    {Object.entries(labels).map(([key, label]) => Array.isArray(cv[key]) && (cv[key] as unknown[]).length > 0 ? <section key={key}><h2 className="mb-3 border-b pb-1 font-bold">{label}</h2><Content value={cv[key]} /></section> : null)}
  </article></main>;
}
