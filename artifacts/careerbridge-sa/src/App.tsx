import { type ReactNode, type FormEvent, useMemo, useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  FileCheck2,
  FileText,
  Filter,
  HeartHandshake,
  Info,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  MessageCircle,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  X,
} from 'lucide-react';
import {
  getGetCareerOverviewQueryKey,
  getGetInterviewPrepQueryKey,
  getListJobsQueryKey,
  useApplyForCoaching,
  useCreateDiagnostic,
  useGetCareerOverview,
  useGetInterviewPrep,
  useListJobs,
} from '@workspace/api-client-react';
import type {
  CareerOverview,
  CoachingApplicationInput,
  DiagnosticReport,
  InterviewPrep,
  JobMatch,
} from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';
import {
  Link,
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/diagnostic', label: 'CV diagnostic', icon: FileCheck2 },
  { href: '/jobs', label: 'Job matches', icon: BriefcaseBusiness },
  { href: '/interview', label: 'Interview room', icon: MessageCircle },
  { href: '/coaching', label: 'Human coaching', icon: HeartHandshake },
];

function LogoMark() {
  return (
    <Link href="/" className="flex items-center gap-3" data-testid="link-logo">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] shadow-[4px_4px_0_hsl(var(--accent))]">
        <span className="display text-lg font-extrabold">C</span>
      </span>
      <span className="leading-none">
        <span className="display block text-base font-extrabold tracking-tight">CareerBridge</span>
        <span className="mono mt-1 block text-[9px] uppercase tracking-[0.25em] text-[hsl(var(--sidebar-foreground)/.6)]">South Africa</span>
      </span>
    </Link>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="noise min-h-[100dvh] bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-sidebar px-5 py-6 text-sidebar-foreground md:flex">
        <LogoMark />
        <div className="mt-16">
          <p className="mono mb-3 px-3 text-[9px] uppercase tracking-[0.24em] text-sidebar-foreground/45">Your next move</p>
          <nav className="space-y-1" aria-label="Primary navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location === item.href;
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold ${active ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-[3px_3px_0_hsl(var(--accent))]' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
                >
                  <Icon size={17} strokeWidth={active ? 2.5 : 1.8} />
                  <span>{item.label}</span>
                  {active && <ArrowRight className="ml-auto" size={14} />}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="mono text-[9px] uppercase tracking-[0.2em] text-sidebar-foreground/50">Advisor note</span>
            <Sparkles size={14} className="text-sidebar-primary" />
          </div>
          <p className="text-sm leading-5 text-sidebar-foreground/80">Good careers are built from evidence, not empty confidence.</p>
          <Link href="/coaching" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-sidebar-primary" data-testid="link-sidebar-coaching">
            Talk to a human <ArrowRight size={12} />
          </Link>
        </div>
      </aside>

      <div className="md:pl-[248px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md md:px-10">
          <div className="md:hidden"><LogoMark /></div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--accent))]" />
            <span className="mono text-[10px] uppercase tracking-[0.17em] text-muted-foreground">A practical career companion</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:block">Gauteng · Western Cape · KZN</span>
            <Link href="/coaching" className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary" data-testid="link-profile" aria-label="Open coaching intake">
              <UserRound size={16} />
            </Link>
            <button className="grid h-9 w-9 place-items-center rounded-lg border border-border md:hidden" onClick={() => setMenuOpen(!menuOpen)} data-testid="button-mobile-menu" aria-label="Toggle navigation">
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </header>
        {menuOpen && (
          <div className="absolute right-4 top-[68px] z-50 w-64 rounded-2xl border border-border bg-card p-2 shadow-xl md:hidden">
            {navItems.map((item) => <Link href={item.href} key={item.href} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold hover:bg-muted" data-testid={`link-mobile-${item.label.toLowerCase().replaceAll(' ', '-')}`}><item.icon size={16} />{item.label}</Link>)}
          </div>
        )}
        <main className="page-enter">{children}</main>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        <p className="mono mb-3 text-[10px] uppercase tracking-[0.25em] text-[hsl(var(--accent-foreground))]">{eyebrow}</p>
        <h1 className="display max-w-3xl text-4xl font-extrabold tracking-tight text-primary md:text-5xl">{title}</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, accent = 'yellow' }: { label: string; value: string | number; detail: string; icon: typeof Target; accent?: 'yellow' | 'coral' | 'teal' }) {
  const accents = {
    yellow: 'bg-secondary text-secondary-foreground',
    coral: 'bg-accent text-accent-foreground',
    teal: 'bg-primary text-primary-foreground',
  };
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[0_7px_0_hsl(var(--border)/.55)] transition-transform hover:-translate-y-1">
      <div className="mb-7 flex items-start justify-between">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${accents[accent]}`}><Icon size={17} /></span>
        <span className="mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Live signal</span>
      </div>
      <p className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end gap-2">
        <strong className="display text-4xl font-extrabold text-primary">{value}</strong>
        <span className="mb-1 text-xs text-muted-foreground">{detail}</span>
      </div>
    </div>
  );
}

function LoadingBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />;
}

function ErrorNotice({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[hsl(var(--destructive)/.3)] bg-[hsl(var(--destructive)/.06)] p-4 text-sm">
      <div className="flex items-center gap-3"><CircleAlert size={18} className="text-destructive" /><span>{label}</span></div>
      <button className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold hover:border-primary" onClick={onRetry} data-testid="button-retry">Try again</button>
    </div>
  );
}

function Home() {
  const [, setLocation] = useLocation();
  const overviewQuery = useGetCareerOverview({ query: { queryKey: getGetCareerOverviewQueryKey() } });
  const diagnostic = useCreateDiagnostic();
  const [fileName, setFileName] = useState('');
  const [role, setRole] = useState('');
  const overview = overviewQuery.data as CareerOverview | undefined;

  const submitDiagnostic = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fileName) return;
    diagnostic.mutate({ data: { fileName, role: role || undefined } }, {
      onSuccess: (report) => {
        sessionStorage.setItem('careerbridge-report', JSON.stringify(report));
        setLocation('/diagnostic');
      },
    });
  };

  return (
    <div>
      <section className="relative overflow-hidden bg-primary px-5 py-14 text-primary-foreground md:px-12 md:py-20">
        <div className="signal-grid absolute inset-0 opacity-25" />
        <div className="absolute -right-20 -top-32 h-96 w-96 rounded-full border-[42px] border-secondary/20" />
        <div className="relative mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div className="rise-in">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
              <span className="mono text-[9px] uppercase tracking-[0.2em] text-primary-foreground/75">Built for the South African market</span>
            </div>
            <h1 className="display max-w-2xl text-5xl font-extrabold leading-[.98] tracking-tight md:text-7xl">A clearer route to work that fits.</h1>
            <p className="mt-7 max-w-xl text-lg leading-7 text-primary-foreground/70">CareerBridge turns your CV, your context and your goals into a practical next move — with credible feedback, local opportunities and a human in your corner.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#cv-check" className="inline-flex items-center gap-2 rounded-xl bg-secondary px-5 py-3.5 text-sm font-bold text-secondary-foreground shadow-[4px_4px_0_hsl(var(--accent))] hover:-translate-y-0.5" data-testid="link-start-cv-check">Start with your CV <ArrowRight size={16} /></a>
              <Link href="/jobs" className="inline-flex items-center gap-2 rounded-xl border border-primary-foreground/25 px-5 py-3.5 text-sm font-bold text-primary-foreground hover:bg-primary-foreground/10" data-testid="link-browse-jobs">Browse SA jobs</Link>
            </div>
            <div className="mt-10 flex items-center gap-5 text-xs text-primary-foreground/55">
              <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-secondary" />No inflated promises</span>
              <span className="flex items-center gap-2"><LockKeyhole size={14} className="text-secondary" />Your data stays yours</span>
            </div>
          </div>
          <div id="cv-check" className="rise-in delay-1 rounded-3xl border border-primary-foreground/15 bg-primary-foreground/[.07] p-5 backdrop-blur-sm md:p-7">
            <div className="mb-6 flex items-start justify-between">
              <div><p className="mono text-[10px] uppercase tracking-[.22em] text-secondary">First step</p><h2 className="display mt-2 text-2xl font-bold">Let’s read your CV properly.</h2></div>
              <FileText size={24} className="text-primary-foreground/55" />
            </div>
            <form onSubmit={submitDiagnostic} className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-primary-foreground/65">Upload your current CV</span>
                <span className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-4 ${fileName ? 'border-secondary bg-secondary/10' : 'border-primary-foreground/25 bg-primary-foreground/5 hover:border-secondary'}`}>
                  <input type="file" accept=".pdf,.doc,.docx" className="sr-only" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? '')} data-testid="input-cv-file" />
                  <FileText size={18} className={fileName ? 'text-secondary' : 'text-primary-foreground/50'} />
                  <span className="min-w-0 flex-1 truncate text-sm text-primary-foreground/75">{fileName || 'PDF or Word document'}</span>
                  {fileName ? <CheckCircle2 size={17} className="text-secondary" /> : <span className="rounded-lg bg-primary-foreground/10 px-2 py-1 text-[10px] font-bold">Choose</span>}
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-primary-foreground/65">Role you are targeting <span className="font-normal opacity-60">(optional)</span></span>
                <input value={role} onChange={(event) => setRole(event.target.value)} placeholder="e.g. Operations coordinator" className="w-full rounded-xl border border-primary-foreground/20 bg-primary-foreground/10 px-4 py-3 text-sm text-primary-foreground outline-none placeholder:text-primary-foreground/35 focus:border-secondary focus:ring-2 focus:ring-secondary/20" data-testid="input-target-role" />
              </label>
              {diagnostic.isError && <p className="text-xs text-[hsl(var(--accent))]">We couldn’t read that just now. Please try again.</p>}
              <button disabled={!fileName || diagnostic.isPending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3.5 text-sm font-bold text-secondary-foreground disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-submit-diagnostic">
                {diagnostic.isPending ? 'Reading your CV…' : 'Get my evidence report'} <ArrowRight size={16} />
              </button>
            </form>
            <p className="mt-4 text-center text-[11px] leading-4 text-primary-foreground/45">We look for what is clear, what is missing and what sounds unlike you.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 md:px-12 md:py-16">
        <div className="mb-7 flex items-end justify-between"><div><p className="mono text-[10px] uppercase tracking-[.22em] text-accent-foreground">Your signals</p><h2 className="display mt-2 text-3xl font-extrabold text-primary">A little clarity, every day.</h2></div><Link href="/diagnostic" className="hidden items-center gap-2 text-sm font-bold text-primary sm:flex" data-testid="link-view-signals">View your signals <ArrowRight size={15} /></Link></div>
        {overviewQuery.isError ? <ErrorNotice label="Your overview could not load." onRetry={() => overviewQuery.refetch()} /> : overviewQuery.isLoading ? <div className="grid gap-4 md:grid-cols-4"><LoadingBlock className="h-36" /><LoadingBlock className="h-36" /><LoadingBlock className="h-36" /><LoadingBlock className="h-36" /></div> : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <MetricCard label="CV diagnostic" value={overview?.diagnosticScore ?? '—'} detail="/100" icon={FileCheck2} accent="yellow" />
            <MetricCard label="Relevant matches" value={overview?.jobMatchCount ?? '—'} detail="roles" icon={Target} accent="coral" />
            <MetricCard label="Interview practice" value={overview?.interviewProgress ?? '—'} detail="complete" icon={ClipboardCheck} accent="teal" />
            <MetricCard label="Latest role" value={overview?.latestRole ?? '—'} detail="" icon={BriefcaseBusiness} accent="yellow" />
          </div>
        )}
      </section>

      <section className="border-y border-border bg-[hsl(var(--muted)/.45)] px-5 py-14 md:px-12">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[.8fr_1.2fr] md:items-start">
          <div><p className="mono text-[10px] uppercase tracking-[.22em] text-accent-foreground">How it works</p><h2 className="display mt-3 text-4xl font-extrabold leading-tight text-primary">No black box. Just useful next steps.</h2></div>
          <div className="grid gap-5 sm:grid-cols-3">
            {[['01', 'Read the evidence', 'We check the signals recruiters actually see: clarity, proof, and fit.'], ['02', 'Make a focused move', 'Choose from local roles and prompts that match your real experience.'], ['03', 'Build with support', 'Practice the conversation, then bring the hard parts to a human coach.']].map(([number, title, copy]) => <div key={number} className="border-t-2 border-primary pt-4"><span className="mono text-xs text-accent-foreground">{number}</span><h3 className="mt-4 text-base font-bold text-primary">{title}</h3><p className="mt-2 text-sm leading-5 text-muted-foreground">{copy}</p></div>)}
          </div>
        </div>
      </section>
    </div>
  );
}

