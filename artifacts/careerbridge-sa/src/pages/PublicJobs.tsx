import { ArrowRight, BriefcaseBusiness, CheckCircle2, FileCheck2, MapPin } from 'lucide-react';
import { Link, useParams } from 'wouter';
import { PUBLIC_JOB_CATEGORIES, findPublicJobCategory } from '@/content/public-jobs';
import NotFound from '@/pages/not-found';
import { AdSlot } from '@/components/AdSlot';

function JobBreadcrumbs({ current }: { current?: string }) {
  return <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground"><ol className="flex flex-wrap items-center gap-2"><li><Link href="/" className="hover:text-primary">Home</Link></li><li aria-hidden>/</li>{current ? <><li><Link href="/jobs/explore" className="hover:text-primary">Job guides</Link></li><li aria-hidden>/</li><li aria-current="page">{current}</li></> : <li aria-current="page">Job guides</li>}</ol></nav>;
}

export function PublicJobsIndexPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <JobBreadcrumbs />
      <header className="mt-8 max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">South African job guides</p><h1 className="display mt-3 text-4xl font-semibold leading-tight text-foreground md:text-5xl">Prepare for the roles you want to find.</h1><p className="mt-5 text-base leading-7 text-muted-foreground">Explore common role families, improve your application and use your CV to find current matches. These guides do not invent vacancies or reproduce unverified listings.</p></header>
      <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Job categories">
        {PUBLIC_JOB_CATEGORIES.map((category) => <article key={category.slug} className="flex flex-col border border-border bg-card p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary"><BriefcaseBusiness size={18} /></span><h2 className="mt-5 text-lg font-semibold text-foreground"><Link href={`/jobs/${category.slug}`} className="hover:text-primary">{category.name}</Link></h2><p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{category.description}</p><Link href={`/jobs/${category.slug}`} className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary">View guide <ArrowRight size={14} /></Link></article>)}
      </section>
      <AdSlot placement="jobs-feed" className="mt-10 min-h-24 w-full" />
      <section className="mt-14 border-y border-border py-9 md:flex md:items-center md:justify-between md:gap-8"><div><h2 className="text-2xl font-semibold text-foreground">Looking for vacancies matched to your CV?</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Upload your CV for a private review. BonList uses your target role, experience and preferred location to return relevant current listings.</p></div><Link href="/#cv-check" className="btn-primary mt-5 shrink-0 md:mt-0">Review your CV <ArrowRight size={14} /></Link></section>
    </div>
  );
}

export function PublicJobCategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const category = findPublicJobCategory(slug);
  if (!category) return <NotFound />;
  return (
    <div className="mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-16">
      <JobBreadcrumbs current={category.name} />
      <header className="mt-8 max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Job guide</p><h1 className="display mt-3 text-4xl font-semibold leading-tight text-foreground md:text-5xl">{category.title}</h1><p className="mt-5 text-base leading-7 text-muted-foreground">{category.description}</p></header>
      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <article className="space-y-10">
          <section><h2 className="text-2xl font-semibold text-foreground">About this type of work</h2><div className="mt-4 space-y-4">{category.overview.map((paragraph) => <p key={paragraph} className="text-[15px] leading-7 text-muted-foreground">{paragraph}</p>)}</div></section>
          <section><h2 className="text-2xl font-semibold text-foreground">Common role titles</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Vacancy titles differ between employers. Search related titles and check the responsibilities before applying.</p><ul className="mt-5 grid gap-3 sm:grid-cols-2">{category.roles.map((role) => <li key={role} className="flex items-center gap-2 border border-border bg-card px-4 py-3 text-sm font-medium text-foreground"><BriefcaseBusiness size={15} className="shrink-0 text-primary" />{role}</li>)}</ul></section>
          <section><h2 className="text-2xl font-semibold text-foreground">Skills employers may look for</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Only include skills you can demonstrate through work, training or credible projects.</p><ul className="mt-5 space-y-2">{category.skills.map((skill) => <li key={skill} className="flex gap-2 text-sm text-foreground"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-primary" />{skill}</li>)}</ul></section>
          <section><h2 className="text-2xl font-semibold text-foreground">Application checklist</h2><ul className="mt-5 space-y-3">{category.applicationTips.map((tip) => <li key={tip} className="flex gap-2.5 text-sm leading-6 text-foreground"><FileCheck2 size={16} className="mt-1 shrink-0 text-primary" />{tip}</li>)}</ul></section>
          <AdSlot placement="job-detail" className="min-h-24 w-full" />
        </article>
        <aside className="lg:sticky lg:top-24 lg:self-start"><div className="border border-border bg-card p-5"><MapPin size={20} className="text-primary" /><h2 className="mt-4 text-lg font-semibold text-foreground">Find current matches</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">BonList’s private job matcher searches using your CV review and selected location.</p><Link href="/#cv-check" className="btn-primary mt-5 w-full justify-center">Check your matches</Link></div><div className="mt-4 border border-border p-5"><h2 className="text-sm font-semibold text-foreground">Strengthen your application</h2><div className="mt-3 grid gap-2"><Link href="/career-advice/how-to-write-a-cv-in-south-africa" className="text-xs font-semibold text-primary hover:underline">How to write a CV</Link><Link href="/career-advice/how-to-make-your-cv-ats-friendly" className="text-xs font-semibold text-primary hover:underline">Make your CV ATS friendly</Link><Link href="/cv-builder?intake=1" className="text-xs font-semibold text-primary hover:underline">Build your CV</Link></div></div></aside>
      </div>
    </div>
  );
}