function DiagnosticPage() {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [, setLocation] = useLocation();
  useEffect(() => {
    const stored = sessionStorage.getItem('careerbridge-report');
    if (stored) setReport(JSON.parse(stored) as DiagnosticReport);
  }, []);
  if (!report) {
    return <div className="mx-auto max-w-4xl px-5 py-16 md:px-12"><PageHeading eyebrow="CV diagnostic" title="Start with the document in front of you." description="Upload your CV on the overview page and we’ll return a grounded report: what feels authentic, what an ATS may miss, and what to edit next." action={<Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground" data-testid="link-upload-cv">Upload a CV <ArrowRight size={15} /></Link>} /><div className="signal-grid rounded-3xl border border-border p-10 text-center"><FileText className="mx-auto text-accent-foreground" size={38} /><h2 className="display mt-5 text-2xl font-bold text-primary">No report yet</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">A useful review starts with your actual CV, not a generic score.</p></div></div>;
  }
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 md:px-12 md:py-14">
      <PageHeading eyebrow="CV diagnostic · report ready" title="A CV people can trust." description={`${report.fileName} — here is what your document is communicating before anyone meets you.`} action={<button onClick={() => setLocation('/')} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-bold text-primary hover:border-primary" data-testid="button-review-another-cv"><PenLine size={15} /> Review another CV</button>} />
      <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <div className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-[7px_7px_0_hsl(var(--accent))] md:p-8">
          <div className="flex items-start justify-between"><div><p className="mono text-[10px] uppercase tracking-[.2em] text-primary-foreground/55">Your readout</p><p className="mt-5 display text-7xl font-extrabold">{report.authenticityScore}</p></div><ShieldCheck size={27} className="text-secondary" /></div>
          <p className="mt-2 text-lg font-semibold">Authenticity signal</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-primary-foreground/65">Does this sound like a real person with a clear point of view? Stronger proof beats bigger adjectives.</p>
          <div className="mt-9 border-t border-primary-foreground/15 pt-5"><div className="flex justify-between text-xs"><span className="text-primary-foreground/55">ATS discoverability</span><strong className="text-secondary">{report.atsScore}/100</strong></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-primary-foreground/15"><div className="h-full rounded-full bg-secondary transition-all duration-700" style={{ width: `${report.atsScore}%` }} /></div></div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <SignalList title="Phrases to question" subtitle="These may sound polished, but they hide your contribution." items={report.flaggedPhrases} tone="coral" />
          <SignalList title="Keywords to earn" subtitle="Add them only where your experience can prove them." items={report.missingKeywords} tone="yellow" />
        </div>
      </div>
      <section className="mt-10">
        <div className="mb-5 flex items-end justify-between"><div><p className="mono text-[10px] uppercase tracking-[.2em] text-accent-foreground">Human-first edits</p><h2 className="display mt-2 text-3xl font-extrabold text-primary">Three prompts worth your time.</h2></div><span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><Info size={14} /> No copy-paste templates</span></div>
        <div className="grid gap-4 md:grid-cols-3">{report.prompts.map((prompt, index) => <div key={`${prompt}-${index}`} className="group rounded-2xl border border-border bg-card p-5 hover:-translate-y-1 hover:shadow-lg"><span className="mono text-xs text-accent-foreground">0{index + 1}</span><p className="mt-5 text-[15px] font-semibold leading-6 text-primary">{prompt}</p><button className="mt-7 flex items-center gap-2 text-xs font-bold text-muted-foreground group-hover:text-primary" onClick={() => navigator.clipboard?.writeText(prompt)} data-testid={`button-copy-prompt-${index}`}>Copy prompt <ArrowRight size={13} /></button></div>)}</div>
      </section>
    </div>
  );
}

function SignalList({ title, subtitle, items, tone }: { title: string; subtitle: string; items: string[]; tone: 'coral' | 'yellow' }) {
  return <div className="rounded-3xl border border-border bg-card p-6"><div className={`mb-4 h-2 w-10 rounded-full ${tone === 'coral' ? 'bg-accent' : 'bg-secondary'}`} /><h3 className="text-base font-bold text-primary">{title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{subtitle}</p><div className="mt-5 space-y-2">{items.length ? items.map((item) => <div key={item} className="flex gap-2 rounded-xl bg-muted/70 px-3 py-2.5 text-xs font-medium text-primary"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-foreground" />{item}</div>) : <p className="text-xs text-muted-foreground">Nothing flagged here — keep that clarity.</p>}</div></div>;
}

function JobsPage() {
  const [search, setSearch] = useState('');
  const [location, setJobLocation] = useState('');
  const [sector, setSector] = useState('');
  const params = useMemo(() => ({ location: location || undefined, sector: sector || undefined }), [location, sector]);
  const jobsQuery = useListJobs(params, { query: { queryKey: getListJobsQueryKey(params) } });
  const jobs = (jobsQuery.data as JobMatch[] | undefined) ?? [];
  const visibleJobs = jobs.filter((job) => `${job.title} ${job.company} ${job.location} ${job.sector} ${job.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="mx-auto max-w-6xl px-5 py-10 md:px-12 md:py-14">
    <PageHeading eyebrow="Local job matches" title="Roles with a reason to look twice." description="Search the South African market by fit, not by desperation. Each match shows the evidence behind the recommendation." />
    <div className="mb-7 grid gap-3 rounded-2xl border border-border bg-card p-3 md:grid-cols-[1.4fr_.8fr_.8fr_auto]">
      <label className="flex items-center gap-3 rounded-xl bg-muted/70 px-3"><Search size={17} className="text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, company or skill" className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground" data-testid="input-job-search" /></label>
      <select value={location} onChange={(event) => setJobLocation(event.target.value)} className="rounded-xl border border-border bg-background px-3 py-3 text-sm font-medium outline-none focus:border-primary" data-testid="select-job-location"><option value="">All locations</option><option value="Johannesburg">Johannesburg</option><option value="Cape Town">Cape Town</option><option value="Durban">Durban</option></select>
      <select value={sector} onChange={(event) => setSector(event.target.value)} className="rounded-xl border border-border bg-background px-3 py-3 text-sm font-medium outline-none focus:border-primary" data-testid="select-job-sector"><option value="">All sectors</option><option value="Technology">Technology</option><option value="Finance">Finance</option><option value="Operations">Operations</option><option value="Marketing">Marketing</option></select>
      <button onClick={() => { setSearch(''); setJobLocation(''); setSector(''); }} className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary" data-testid="button-clear-filters"><Filter size={14} /> Clear</button>
    </div>
    {jobsQuery.isError ? <ErrorNotice label="Job matches are taking a moment to load." onRetry={() => jobsQuery.refetch()} /> : jobsQuery.isLoading ? <div className="space-y-3">{[1, 2, 3, 4].map((item) => <LoadingBlock key={item} className="h-32" />)}</div> : visibleJobs.length === 0 ? <div className="signal-grid rounded-3xl border border-border px-6 py-16 text-center"><BriefcaseBusiness className="mx-auto text-accent-foreground" size={32} /><h2 className="display mt-4 text-2xl font-bold text-primary">No close matches yet.</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Try a broader search, or return to your diagnostic to sharpen your role direction.</p><Link href="/diagnostic" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground" data-testid="link-jobs-to-diagnostic">Review my CV <ArrowRight size={15} /></Link></div> : <div className="space-y-3">{visibleJobs.map((job) => <JobCard key={job.id} job={job} />)}</div>}
    <p className="mt-5 text-center text-xs text-muted-foreground">{visibleJobs.length} role{visibleJobs.length === 1 ? '' : 's'} showing · match signals are directional, not promises</p>
  </div>;
}

function JobCard({ job }: { job: JobMatch }) {
  return <article className="group grid gap-5 rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[4px_4px_0_hsl(var(--border))] md:grid-cols-[1fr_auto] md:items-center" data-testid={`card-job-${job.id}`}>
    <div className="flex gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-secondary"><span className="display text-lg font-extrabold">{job.company.charAt(0)}</span></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-bold text-primary">{job.title}</h2><span className="rounded-full bg-secondary/60 px-2 py-0.5 mono text-[9px] font-bold text-secondary-foreground">{job.match}% fit</span></div><p className="mt-1 text-sm text-muted-foreground">{job.company} · {job.location} · {job.sector}</p><div className="mt-3 flex flex-wrap gap-1.5">{job.tags.map((tag) => <span key={tag} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">{tag}</span>)}</div></div></div>
    <div className="flex items-center justify-between gap-5 border-t border-border pt-4 md:block md:border-t-0 md:pt-0 md:text-right"><div><p className="text-sm font-bold text-primary">{job.salary}</p><p className="mt-1 text-[11px] text-muted-foreground">Posted {job.posted}</p></div><button className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary opacity-70 group-hover:opacity-100" onClick={() => navigator.clipboard?.writeText(`${job.title} at ${job.company}`)} data-testid={`button-save-job-${job.id}`}>Save role <HeartHandshake size={13} /></button></div>
  </article>;
}

function InterviewPage() {
  const interviewQuery = useGetInterviewPrep({ query: { queryKey: getGetInterviewPrepQueryKey() } });
  const [completed, setCompleted] = useState<number[]>([]);
  const prep = interviewQuery.data as InterviewPrep | undefined;
  const questions = prep?.questions ?? [];
  const completedCount = completed.length || prep?.completed || 0;
  return <div className="mx-auto max-w-6xl px-5 py-10 md:px-12 md:py-14">
    <PageHeading eyebrow="Interview room" title="Practice the answer behind the answer." description="Good preparation is not memorising a script. It is knowing which story to reach for when the question gets specific." action={<div className="rounded-2xl border border-border bg-card px-4 py-3"><p className="mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">Progress</p><p className="mt-1 text-lg font-bold text-primary">{completedCount}<span className="text-muted-foreground">/{prep?.total ?? '—'}</span></p></div>} />
    {interviewQuery.isError ? <ErrorNotice label="Interview prompts are not available right now." onRetry={() => interviewQuery.refetch()} /> : interviewQuery.isLoading ? <div className="grid gap-5 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <LoadingBlock key={item} className="h-56" />)}</div> : <div className="grid gap-5 lg:grid-cols-[.78fr_1.22fr]">
      <div className="rounded-3xl bg-secondary p-6 text-secondary-foreground md:p-8"><ClipboardCheck size={26} /><p className="mono mt-10 text-[10px] uppercase tracking-[.2em]">Before you start</p><h2 className="display mt-3 text-3xl font-extrabold leading-tight">Answer like a person, not a brochure.</h2><ul className="mt-7 space-y-4 text-sm leading-5"><li className="flex gap-3"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />Name the situation, not just the skill.</li><li className="flex gap-3"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />Show what changed because of your work.</li><li className="flex gap-3"><CheckCircle2 size={17} className="mt-0.5 shrink-0" />Say what you would do differently now.</li></ul><Link href="/coaching" className="mt-9 inline-flex items-center gap-2 text-sm font-bold underline underline-offset-4" data-testid="link-interview-coaching">Want a real person to listen? <ArrowRight size={14} /></Link></div>
      <div className="space-y-3">{questions.map((question, index) => <QuestionCard key={question.id} question={question} index={index} isComplete={completed.includes(question.id) || (completed.length === 0 && index < (prep?.completed ?? 0))} onComplete={() => setCompleted((current) => current.includes(question.id) ? current.filter((id) => id !== question.id) : [...current, question.id])} />)}</div>
    </div>}
  </div>;
}

function QuestionCard({ question, index, isComplete, onComplete }: { question: InterviewPrep['questions'][number]; index: number; isComplete: boolean; onComplete: () => void }) {
  const [open, setOpen] = useState(false);
  return <article className={`rounded-2xl border bg-card p-5 transition-all ${isComplete ? 'border-[hsl(var(--primary)/.35)]' : 'border-border'}`} data-testid={`card-interview-question-${question.id}`}>
    <div className="flex items-start gap-4"><button onClick={onComplete} className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${isComplete ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-transparent hover:border-primary'}`} data-testid={`button-complete-question-${question.id}`} aria-label={isComplete ? 'Mark question incomplete' : 'Mark question practiced'}><Check size={14} /></button><div className="min-w-0 flex-1"><p className="mono text-[10px] text-accent-foreground">QUESTION 0{index + 1}</p><h2 className={`mt-2 text-base font-bold leading-6 ${isComplete ? 'text-primary/60 line-through' : 'text-primary'}`}>{question.question}</h2><p className="mt-2 text-sm leading-5 text-muted-foreground">{question.context}</p></div><button onClick={() => setOpen(!open)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-primary" data-testid={`button-toggle-hint-${question.id}`} aria-label="Toggle hint">{open ? <ChevronDown size={17} /> : <Info size={17} />}</button></div>
    {open && <div className="ml-10 mt-4 rounded-xl bg-muted/70 p-3 text-xs leading-5 text-primary"><strong className="mr-1">Try this:</strong>{question.hint}</div>}
  </article>;
}

function CoachingPage() {
  const apply = useApplyForCoaching();
  const [submitted, setSubmitted] = useState<{ status: string; message: string } | null>(null);
  const [form, setForm] = useState<CoachingApplicationInput>({ name: '', email: '', experience: '', goals: '', paymentPlan: 'monthly' });
  const update = (key: keyof CoachingApplicationInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply.mutate({ data: form }, { onSuccess: (application) => setSubmitted(application) });
  };
  if (submitted) return <div className="mx-auto max-w-3xl px-5 py-20 text-center md:px-12"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-secondary text-secondary-foreground"><CheckCircle2 size={30} /></div><p className="mono mt-7 text-[10px] uppercase tracking-[.22em] text-accent-foreground">Application received</p><h1 className="display mt-3 text-4xl font-extrabold text-primary">A human will pick this up.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">{submitted.message || 'We will review your context and come back with the right next step.'}</p><Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground" data-testid="link-coaching-done">Back to overview <ArrowRight size={15} /></Link></div>;
  return <div className="mx-auto max-w-6xl px-5 py-10 md:px-12 md:py-14">
    <PageHeading eyebrow="Human coaching · 12 weeks" title="Bring the messy bit. We’ll make a plan." description="A structured three-month partnership for people who want thoughtful accountability, not another folder of generic advice." />
    <div className="grid gap-8 lg:grid-cols-[.85fr_1.15fr]">
      <div><div className="rounded-3xl bg-primary p-7 text-primary-foreground md:p-8"><HeartHandshake size={28} className="text-secondary" /><h2 className="display mt-8 text-3xl font-extrabold">Three months. One honest direction.</h2><div className="mt-8 space-y-5">{[['01', 'Week 1–2', 'Find the through-line in your experience and choose the roles worth your energy.'], ['02', 'Week 3–8', 'Strengthen your proof, applications and interview stories through live feedback.'], ['03', 'Week 9–12', 'Build a repeatable search rhythm you can keep after the programme ends.']].map(([number, title, copy]) => <div key={number} className="flex gap-4 border-t border-primary-foreground/15 pt-4"><span className="mono text-xs text-secondary">{number}</span><div><h3 className="text-sm font-bold">{title}</h3><p className="mt-1 text-xs leading-5 text-primary-foreground/60">{copy}</p></div></div>)}</div></div><div className="mt-4 flex gap-3 rounded-2xl border border-border bg-card p-4 text-xs leading-5 text-muted-foreground"><LockKeyhole size={16} className="mt-0.5 shrink-0 text-accent-foreground" />Your story is treated as private working material, not training data.</div></div>
      <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-6 shadow-[5px_5px_0_hsl(var(--border)/.65)] md:p-8"><div className="mb-7"><p className="mono text-[10px] uppercase tracking-[.2em] text-accent-foreground">A short intake</p><h2 className="display mt-2 text-2xl font-extrabold text-primary">Tell us what’s real right now.</h2></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Your name" value={form.name} onChange={(value) => update('name', value)} placeholder="Noluthando M." testId="input-coaching-name" required /><Field label="Email address" value={form.email} onChange={(value) => update('email', value)} placeholder="you@example.com" type="email" testId="input-coaching-email" required /></div><label className="mt-4 block"><span className="mb-2 block text-xs font-bold text-primary">Where are you in your career?</span><textarea required value={form.experience} onChange={(event) => update('experience', event.target.value)} placeholder="A few lines on your experience, current work or the transition you’re navigating." className="min-h-24 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10" data-testid="textarea-coaching-experience" /></label><label className="mt-4 block"><span className="mb-2 block text-xs font-bold text-primary">What would make 12 weeks worthwhile?</span><textarea required value={form.goals} onChange={(event) => update('goals', event.target.value)} placeholder="Be specific: a role, a better story, confidence in interviews, a plan." className="min-h-24 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10" data-testid="textarea-coaching-goals" /></label><div className="mt-5"><span className="mb-2 block text-xs font-bold text-primary">Payment preference</span><div className="grid gap-2 sm:grid-cols-2">{[['monthly', 'Monthly plan', 'R1,250 × 3'], ['upfront', 'Pay upfront', 'R3,375 total']].map(([value, label, price]) => <button type="button" key={value} onClick={() => update('paymentPlan', value)} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left ${form.paymentPlan === value ? 'border-primary bg-primary/5' : 'border-border'}`} data-testid={`button-payment-${value}`}><span><span className="block text-sm font-bold text-primary">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{price}</span></span><span className={`h-4 w-4 rounded-full border-4 ${form.paymentPlan === value ? 'border-secondary bg-primary' : 'border-border'}`} /></button>)}</div></div>{apply.isError && <p className="mt-4 text-xs text-destructive">We couldn’t submit this just now. Your details are still here — try again.</p>}<button disabled={apply.isPending} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-5 py-3.5 text-sm font-bold text-secondary-foreground disabled:opacity-50" data-testid="button-submit-coaching">{apply.isPending ? 'Sending your intake…' : 'Send my application'} <ArrowRight size={16} /></button><p className="mt-3 text-center text-[11px] text-muted-foreground">No payment is taken until your place is confirmed.</p></form>
    </div>
  </div>;
}

function Field({ label, value, onChange, placeholder, type = 'text', testId, required = false }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; testId: string; required?: boolean }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold text-primary">{label}</span><input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/10" data-testid={testId} /></label>;
}

function Router() {
  return <RoutedErrorBoundary><AppShell><Switch><Route path="/" component={Home} /><Route path="/diagnostic" component={DiagnosticPage} /><Route path="/jobs" component={JobsPage} /><Route path="/interview" component={InterviewPage} /><Route path="/coaching" component={CoachingPage} /><Route component={NotFound} /></Switch></AppShell></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;