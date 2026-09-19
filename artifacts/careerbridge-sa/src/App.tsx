import { type ReactNode, type FormEvent, useState, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  HeartHandshake,
  Info,
  Layers,
  Lock,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
  BookOpen,
} from 'lucide-react';
import {
  getGetInterviewPrepQueryKey,
  useApplyForCoaching,
  useGetInterviewPrep,
} from '@workspace/api-client-react';
import type {
  CoachingApplicationInput,
  DiagnosticReport,
  InterviewPrep,
  JobMatch,
  UserProfile,
} from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';
import { AdminRoute, trackPageVisit } from '@/pages/admin';
import PricingPage from '@/pages/pricing';
import ProgrammePage from '@/pages/programme';
import CvBuilderPage, { generateCv, persistGeneratedCv } from '@/pages/cv-builder';
import { SmokeyAgent } from '@/components/smokey-agent';
import {
  defaultEntitlement,
  fetchEntitlement,
  type Entitlement,
} from '@/lib/entitlements';
import { ensureCvProfile } from '@/lib/cv-profile';
import { buildParseUploadBody, readFileAsDataUrl } from '@/lib/cv-parse-upload';

import { isNativeApp } from '@/lib/platform';
import { describeApiMisconfiguration } from '@/lib/api-base';
import { triggerAndroidApkDownload } from '@/lib/download-apk';
import {
  clearAuthSession,
  dismissSecurityNudgeLocal,
  hasProfile as hasAuthProfile,
  getSessionToken,
  getAdminToken,
  isAdminUser as isAuthAdminUser,
  persistAdminAccess,
  persistProfile,
  readApiJson,
  readProfile,
  shouldShowSecurityNudge,
  authFetch,
} from '@/lib/auth-session';
import {
  AdminMfaSetupPage,
  AuthCallbackPage,
  ForgotPasswordPage,
  LoginPage,
  ResetPasswordPage,
  SecurityNudgeBanner,
  SecuritySettingsPage,
  SignupPage,
} from '@/pages/auth/AuthPages';
import {
  Link,
  Route,
  Switch,
  useLocation,
  useParams,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

const REPORT_KEY = 'careerbridge-report';
const SELECTED_JOB_KEY = 'careerbridge-selected-job';

function reportForCurrentViewer(report: DiagnosticReport): DiagnosticReport {
  if (isAuthAdminUser()) return report;
  return {
    ...report,
    relatedJobs: (report.relatedJobs || []).map((job, index) => job.match < 90 ? job : {
      id: -(index + 1), title: 'Premium job match', company: '', location: '',
      sector: '', salary: '', match: job.match, posted: '', tags: [],
      source: '', url: '', description: '',
    }),
  };
}

function persistSelectedJob(job: JobMatch) {
  sessionStorage.setItem(SELECTED_JOB_KEY, JSON.stringify(job));
}

function findJobFromSession(jobId: string): JobMatch | null {
  try {
    const selected = sessionStorage.getItem(SELECTED_JOB_KEY);
    if (selected) {
      const parsed = JSON.parse(selected) as JobMatch;
      if (String(parsed.id) === jobId && (isAuthAdminUser() || parsed.match < 90)) return parsed;
    }
  } catch {
    /* ignore */
  }
  try {
    const reportRaw = sessionStorage.getItem(REPORT_KEY);
    if (!reportRaw) return null;
    const report = reportForCurrentViewer(JSON.parse(reportRaw) as DiagnosticReport);
    return report.relatedJobs?.find((job) => String(job.id) === jobId) ?? null;
  } catch {
    return null;
  }
}

function applyHref(job: JobMatch): string | undefined {
  if (job.url) return job.url;
  const where = job.location.split('·')[0]?.trim() || 'South Africa';
  return `https://www.careerjunction.co.za/jobs?keywords=${encodeURIComponent(job.title)}&location=${encodeURIComponent(where)}`;
}

function BoardSearchLinks({ report }: { report: DiagnosticReport }) {
  const search = report.jobSearch as (typeof report.jobSearch & {
    boardSearchLinks?: Array<{ board: string; url: string }>;
  }) | undefined;
  const links = (search?.boardSearchLinks ?? []).filter((link) => {
    try {
      return new URL(link.url).protocol === 'https:';
    } catch {
      return false;
    }
  });
  if (!links.length) return null;
  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="text-xs font-semibold text-foreground">Search current openings on the job boards</p>
      <p className="mt-1 text-xs text-muted-foreground">Search or browse other trusted boards. These links are separate from the individual listings above.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {links.map((link) => (
          <a key={link.board} href={link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-secondary">
            {link.board} <ExternalLink size={12} />
          </a>
        ))}
      </div>
    </div>
  );
}

const navItems = [
  { href: '/', label: 'Tools' },
  { href: '/diagnostic', label: 'CV review', requiresProfile: true },
  { href: '/jobs', label: 'Matches', requiresCv: true },
  { href: '/interview', label: 'Interview' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/programme', label: 'Programme', requiresProfile: true },
  { href: '/cv-builder?intake=1', label: 'CV builder', requiresProfile: true },
  { href: '/coaching', label: 'Coaching' },
];

const primaryNavHrefs = new Set(['/', '/cv-builder', '/diagnostic', '/jobs', '/interview', '/pricing']);

function hasProfile() {
  return hasAuthProfile();
}

function isAdminUser() {
  return isAuthAdminUser();
}

function hasCvReport() {
  try {
    return Boolean(sessionStorage.getItem(REPORT_KEY) || sessionStorage.getItem('bonlist-report'));
  } catch {
    return false;
  }
}

function HeaderAuthActions({
  profileReady,
  profile,
  isAdmin,
  onLogout,
  compact = false,
}: {
  profileReady: boolean;
  profile: UserProfile | null;
  isAdmin: boolean;
  onLogout: () => void;
  compact?: boolean;
}) {
  if (profileReady && profile) {
    return (
      <div className={`flex items-center ${compact ? 'w-full flex-col gap-2' : 'gap-1.5 xl:gap-2'}`}>
        {isAdmin ? (
          <Link
            href="/admin"
            className={`rounded-xl border border-primary/20 bg-secondary px-2.5 py-2 text-sm font-semibold text-primary hover:border-primary/40 xl:px-3 ${
              compact ? 'w-full text-center' : ''
            }`}
            data-testid="link-header-admin-console"
          >
            <span className="xl:hidden">Admin</span>
            <span className="hidden xl:inline">Admin console</span>
          </Link>
        ) : null}
        <Link
          href="/profile"
          className={`inline-flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2 text-sm font-medium text-foreground hover:border-primary/30 xl:px-3 ${
            compact ? 'w-full justify-center py-2.5' : ''
          }`}
          data-testid="link-header-account"
          title="Candidate profile"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-primary">
            {profile.name.charAt(0).toUpperCase()}
          </span>
          <span className={compact ? 'max-w-[14rem] truncate font-medium' : 'hidden max-w-[7rem] truncate sm:inline xl:max-w-[9rem]'}>
            {compact ? profile.name : profile.name.split(' ')[0]}
          </span>
        </Link>
        <Link
          href="/settings/security"
          className={`rounded-xl px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground xl:px-3 ${
            compact ? 'w-full border border-border text-center' : 'hidden sm:inline'
          }`}
          data-testid="link-header-security"
        >
          Security
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className={`rounded-xl px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground xl:px-3 ${
            compact ? 'w-full border border-border' : ''
          }`}
          data-testid="button-header-logout"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center ${compact ? 'w-full flex-col gap-2' : 'gap-1.5 xl:gap-2'}`}>
      <Link
        href="/login"
        className={`rounded-xl px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted ${
          compact ? 'w-full border border-border text-center' : ''
        }`}
        data-testid="link-header-login"
      >
        Log in
      </Link>
      <Link
        href="/signup"
        className={`btn-primary ${compact ? 'w-full justify-center' : 'px-3.5 py-2 xl:px-4 xl:py-2.5'}`}
        data-testid="link-header-signup"
      >
        Sign up
      </Link>
    </div>
  );
}
function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center"
      data-testid="link-logo"
      aria-label="BonList home"
    >
      {compact ? (
        <img
          src="/brand/bonlist-mark.png"
          alt="BonList"
          className="h-9 w-9 object-contain"
          width={36}
          height={36}
        />
      ) : (
        <img
          src="/brand/bonlist-logo.png"
          alt="BonList - Your Shortcut to Getting Hired."
          className="h-9 w-auto max-w-[min(240px,56vw)] object-contain object-left sm:h-10"
          height={40}
        />
      )}
    </Link>
  );
}

interface GuideTopicContent {
  id: string;
  tabLabel: string;
  title: string;
  badge: string;
  tagline: string;
  ctaText: string;
  ctaHref: string;
  content: {
    sectionTitle: string;
    description: string;
    points: { label: string; text: string }[];
  }[];
}

const GUIDE_TOPICS: Record<string, GuideTopicContent> = {
  'how-to-write-a-resume': {
    id: 'how-to-write-a-resume',
    tabLabel: 'Writing a resume',
    title: 'How to Write an ATS-Friendly CV & Resume',
    badge: 'Enhancv & ATS Standards',
    tagline: 'Master the structure, wording, and keyword density that gets your CV past applicant tracking systems and into recruiters hands.',
    ctaText: 'Open AI Resume Builder',
    ctaHref: '/cv-builder?intake=1',
    content: [
      {
        sectionTitle: '1. Structure for ATS Direct-Text Parsing',
        description: 'Modern enterprise systems (Workday, Taleo, Greenhouse, SAP) require linear, transparent document layouts.',
        points: [
          { label: 'Standard Headings', text: 'Use universally recognized section headings: Professional Summary, Work Experience, Skills & Competencies, Education, Certifications.' },
          { label: 'No Trapped Text', text: 'Avoid placing your core work history in floating textboxes, vector illustrations, or nested graphic elements that ATS parsers skip.' },
          { label: 'Consistent Chronology', text: 'Format employment periods uniformly as "MMM YYYY  Present" or "YYYY  YYYY" to ensure clean tenure calculation.' }
        ]
      },
      {
        sectionTitle: '2. The High-Impact Bullet Formula',
        description: 'Recruiters scan bullet points in 6 to 8 seconds. Replace passive duty descriptions with active accomplishment statements.',
        points: [
          { label: 'Formula', text: '[Strong Action Verb] + [Specific Responsibility or Tool] + [Measurable Business Outcome or Metric].' },
          { label: 'Before', text: 'Responsible for managing social media accounts and customer emails.' },
          { label: 'After', text: 'Orchestrated customer engagement across 4 digital channels, increasing query resolution speed by 38% and user satisfaction to 96%.' }
        ]
      },
      {
        sectionTitle: '3. South African Market Context',
        description: 'Aligning with South African labor and corporate recruitment practices.',
        points: [
          { label: 'Privacy First', text: 'Protect sensitive personal data: do not include South African ID numbers, marital status, or full street addresses on public submissions.' },
          { label: 'Authentic Verification', text: 'Back every listed achievement with verifiable records. BonLists authenticity layer ensures 100% factual fidelity.' }
        ]
      }
    ]
  },
  'resume-format': {
    id: 'resume-format',
    tabLabel: 'Resume formats',
    title: 'Choosing the Right Resume & CV Format',
    badge: 'Layout Strategy',
    tagline: 'Match your career stage and industry with an optimized layout that emphasizes your strengths.',
    ctaText: 'Browse 8 Modern ATS Templates',
    ctaHref: '/cv-builder?panel=templates',
    content: [
      {
        sectionTitle: 'ATS Single-Column (Gold Standard)',
        description: 'The highest ATS compliance rate across enterprise corporate portals.',
        points: [
          { label: 'Best For', text: 'Corporate enterprises, banking, civil engineering, law, and traditional recruiting agencies.' },
          { label: 'Key Advantage', text: 'Zero parsing errors in legacy scanning software; perfectly chronological and easy for human hiring managers to skim.' }
        ]
      },
      {
        sectionTitle: 'Modern Two-Column (65/35 Split)',
        description: 'Visual balance with high information density.',
        points: [
          { label: 'Best For', text: 'Software developers, product managers, data analysts, and marketing leaders.' },
          { label: 'Key Advantage', text: 'Places rich technical skills, certifications, and languages in a dedicated side rail while giving maximum width to career milestones.' }
        ]
      },
      {
        sectionTitle: 'Executive Split & Technical Clean',
        description: 'Tailored for senior authority or systems architecture.',
        points: [
          { label: 'Executive Split', text: 'Highlights strategic scope, P&L governance, executive leadership, and board-level presentations.' },
          { label: 'Technical Clean', text: 'Structured for engineers, architects, and technical specialists emphasizing tech stacks, repository links, and production scale.' }
        ]
      }
    ]
  },
  'resume-summary': {
    id: 'resume-summary',
    tabLabel: 'Resume summary',
    title: 'Writing a Compelling Resume Summary',
    badge: 'Executive Positioning',
    tagline: 'Your professional summary is the elevator pitch that hooks hiring managers before they read your work history.',
    ctaText: 'Draft Summary with AI Writer',
    ctaHref: '/cv-builder?intake=1',
    content: [
      {
        sectionTitle: 'The 3-Sentence Blueprint',
        description: 'Keep your summary concise (50–80 words) and packed with evidence.',
        points: [
          { label: 'Sentence 1 (Identity)', text: 'State your professional title, years of experience, and core industry focus.' },
          { label: 'Sentence 2 (Specialty)', text: 'Highlight 2–3 core technical capabilities or methodologies you excel in.' },
          { label: 'Sentence 3 (Value)', text: 'Conclude with a standout metric, efficiency gain, or organizational impact you regularly deliver.' }
        ]
      },
      {
        sectionTitle: 'Example Summaries by Discipline',
        description: 'Proven templates for different career tracks.',
        points: [
          { label: 'Software Engineer', text: '"Full-Stack Software Engineer with 4+ years architecting scalable cloud services and reactive frontends in TypeScript and React. Proven track record reducing API latency by 45% and mentoring junior developers in automated testing."' },
          { label: 'Project Manager', text: '"PMP-certified Operations Specialist with 6+ years steering cross-functional initiatives across retail and fintech. Consistently delivered 10+ concurrent digital projects on time and 12% under budget."' }
        ]
      }
    ]
  },
  'one-page-resume': {
    id: 'one-page-resume',
    tabLabel: '1-page vs 2-page',
    title: 'How to Fit Your Experience on One or Two Pages',
    badge: 'Page Budgeting',
    tagline: 'Eliminate fluff, condense your timeline, and make every line earn its place on the page.',
    ctaText: 'Use Compact Single-Page Layout',
    ctaHref: '/cv-builder?panel=templates',
    content: [
      {
        sectionTitle: 'The Page Count Rules',
        description: 'When to stick to one page vs when two pages are appropriate.',
        points: [
          { label: '0–5 Years Experience', text: 'Keep strictly to 1 page. Hiring managers value brevity and focused relevance over exhaustive detail.' },
          { label: '5+ Years or Senior Leadership', text: '2 pages is standard in South Africa. Ensure page 1 contains your strongest achievements and current role.' },
          { label: 'Never 3+ Pages', text: 'Unless submitting an academic CV or comprehensive medical dossier, never exceed 2 pages for corporate applications.' }
        ]
      },
      {
        sectionTitle: 'Trimming Techniques That Work',
        description: 'Save 30% vertical space without losing substance.',
        points: [
          { label: 'Combine Older Roles', text: 'Group roles older than 7–10 years into single-line entries (Company, Title, Years) without extensive bullet points.' },
          { label: 'Remove Generic Soft Skills', text: 'Replace buzzword lists ("hard worker", "team player") with verifiable technical skills and tools.' },
          { label: 'Compact Margins', text: 'BonList’s Compact template utilizes 15mm margins and calibrated typography to maximize capacity elegantly.' }
        ]
      }
    ]
  },
  'interview-tips': {
    id: 'interview-tips',
    tabLabel: 'Interview guide',
    title: 'AI Mock Interview & STAR Technique Guide',
    badge: 'Interview Preparation',
    tagline: 'Prepare structured, confident answers to behavioral, situational, and technical questions.',
    ctaText: 'Start AI Mock Interview',
    ctaHref: '/interview',
    content: [
      {
        sectionTitle: 'Mastering the STAR Method',
        description: 'Structure every behavioral answer with clarity.',
        points: [
          { label: 'Situation', text: 'Set the scene in 1–2 sentences with company, team context, and the challenge encountered.' },
          { label: 'Task', text: 'Explain your specific mandate and goal in resolving the problem.' },
          { label: 'Action', text: 'Detail the concrete steps you took, tools utilized, and how you collaborated.' },
          { label: 'Result', text: 'Quantify the outcome, learnings gained, or value added to the company.' }
        ]
      }
    ]
  },
  'sa-trends': {
    id: 'sa-trends',
    tabLabel: 'SA hiring trends',
    title: 'South African Job Market & Hiring Insights',
    badge: 'Regional Intelligence',
    tagline: 'Key hiring dynamics, remote work patterns, and demanded skills across Gauteng, Western Cape, and KZN.',
    ctaText: 'Explore Verified Job Matches',
    ctaHref: '/jobs',
    content: [
      {
        sectionTitle: 'Market Dynamics in South Africa',
        description: 'Current employer preferences and high-growth sectors.',
        points: [
          { label: 'Tech & Financial Services', text: 'High demand for TypeScript, Python, AWS/Azure cloud, cybersecurity, and digital banking specialists.' },
          { label: 'Hybrid & Remote Flexibility', text: '68% of Gauteng and Cape Town technology roles offer hybrid or fully remote arrangements.' },
          { label: 'B-BBEE & Compliance', text: 'Work readiness programmes and certified credentials significantly accelerate employment velocity.' }
        ]
      }
    ]
  },
  'salary-insights': {
    id: 'salary-insights',
    tabLabel: 'Salary tips',
    title: 'Salary Negotiation & Compensation Benchmarks',
    badge: 'Compensation Strategy',
    tagline: 'How to research market bands and negotiate your package with confidence.',
    ctaText: 'Review Career Coaching Options',
    ctaHref: '/coaching',
    content: [
      {
        sectionTitle: 'Negotiation Fundamentals',
        description: 'Securing fair remuneration aligned with market rates.',
        points: [
          { label: 'Know Total Cost to Company (CTC)', text: 'In South Africa, offers are usually structured as CTC (including medical aid, provident fund, and travel allowances).' },
          { label: 'Timing Your Discussion', text: 'Discuss compensation after you have demonstrated clear mutual value in the second or final round.' }
        ]
      }
    ]
  },
  'career-gaps': {
    id: 'career-gaps',
    tabLabel: 'Career gaps',
    title: 'Framing Employment Gaps Positively',
    badge: 'Career Transition',
    tagline: 'Turn breaks into proof of resilience, self-directed learning, and purpose.',
    ctaText: 'Build Your Re-entry CV',
    ctaHref: '/cv-builder?intake=1',
    content: [
      {
        sectionTitle: 'Constructive Framing Strategies',
        description: 'Explain timeline pauses with clarity and forward momentum.',
        points: [
          { label: 'Be Honest & Brief', text: 'Address gaps in 1 clear sentence: personal sabbatical, caregiving, freelancing, or focused upskilling.' },
          { label: 'Highlight Active Growth', text: 'Mention courses completed, freelance contracts, community projects, or certifications earned.' }
        ]
      }
    ]
  }
};

function CareerGuideModal({
  topicId,
  onClose,
  onSelectTopic,
}: {
  topicId: string | null;
  onClose: () => void;
  onSelectTopic: (id: string) => void;
}) {
  const [, setLocation] = useLocation();
  if (!topicId) return null;
  const guide = GUIDE_TOPICS[topicId] || GUIDE_TOPICS['how-to-write-a-resume'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-8 animate-in fade-in duration-200">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {guide.badge}
            </span>
            <span className="text-xs text-muted-foreground">CareerBridge Expert Guide</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close guide"
          >
            <X size={18} />
          </button>
        </div>

        {/* Topic Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/60 bg-muted/30 px-6 py-2.5 text-xs">
          {Object.keys(GUIDE_TOPICS).map((key) => {
            const item = GUIDE_TOPICS[key];
            const active = item.id === guide.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTopic(item.id)}
                className={`shrink-0 rounded-lg px-2.5 py-1 font-medium transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {item.tabLabel}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto px-6 py-6 sm:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {guide.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {guide.tagline}
          </p>

          <div className="mt-6 space-y-6 divide-y divide-border/60">
            {guide.content.map((sec, idx) => (
              <div key={idx} className={idx === 0 ? '' : 'pt-6'}>
                <h3 className="text-base font-semibold text-foreground">
                  {sec.sectionTitle}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">{sec.description}</p>
                <div className="mt-3 space-y-2">
                  {sec.points.map((pt, pIdx) => (
                    <div key={pIdx} className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed">
                      <strong className="font-semibold text-foreground">{pt.label}: </strong>
                      <span className="text-muted-foreground">{pt.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              setLocation(guide.ctaHref);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95"
          >
            <span>{guide.ctaText}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cvReady, setCvReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<'resume' | 'tools' | null>(null);
  const [guideModalTopic, setGuideModalTopic] = useState<string | null>(null);
  const [mobileResumeOpen, setMobileResumeOpen] = useState(true);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const closeTimeoutRef = useRef<number | null>(null);
  const profileReady = Boolean(profile);

  const handleDropdownEnter = (menu: 'resume' | 'tools') => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setActiveDropdown(menu);
  };

  const handleDropdownLeave = () => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      setActiveDropdown(null);
    }, 180);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveDropdown(null);
        setGuideModalTopic(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setActiveDropdown(null);
    setMenuOpen(false);
    // Always land at the top of the new route (fixes empty screen after long pages like Diagnostic)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setCvReady(hasCvReport());
    setProfile(readProfile());
    setIsAdmin(isAdminUser());
    trackPageVisit(location || '/');
  }, [location]);

  useEffect(() => {
    const syncProfile = () => setProfile(readProfile());
    window.addEventListener('careerbridge-profile-updated', syncProfile);
    window.addEventListener('storage', syncProfile);
    return () => {
      window.removeEventListener('careerbridge-profile-updated', syncProfile);
      window.removeEventListener('storage', syncProfile);
    };
  }, []);

  const handleLogout = async () => {
    setLogoutError('');
    try {
      const response = await authFetch('/api/career/auth/logout', { method: 'POST', body: '{}' });
      if (!response.ok) throw new Error('Sign-out failed');
      clearAuthSession();
      queryClient.clear();
      setProfile(null);
      setIsAdmin(false);
      setMenuOpen(false);
      setLocation('/login');
    } catch {
      setLogoutError('Could not sign out. Please try again.');
    }
  };

  const [showNudge, setShowNudge] = useState(false);
  useEffect(() => {
    setShowNudge(Boolean(profile) && shouldShowSecurityNudge());
  }, [profile]);

  const isCvBuilder = location === '/cv-builder' || location.startsWith('/cv-builder/');
  const inNativeApp = isNativeApp();

  return (
    <div className={`min-h-[100dvh] bg-background text-foreground ${isCvBuilder ? 'flex flex-col' : ''}`}>
      {logoutError ? <p role="alert" className="bg-destructive px-5 py-2 text-center text-sm text-destructive-foreground">{logoutError}</p> : null}
      {showNudge ? (
        <SecurityNudgeBanner
          onSecure={() => {
            dismissSecurityNudgeLocal();
            setShowNudge(false);
            void authFetch('/api/career/auth/security-nudge/dismiss', { method: 'POST', body: '{}' }).catch(() => undefined);
            setLocation('/settings/security');
          }}
          onLater={() => {
            dismissSecurityNudgeLocal();
            setShowNudge(false);
            void authFetch('/api/career/auth/security-nudge/dismiss', { method: 'POST', body: '{}' }).catch(() => undefined);
          }}
        />
      ) : null}
      <header className="app-safe-header sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-5 md:px-8">
          <div className="min-w-0 shrink-0">
            <LogoMark />
          </div>

          {/* Desktop Enhancv-Style Control Panel Navigation */}
          <nav
            className="hidden min-w-0 items-center gap-1 lg:flex"
            aria-label="Primary navigation"
          >
            {/* Resume Mega-Menu Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => handleDropdownEnter('resume')}
              onMouseLeave={handleDropdownLeave}
            >
              <button
                type="button"
                onClick={() => setActiveDropdown(activeDropdown === 'resume' ? null : 'resume')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeDropdown === 'resume' || location === '/cv-builder' || location === '/diagnostic'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                }`}
                aria-expanded={activeDropdown === 'resume'}
                aria-haspopup="true"
              >
                <span>Resume</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${
                    activeDropdown === 'resume' ? 'rotate-180 text-foreground' : 'text-muted-foreground'
                  }`}
                />
              </button>

              {activeDropdown === 'resume' && (
                <div
                  className="absolute left-0 top-full z-50 w-[580px] max-w-[calc(100vw-2rem)] pt-2 animate-in fade-in-0 zoom-in-95 duration-150"
                  onMouseEnter={() => handleDropdownEnter('resume')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <div className="rounded-2xl border border-border/80 bg-popover p-5 text-popover-foreground shadow-[0_20px_50px_rgba(0,0,0,0.12)] backdrop-blur-xl">
                    <div className="grid grid-cols-[1.3fr_1fr] gap-6 divide-x divide-border/60">
                      {/* Left: Tools */}
                      <div className="flex flex-col gap-1 pr-2">
                        <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                          Tools
                        </p>

                        <Link
                          href="/cv-builder?intake=1"
                          onClick={() => setActiveDropdown(null)}
                          className="group flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-muted/70"
                          data-testid="link-nav-ai-resume-builder"
                        >
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                            <Sparkles size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              AI Resume Builder
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Helps you to land interviews
                            </div>
                          </div>
                        </Link>

                        <Link
                          href="/diagnostic"
                          onClick={() => setActiveDropdown(null)}
                          className="group flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-muted/70"
                          data-testid="link-nav-resume-checker"
                        >
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                            <FileCheck2 size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              Resume Checker
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Is your resume good enough?
                            </div>
                          </div>
                        </Link>

                        <Link
                          href="/cv-builder?panel=templates"
                          onClick={() => setActiveDropdown(null)}
                          className="group flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-muted/70"
                          data-testid="link-nav-resume-templates"
                        >
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 transition-colors group-hover:bg-sky-600 group-hover:text-white">
                            <Layers size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              Resume Templates
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Free and premium templates
                            </div>
                          </div>
                        </Link>

                        <Link
                          href="/cv-builder?intake=1"
                          onClick={() => setActiveDropdown(null)}
                          className="group flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-muted/70"
                          data-testid="link-nav-resume-examples"
                        >
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-colors group-hover:bg-amber-600 group-hover:text-white">
                            <FileText size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              Resume Examples
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Generate or explore
                            </div>
                          </div>
                        </Link>
                      </div>

                      {/* Right: Learning */}
                      <div className="flex flex-col gap-1 pl-6">
                        <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                          Learning
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDropdown(null);
                            setGuideModalTopic('how-to-write-a-resume');
                          }}
                          className="group flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/70 hover:text-primary"
                        >
                          <span>How to write a resume</span>
                          <ChevronRight size={14} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDropdown(null);
                            setGuideModalTopic('resume-format');
                          }}
                          className="group flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/70 hover:text-primary"
                        >
                          <span>Choosing a resume format</span>
                          <ChevronRight size={14} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDropdown(null);
                            setGuideModalTopic('resume-summary');
                          }}
                          className="group flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/70 hover:text-primary"
                        >
                          <span>Writing a resume summary</span>
                          <ChevronRight size={14} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDropdown(null);
                            setGuideModalTopic('one-page-resume');
                          }}
                          className="group flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/70 hover:text-primary"
                        >
                          <span>Fit your experience on one page</span>
                          <ChevronRight size={14} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tools Mega-Menu Dropdown */}
            <div
              className="relative"
              onMouseEnter={() => handleDropdownEnter('tools')}
              onMouseLeave={handleDropdownLeave}
            >
              <button
                type="button"
                onClick={() => setActiveDropdown(activeDropdown === 'tools' ? null : 'tools')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  activeDropdown === 'tools' || location === '/interview' || location === '/jobs' || location === '/coaching' || location === '/programme'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                }`}
                aria-expanded={activeDropdown === 'tools'}
                aria-haspopup="true"
              >
                <span>Tools</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform duration-200 ${
                    activeDropdown === 'tools' ? 'rotate-180 text-foreground' : 'text-muted-foreground'
                  }`}
                />
              </button>

              {activeDropdown === 'tools' && (
                <div
                  className="absolute -left-20 xl:left-0 top-full z-50 w-[580px] max-w-[calc(100vw-2rem)] pt-2 animate-in fade-in-0 zoom-in-95 duration-150"
                  onMouseEnter={() => handleDropdownEnter('tools')}
                  onMouseLeave={handleDropdownLeave}
                >
                  <div className="rounded-2xl border border-border/80 bg-popover p-5 text-popover-foreground shadow-[0_20px_50px_rgba(0,0,0,0.12)] backdrop-blur-xl">
                    <div className="grid grid-cols-[1.3fr_1fr] gap-6 divide-x divide-border/60">
                      {/* Left: Job Search */}
                      <div className="flex flex-col gap-1 pr-2">
                        <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                          Job Search & Career
                        </p>

                        <Link
                          href="/interview"
                          onClick={() => setActiveDropdown(null)}
                          className="group flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-muted/70"
                          data-testid="link-nav-interview-help"
                        >
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 transition-colors group-hover:bg-violet-600 group-hover:text-white">
                            <Bot size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              Interview Help
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Practice with AI mock interviews
                            </div>
                          </div>
                        </Link>

                        <Link
                          href="/jobs"
                          onClick={() => setActiveDropdown(null)}
                          className="group flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-muted/70"
                          data-testid="link-nav-job-matches"
                        >
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-colors group-hover:bg-blue-600 group-hover:text-white">
                            <BriefcaseBusiness size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              Job Matches
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Find roles that match you
                            </div>
                          </div>
                        </Link>

                        <Link
                          href="/coaching"
                          onClick={() => setActiveDropdown(null)}
                          className="group flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-muted/70"
                          data-testid="link-nav-career-coaching"
                        >
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 transition-colors group-hover:bg-rose-600 group-hover:text-white">
                            <HeartHandshake size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              Career Coaching
                            </div>
                            <div className="text-xs text-muted-foreground">
                              1-on-1 personalized mentorship
                            </div>
                          </div>
                        </Link>

                        <Link
                          href="/programme"
                          onClick={() => setActiveDropdown(null)}
                          className="group flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-muted/70"
                          data-testid="link-nav-work-readiness"
                        >
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors group-hover:bg-emerald-600 group-hover:text-white">
                            <ClipboardCheck size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              Work Readiness Programme
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Structured pathway to employment
                            </div>
                          </div>
                        </Link>
                      </div>

                      {/* Right: Learning & Resources */}
                      <div className="flex flex-col gap-1 pl-6">
                        <p className="px-3 pb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                          Learning
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDropdown(null);
                            setGuideModalTopic('interview-tips');
                          }}
                          className="group flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/70 hover:text-primary"
                        >
                          <span>Job Interview Guides</span>
                          <ChevronRight size={14} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDropdown(null);
                            setGuideModalTopic('sa-trends');
                          }}
                          className="group flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/70 hover:text-primary"
                        >
                          <span>Career Resources</span>
                          <ChevronRight size={14} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDropdown(null);
                            setGuideModalTopic('salary-insights');
                          }}
                          className="group flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/70 hover:text-primary"
                        >
                          <span>Job Interview Questions</span>
                          <ChevronRight size={14} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDropdown(null);
                            setGuideModalTopic('career-gaps');
                          }}
                          className="group flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/70 hover:text-primary"
                        >
                          <span>Career Advice & Support</span>
                          <ChevronRight size={14} className="text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Pricing Direct Link */}
            <Link
              href="/pricing"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                location === '/pricing'
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
              data-testid="link-nav-pricing"
            >
              Pricing
            </Link>
          </nav>

          {/* Right Header Actions */}
          <div className="flex shrink-0 items-center gap-2">
            {!inNativeApp ? (
            <button
              type="button"
              onClick={() => triggerAndroidApkDownload()}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-500/20 dark:text-emerald-200"
              data-testid="link-download-android-apk"
              title="Download BonList for Android"
            >
              <Smartphone size={14} />
              <span className="hidden md:inline">Download APK</span>
              <Download size={13} className="md:hidden" />
            </button>
            ) : null}
            <div className="hidden lg:flex">
              <HeaderAuthActions
                profileReady={profileReady}
                profile={profile}
                isAdmin={isAdmin}
                onLogout={handleLogout}
              />
            </div>
            <button
              className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card lg:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              data-testid="button-mobile-menu"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Enhancv-Style Accordion Menu */}
        {menuOpen && (
          <div className="max-h-[min(80vh,calc(100dvh-4rem))] overflow-y-auto border-t border-border bg-card px-4 py-4 lg:hidden animate-in slide-in-from-top-2 duration-200">
            {/* Resume Accordion */}
            <div className="border-b border-border/70 pb-3">
              <button
                type="button"
                onClick={() => setMobileResumeOpen(!mobileResumeOpen)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm font-bold text-foreground"
              >
                <span>Resume</span>
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-200 ${mobileResumeOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {mobileResumeOpen && (
                <div className="mt-2 space-y-3 pl-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tools</p>
                  <div className="space-y-1">
                    <Link
                      href="/cv-builder?intake=1"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted"
                    >
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Sparkles size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">AI Resume Builder</div>
                        <div className="text-xs text-muted-foreground">Helps you to land interviews</div>
                      </div>
                    </Link>

                    <Link
                      href="/diagnostic"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted"
                    >
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <FileCheck2 size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Resume Checker</div>
                        <div className="text-xs text-muted-foreground">Is your resume good enough?</div>
                      </div>
                    </Link>

                    <Link
                      href="/cv-builder?panel=templates"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted"
                    >
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                        <Layers size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Resume Templates</div>
                        <div className="text-xs text-muted-foreground">Free and premium templates</div>
                      </div>
                    </Link>

                    <Link
                      href="/cv-builder?intake=1"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted"
                    >
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <FileText size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Resume Examples</div>
                        <div className="text-xs text-muted-foreground">Generate or explore</div>
                      </div>
                    </Link>
                  </div>

                  <p className="pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Learning</p>
                  <div className="space-y-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setGuideModalTopic('how-to-write-a-resume');
                      }}
                      className="block w-full rounded-md px-2 py-1.5 text-left font-medium text-foreground hover:bg-muted"
                    >
                      How to write a resume
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setGuideModalTopic('resume-format');
                      }}
                      className="block w-full rounded-md px-2 py-1.5 text-left font-medium text-foreground hover:bg-muted"
                    >
                      Choosing a resume format
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setGuideModalTopic('resume-summary');
                      }}
                      className="block w-full rounded-md px-2 py-1.5 text-left font-medium text-foreground hover:bg-muted"
                    >
                      Writing a resume summary
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setGuideModalTopic('one-page-resume');
                      }}
                      className="block w-full rounded-md px-2 py-1.5 text-left font-medium text-foreground hover:bg-muted"
                    >
                      Fit your experience on one page
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tools Accordion */}
            <div className="border-b border-border/70 py-3">
              <button
                type="button"
                onClick={() => setMobileToolsOpen(!mobileToolsOpen)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-sm font-bold text-foreground"
              >
                <span>Tools</span>
                <ChevronDown
                  size={16}
                  className={`transition-transform duration-200 ${mobileToolsOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {mobileToolsOpen && (
                <div className="mt-2 space-y-3 pl-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Job Search</p>
                  <div className="space-y-1">
                    <Link
                      href="/interview"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted"
                    >
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                        <Bot size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Interview Help</div>
                        <div className="text-xs text-muted-foreground">Practice with AI mock interviews</div>
                      </div>
                    </Link>

                    <Link
                      href="/jobs"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted"
                    >
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <BriefcaseBusiness size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Job Matches</div>
                        <div className="text-xs text-muted-foreground">Find roles that match you</div>
                      </div>
                    </Link>

                    <Link
                      href="/coaching"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted"
                    >
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                        <HeartHandshake size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Career Coaching</div>
                        <div className="text-xs text-muted-foreground">1-on-1 personalized mentorship</div>
                      </div>
                    </Link>

                    <Link
                      href="/programme"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-muted"
                    >
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <ClipboardCheck size={16} />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Work Readiness Programme</div>
                        <div className="text-xs text-muted-foreground">Structured pathway to employment</div>
                      </div>
                    </Link>
                  </div>

                  <p className="pt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Learning</p>
                  <div className="space-y-1 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setGuideModalTopic('interview-tips');
                      }}
                      className="block w-full rounded-md px-2 py-1.5 text-left font-medium text-foreground hover:bg-muted"
                    >
                      Job Interview Guides
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setGuideModalTopic('sa-trends');
                      }}
                      className="block w-full rounded-md px-2 py-1.5 text-left font-medium text-foreground hover:bg-muted"
                    >
                      Career Resources
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setGuideModalTopic('salary-insights');
                      }}
                      className="block w-full rounded-md px-2 py-1.5 text-left font-medium text-foreground hover:bg-muted"
                    >
                      Job Interview Questions
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Pricing Link in Mobile */}
            <div className="py-2">
              <Link
                href="/pricing"
                onClick={() => setMenuOpen(false)}
                className="flex items-center justify-between rounded-lg px-2 py-2 text-sm font-bold text-foreground hover:bg-muted"
              >
                <span>Pricing</span>
              </Link>
            </div>

            {!inNativeApp ? (
            <div className="py-2">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  triggerAndroidApkDownload();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-bold text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
                data-testid="link-mobile-download-apk"
              >
                <Smartphone size={16} />
                <span>Download Android APK</span>
              </button>
            </div>
            ) : null}

            {/* Candidate Auth / Profile Actions */}
            <div className="mt-4 border-t border-border pt-4">
              <HeaderAuthActions
                profileReady={profileReady}
                profile={profile}
                isAdmin={isAdmin}
                onLogout={handleLogout}
                compact
              />
            </div>
          </div>
        )}
      </header>

      <CareerGuideModal
        topicId={guideModalTopic}
        onClose={() => setGuideModalTopic(null)}
        onSelectTopic={(id) => setGuideModalTopic(id)}
      />

      <div className={`min-w-0 overflow-x-hidden ${isCvBuilder ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
      <main className={`min-w-0 ${location === '/' ? '' : 'page-enter'} ${isCvBuilder ? 'flex-1 flex flex-col' : ''}`}>{children}</main>

      {!isCvBuilder && (
        <footer className="mt-16 border-t border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 pb-[max(2.5rem,calc(2.5rem+var(--safe-bottom)))] md:flex-row md:items-center md:justify-between md:px-8">
            <div className="space-y-3">
              <LogoMark />
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Create a profile first so we can support your search — then review your CV and unlock role matches.
              </p>
            </div>
            {!inNativeApp ? (
            <button
              type="button"
              onClick={() => triggerAndroidApkDownload()}
              className="inline-flex items-center justify-center gap-2 self-start rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm transition hover:brightness-105"
              data-testid="button-footer-download-apk"
            >
              <Smartphone size={18} />
              Download Android APK
            </button>
            ) : null}
          </div>
        </footer>
      )}
      <SmokeyAgent />
      </div>
    </div>
  );
}

function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        <h1 className="display max-w-3xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function LoadingBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-muted ${className}`} />;
}

function ErrorNotice({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm">
      <div className="flex items-center gap-3">
        <CircleAlert size={18} className="text-destructive" />
        <span>{label}</span>
      </div>
      <button className="btn-secondary px-3 py-2 text-xs" onClick={onRetry} data-testid="button-retry">
        Try again
      </button>
    </div>
  );
}

function HeroProductVisual() {
  return (
    <div className="relative float-soft">
      <div className="absolute -inset-6 rounded-[2rem] bg-primary/10 blur-2xl" aria-hidden />
      <div className="sky-panel relative overflow-hidden rounded-[1.75rem] border border-border/80 p-5 md:p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">CV review preview</p>
            <p className="mt-1 text-sm text-muted-foreground">Upload once — get clarity + role matches</p>
          </div>
          <FileCheck2 className="text-primary" size={20} />
        </div>
        <div className="space-y-3">
          {[
            { label: 'Overall readiness', value: '72' },
            { label: 'Authenticity signal', value: '82' },
            { label: 'ATS discoverability', value: '68' },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 py-3"
            >
              <p className="text-sm font-medium text-foreground">{row.label}</p>
              <span className="text-sm font-bold text-primary">{row.value}</span>
            </div>
          ))}
          <div className="rounded-2xl border border-dashed border-primary/30 bg-secondary/50 px-4 py-3 text-xs leading-5 text-secondary-foreground">
            After your profile and CV review, we show up to six current roles tailored to you. Candidates can open matches below 90%; administrators can review all matches.
          </div>
        </div>
      </div>
    </div>
  );
}

function Home() {
  const [, setLocation] = useLocation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [fileName, setFileName] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [role, setRole] = useState('');
  const [locationArea, setLocationArea] = useState('');
  const [scanStep, setScanStep] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const hasReport = hasCvReport();

  useEffect(() => {
    const sync = () => {
      const current = getSessionToken() ? readProfile() : null;
      setProfile(current);
      setProfileReady(true);
      if (current?.targetRole) setRole((prev) => prev || current.targetRole || '');
      if (current?.location) setLocationArea((prev) => prev || current.location || '');
    };
    sync();
    window.addEventListener('careerbridge-profile-updated', sync);
    return () => window.removeEventListener('careerbridge-profile-updated', sync);
  }, []);

  useEffect(() => {
    if (!isReviewing) {
      setScanStep(0);
      return;
    }
    const steps = [1, 2, 3, 4];
    let index = 0;
    setScanStep(1);
    const timer = window.setInterval(() => {
      index = (index + 1) % steps.length;
      setScanStep(steps[index]);
    }, 900);
    return () => window.clearInterval(timer);
  }, [isReviewing]);

  const submitDiagnostic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fileName || !cvFile) return;
    setIsReviewing(true);
    setReviewError('');
    try {
      const parseBody = await buildParseUploadBody(cvFile);

      const response = await authFetch('/api/career/diagnostic', {
        method: 'POST',
        body: JSON.stringify({
          fileName,
          fileData: parseBody.fileData,
          text: parseBody.text,
          role: role || profile?.targetRole || undefined,
          location: locationArea || profile?.location || undefined,
        }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) {
        throw new Error(payload.error || 'We could not review that CV. Please try again.');
      }
      sessionStorage.setItem(REPORT_KEY, JSON.stringify(payload));
      try {
        sessionStorage.setItem('bonlist-report', JSON.stringify(payload));
      } catch {
        // ignore
      }
      window.dispatchEvent(new Event('careerbridge-report-updated'));
      setLocation('/diagnostic');
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'We could not review that CV. Please try again.');
    } finally {
      setIsReviewing(false);
    }
  };

    if (!profileReady) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-20 text-center text-sm text-muted-foreground md:px-8">
        Loading your workspace
      </div>
    );
  }

  if (profile) {
    const firstName = profile.name.split(' ')[0] || 'there';
    const resumeTools = [
      {
        href: '/#cv-check',
        title: 'Upload & review CV',
        copy: 'Run an AI readiness check and get role matches.',
        icon: FileCheck2,
        tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        testId: 'link-tools-cv-upload',
      },
      {
        href: '/diagnostic',
        title: 'CV review results',
        copy: hasReport ? 'Open your latest readiness dashboard.' : 'Available after your first CV upload.',
        icon: ClipboardCheck,
        tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
        testId: 'link-tools-diagnostic',
      },
      {
        href: '/cv-builder?intake=1',
        title: 'AI Resume Builder',
        copy: 'Rewrite and generate an improved CV.',
        icon: Sparkles,
        tone: 'bg-primary/10 text-primary',
        testId: 'link-tools-cv-builder',
      },
      {
        href: '/cv-builder?panel=templates',
        title: 'Resume templates',
        copy: 'Pick a clean layout and export.',
        icon: Layers,
        tone: 'bg-amber-500/10 text-amber-800 dark:text-amber-200',
        testId: 'link-tools-templates',
      },
    ] as const;
    const jobTools = [
      {
        href: '/jobs',
        title: 'Job matches',
        copy: hasReport ? 'Open live listings matched to your CV.' : 'Unlock after a CV review.',
        icon: BriefcaseBusiness,
        tone: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
        testId: 'link-tools-jobs',
      },
      {
        href: '/interview',
        title: 'Interview help',
        copy: 'Practice answers tailored to your target role.',
        icon: Bot,
        tone: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
        testId: 'link-tools-interview',
      },
      {
        href: '/coaching',
        title: 'Coaching',
        copy: 'Book human support when you need a push.',
        icon: HeartHandshake,
        tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
        testId: 'link-tools-coaching',
      },
      {
        href: '/programme',
        title: 'Career programme',
        copy: 'See accelerator progress and next steps.',
        icon: BookOpen,
        tone: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
        testId: 'link-tools-programme',
      },
      {
        href: '/pricing',
        title: 'Plans & pricing',
        copy: 'Explore plans and AI career tools.',
        icon: ShieldCheck,
        tone: 'bg-secondary text-primary',
        testId: 'link-tools-pricing',
      },
      {
        href: '/profile',
        title: 'Your profile',
        copy: 'Update location, target role, and contact details.',
        icon: MapPin,
        tone: 'bg-muted text-foreground',
        testId: 'link-tools-profile',
      },
    ] as const;

    return (
      <div>
        <section className="sky-wash relative overflow-hidden">
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-12 md:px-8 md:pb-12 md:pt-16">
            <img
              src="/brand/bonlist-logo.png"
              alt="BonList - Your Shortcut to Getting Hired."
              className="h-16 w-auto max-w-[min(400px,92vw)] object-contain object-left sm:h-[4.5rem]"
            />
            <h1 className="display mt-5 max-w-2xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Welcome back, {firstName}.
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
              Choose a tool to keep moving — review your CV, improve it, or apply to matched roles.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-10 md:px-8 md:py-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Resume tools</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {resumeTools.map((tool) => (
              <Link
                key={tool.href + tool.title}
                href={tool.href}
                className="group flex items-start gap-3.5 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/35 hover:bg-secondary/40"
                data-testid={tool.testId}
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tool.tone}`}>
                  <tool.icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary">{tool.title}</span>
                    <ArrowRight size={14} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{tool.copy}</span>
                </span>
              </Link>
            ))}
          </div>

          <p className="mt-10 text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Job search & support</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jobTools.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                className="group flex items-start gap-3.5 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/35 hover:bg-secondary/40"
                data-testid={tool.testId}
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tool.tone}`}>
                  <tool.icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground group-hover:text-primary">{tool.title}</span>
                    <ArrowRight size={14} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{tool.copy}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section id="cv-check" className="mx-auto max-w-6xl px-5 pb-16 md:px-8 md:pb-20">
          <div className="grid items-start gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Quick action</p>
              <h2 className="display mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                Upload a CV for review
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Fresh upload refreshes your readiness scores and live job matches.
              </p>
            </div>
            <form
              onSubmit={submitDiagnostic}
              className="rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8"
            >
              {isReviewing ? (
                <div className="space-y-5 py-4" data-testid="cv-scan-progress">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-primary">
                      <Sparkles className="animate-pulse" size={20} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">AI CV reader in progress</p>
                      <p className="text-xs text-muted-foreground">Analysing structure, proof, and role fit.</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      'Parsing document layout',
                      'Scoring authenticity & ATS signals',
                      'Mapping keywords to target role',
                      'Searching trusted SA job boards',
                    ].map((label, index) => {
                      const active = scanStep >= index + 1;
                      return (
                        <div
                          key={label}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                            active ? 'bg-secondary text-secondary-foreground' : 'bg-muted/60 text-muted-foreground'
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${active ? 'bg-primary' : 'bg-border'}`} />
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-foreground">Upload your current CV</span>
                    <span
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-4 py-4 ${
                        fileName
                          ? 'border-primary/50 bg-secondary'
                          : 'border-border bg-muted/50 hover:border-primary/40'
                      }`}
                    >
                      <input
                        type="file"
                        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          setCvFile(file);
                          setFileName(file?.name ?? '');
                          setReviewError('');
                        }}
                        data-testid="input-cv-file"
                      />
                      <FileText size={18} className={fileName ? 'text-primary' : 'text-muted-foreground'} />
                      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                        {fileName || 'PDF or Word document'}
                      </span>
                      {fileName ? (
                        <CheckCircle2 size={17} className="text-primary" />
                      ) : (
                        <span className="rounded-lg bg-background px-2 py-1 text-[10px] font-bold text-foreground">
                          Choose
                        </span>
                      )}
                    </span>
                  </label>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-xs font-semibold text-foreground">
                      Role you are targeting <span className="font-normal text-muted-foreground">(optional)</span>
                    </span>
                    <input
                      value={role}
                      onChange={(event) => setRole(event.target.value)}
                      placeholder="e.g. Operations coordinator"
                      className="field-input"
                      data-testid="input-target-role"
                    />
                  </label>
                  <label className="mt-4 block">
                    <span className="mb-2 block text-xs font-semibold text-foreground">
                      Your area <span className="font-normal text-muted-foreground">(optional)</span>
                    </span>
                    <select
                      value={locationArea}
                      onChange={(event) => setLocationArea(event.target.value)}
                      className="field-input"
                      data-testid="select-candidate-location"
                    >
                      <option value="">All South Africa</option>
                      <option value="Cape Town">Cape Town / Western Cape</option>
                      <option value="Johannesburg">Johannesburg / Gauteng</option>
                      <option value="Durban">Durban / KZN</option>
                      <option value="Hybrid">Hybrid / Remote</option>
                    </select>
                  </label>
                  {reviewError && (
                    <p className="mt-3 text-xs text-destructive" data-testid="text-diagnostic-error">
                      {reviewError}
                    </p>
                  )}
                  <button
                    disabled={!fileName || !cvFile || isReviewing}
                    className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid="button-submit-diagnostic"
                  >
                    Run AI CV review <ArrowRight size={16} />
                  </button>
                </>
              )}
            </form>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      <section className="sky-wash relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 md:px-8 md:pb-24 md:pt-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="rise-in">
            <img
              src="/brand/bonlist-logo.png"
              alt="BonList - Your Shortcut to Getting Hired."
              className="h-[4.5rem] w-auto max-w-[min(480px,94vw)] object-contain object-left sm:h-20 md:h-24"
            />
            <h1 className="display mt-5 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-[2.75rem] md:leading-[1.1]">
              Transform your CV into interview Invitations today.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground md:text-lg">
              Upload your CV now for the perfect accurate review and revamp  then see recommended roles that fit your story today.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn-primary" data-testid="link-start-profile">
                Sign up to get started <ArrowRight size={16} />
              </Link>
              <a href="#cv-check" className="btn-secondary" data-testid="link-how-review-works">
                Then upload your CV
              </a>
            </div>
          </div>
          <div className="rise-in delay-1">
            <HeroProductVisual />
          </div>
        </div>
      </section>

      <section id="cv-check" className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Step 2</p>
            <h2 className="display mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Upload your CV for review and revamp.
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
              Create a profile first so we can keep track of your visit and personalise your CV review.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />
                Profile first and then CV upload
              </li>
              <li className="flex gap-2">
                <FileCheck2 size={16} className="mt-0.5 shrink-0 text-primary" />
                Detailed review + 6 recommended roles after upload
              </li>
            </ul>
          </div>
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8" data-testid="cv-locked-panel">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
              <Lock size={20} />
            </div>
            <h3 className="display mt-5 text-2xl font-semibold text-foreground">Create a profile to continue</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              We ask for a short profile before CV upload so we can support your search and understand how many people BonList is helping.
            </p>
            <Link href="/signup" className="btn-primary mt-6" data-testid="link-create-profile-from-cv">
              Sign up to unlock CV review <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">How it works</p>
          <h2 className="display mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            We&apos;re here for every step of your search.
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
            Build evidence once, then move with focus — local jobs, interview stories, and human support when you need it.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: FileCheck2,
              title: 'Read the evidence',
              copy: 'Check the signals recruiters actually see: clarity, proof, and fit.',
              delay: 'delay-1',
            },
            {
              icon: Search,
              title: 'Make a focused move',
              copy: 'Choose from local roles and prompts that match your real experience.',
              delay: 'delay-2',
            },
            {
              icon: HeartHandshake,
              title: 'Build with support',
              copy: 'Practice the conversation, then bring the hard parts to a human coach.',
              delay: 'delay-3',
            },
          ].map((step) => (
            <div key={step.title} className={`rise-in ${step.delay} border-t-2 border-primary pt-5`}>
              <step.icon className="text-primary" size={22} />
              <h3 className="mt-5 text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.copy}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ProfilePage() {
  const [, setLocation] = useLocation();
  const existing = readProfile();
  const [form, setForm] = useState({
    name: existing?.name || '',
    email: existing?.email || '',
    phone: existing?.phone || '',
    location: existing?.location || '',
    targetRole: existing?.targetRole || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [entitlement, setEntitlement] = useState<Entitlement>(defaultEntitlement(existing?.id || 0));

  useEffect(() => {
    if (!existing) setLocation('/signup');
  }, [existing, setLocation]);

  useEffect(() => {
    if (!existing) return;
    setForm({
      name: existing.name || '',
      email: existing.email || '',
      phone: existing.phone || '',
      location: existing.location || '',
      targetRole: existing.targetRole || '',
    });
    void fetchEntitlement(existing.id).then(setEntitlement);
    const refresh = () => void fetchEntitlement(existing.id).then(setEntitlement);
    window.addEventListener('careerbridge-entitlement-updated', refresh);
    return () => window.removeEventListener('careerbridge-entitlement-updated', refresh);
  }, [existing?.id]);

  if (!existing) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20 text-center text-sm text-muted-foreground">
        Redirecting to sign up…
      </div>
    );
  }

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      // D1 auth may store a UUID id — ensure a numeric career profile exists on the API.
      let profileId: number | string = existing.id;
      if (!Number.isFinite(Number(profileId)) || Number(profileId) <= 0) {
        const ensured = await ensureCvProfile({
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          location: form.location.trim() || undefined,
          targetRole: form.targetRole.trim() || undefined,
        });
        profileId = ensured.id;
      }

      const response = await authFetch('/api/career/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: profileId,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          location: form.location.trim() || undefined,
          targetRole: form.targetRole.trim() || undefined,
        }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error || 'Could not update profile');
      persistProfile(payload as UserProfile);
      setSuccess('Your profile has been updated.');
      window.dispatchEvent(new Event('careerbridge-profile-updated'));
      if (Number.isFinite(Number(payload.id)) && Number(payload.id) > 0) {
        void fetchEntitlement(Number(payload.id)).then(setEntitlement);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile');
    } finally {
      setSaving(false);
    }
  };

  const programmeActive = entitlement.programme?.status === 'active';

  return (
    <div className="mx-auto max-w-3xl px-5 py-16 md:px-8">
      <PageHeading
        eyebrow="Your profile"
        title={`Welcome back, ${form.name.trim().split(' ')[0] || existing.name.split(' ')[0]}.`}
        description="Update your name, email, and career details anytime. Changes save to your BonList account."
        action={
          <Link href="/#cv-check" className="btn-primary" data-testid="link-profile-to-cv">
            Upload CV <ArrowRight size={15} />
          </Link>
        }
      />

      <div className="mb-6 rounded-3xl border border-border bg-card p-5 md:p-6" data-testid="card-profile-access">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Your access</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="display text-2xl font-semibold text-foreground">
              {programmeActive
                ? 'Career Accelerator'
                : entitlement.planName || 'Free'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {programmeActive
                ? `Full platform access — ${entitlement.programme?.daysRemaining ?? 0} days remaining`
                : entitlement.plan === 'free'
                  ? 'Standard matches and core CV tools. Upgrade anytime.'
                  : 'Premium features active on your monthly plan.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {programmeActive ? (
              <Link href="/programme" className="btn-primary" data-testid="link-profile-programme">
                Programme dashboard <ArrowRight size={14} />
              </Link>
            ) : (
              <Link href="/pricing" className="btn-primary" data-testid="link-profile-pricing">
                View pricing <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      </div>

      <form
        onSubmit={saveProfile}
        className="rounded-3xl border border-border bg-card p-6 md:p-8"
        data-testid="form-profile-edit"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            value={form.name}
            onChange={(value) => update('name', value)}
            placeholder="Your full name"
            testId="input-profile-name"
            required
          />
          <Field
            label="Email (Gmail or other)"
            value={form.email}
            onChange={(value) => update('email', value)}
            placeholder="you@gmail.com"
            type="email"
            testId="input-profile-email"
            required
          />
          <Field
            label="Phone"
            value={form.phone}
            onChange={(value) => update('phone', value)}
            placeholder="Optional"
            testId="input-profile-phone"
          />
          <Field
            label="Location"
            value={form.location}
            onChange={(value) => update('location', value)}
            placeholder="City or province"
            testId="input-profile-location"
          />
          <div className="sm:col-span-2">
            <Field
              label="Target role"
              value={form.targetRole}
              onChange={(value) => update('targetRole', value)}
              placeholder="e.g. Product Marketing Manager"
              testId="input-profile-target-role"
            />
          </div>
        </div>
        {error ? <p className="mt-4 text-xs text-destructive">{error}</p> : null}
        {success ? <p className="mt-4 text-xs text-emerald-700">{success}</p> : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving || !form.name.trim() || !form.email.trim()}
            className="btn-primary disabled:opacity-50"
            data-testid="button-profile-save"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <p className="text-xs text-muted-foreground">
            Use a real email you can access — including Gmail — so we can reach you about coaching and matches.
          </p>
        </div>
      </form>
    </div>
  );
}

function DiagnosticPage() {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!hasProfile()) {
      setLocation('/signup');
      return;
    }

    const profile = readProfile();
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const stored = sessionStorage.getItem(REPORT_KEY) || sessionStorage.getItem('bonlist-report');
      if (stored) {
        try {
          if (!cancelled) setReport(reportForCurrentViewer(JSON.parse(stored) as DiagnosticReport));
          setLoading(false);
          return;
        } catch {
          // fall through to API
        }
      }

      try {
        if (!profile?.id && !profile?.email) {
          if (!cancelled) setReport(null);
          return;
        }
        const params = new URLSearchParams();
        if (profile?.id) params.set('profileId', String(profile.id));
        if (profile?.email) params.set('email', profile.email);
        const response = await authFetch(`/api/career/diagnostic/latest?${params.toString()}`);
        if (!response.ok) {
          if (!cancelled) setReport(null);
          return;
        }
        const payload = (await response.json()) as DiagnosticReport;
        sessionStorage.setItem(REPORT_KEY, JSON.stringify(payload));
        try {
          sessionStorage.setItem('bonlist-report', JSON.stringify(payload));
        } catch {
          // ignore
        }
        if (!cancelled) setReport(payload);
      } catch {
        if (!cancelled) setReport(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [setLocation]);

  const handleGenerateCv = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setLocation('/cv-builder?intake=1');
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-16 md:px-8">
        <div className="rounded-3xl border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
          Loading your CV review…
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-16 md:px-8">
        <PageHeading
          eyebrow="AI CV reader"
          title="Start with the document in front of you."
          description="Upload your CV on the overview page and we'll return a detailed evidence report with section scores, rewrite examples, and roles recently listed for your target."
          action={
            <Link href="/" className="btn-primary" data-testid="link-upload-cv">
              Upload a CV <ArrowRight size={15} />
            </Link>
          }
        />
        <div className="rounded-3xl border border-border bg-card px-6 py-16 text-center">
          <FileText className="mx-auto text-primary" size={36} />
          <h2 className="display mt-5 text-2xl font-semibold text-foreground">No report yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            A useful review starts with your actual CV, not a generic score.
          </p>
        </div>
      </div>
    );
  }

  const scores = report.scores ?? {
    clarity: report.authenticityScore,
    impact: 60,
    structure: 70,
    keywordFit: 65,
    authenticity: report.authenticityScore,
    ats: report.atsScore,
  };
  const overall = report.overallScore ?? report.authenticityScore;
  const relatedJobs = report.relatedJobs ?? [];
  const locationHint =
    report.jobSearch?.query?.match(/\bin\s+([^·|]+)/i)?.[1]?.trim() ||
    relatedJobs[0]?.location?.split('·')[0]?.trim() ||
    'South Africa';

  const sectionScore = (name: RegExp, fallback: number) => {
    const hit = report.sectionReviews?.find((s) => name.test(s.section));
    return hit?.score ?? fallback;
  };

  const gradeLabel = (score: number) => {
    if (score >= 80) return { label: 'Pass', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' };
    if (score >= 65) return { label: 'Solid', tone: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' };
    return { label: 'Action Required', tone: 'bg-amber-500/15 text-amber-800 dark:text-amber-200' };
  };

  const scoreCard = [
    { name: 'Structure & Formatting', score: scores.structure ?? sectionScore(/structure|format/i, 70) },
    { name: 'Keyword Fit', score: scores.keywordFit ?? sectionScore(/keyword/i, 65) },
    { name: 'Professional Summary', score: sectionScore(/summary|profile/i, scores.clarity ?? 70) },
    { name: 'Experience & Impact Bullets', score: sectionScore(/experience|impact|bullet/i, scores.impact ?? 60) },
  ];

  const strengths = (report.strengths ?? []).slice(0, 4);
  const fixes = (report.improvements ?? [])
    .slice()
    .sort((a, b) => {
      const rank = (p?: string) => (p === 'high' ? 0 : p === 'medium' ? 1 : 2);
      return rank(a.priority) - rank(b.priority);
    })
    .slice(0, 3);
  const rewrites = (report.rewriteExamples ?? []).slice(0, 2);
  const topJobs = relatedJobs.slice(0, 6);
  const premiumUnlocked = isAdminUser();

  const healthSummary =
    report.summary?.trim() ||
    `${overall >= 75 ? 'Solid authenticity and structure' : 'Promising foundation'}, but ${
      (scores.impact ?? 60) < 70 ? 'experience bullets need stronger action verbs and quantified impact' : 'a few targeted edits will lift ATS fit'
    } for ${report.targetRole || 'your target'} roles${locationHint ? ` in ${locationHint}` : ''}.`;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:px-8 md:py-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">CV diagnostic</p>
          <h1 className="display mt-1 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Your readiness at a glance
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {report.fileName}
            {report.targetRole ? ` — ${report.targetRole}` : ''}
            {locationHint ? ` — ${locationHint}` : ''}
          </p>
        </div>
        <button type="button" onClick={handleGenerateCv} className="btn-primary shrink-0" data-testid="button-generate-cv">
          <Sparkles size={15} />
          Generate Improved CV
        </button>
      </div>

      {/* 1. ATS & READINESS OVERVIEW */}
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm md:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">1 — ATS & readiness overview</p>
        <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <p className="text-xs text-muted-foreground">Overall composite</p>
            <p className="display text-5xl font-semibold tabular-nums text-foreground md:text-6xl">
              {overall}
              <span className="text-2xl text-muted-foreground">/100</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Authenticity</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">{report.authenticityScore}/100</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ATS fit</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums">{report.atsScore}/100</p>
            </div>
          </div>
        </div>
        <p className="mt-5 max-w-2xl border-t border-border pt-4 text-sm leading-relaxed text-foreground">
          <span className="font-semibold">Health check: </span>
          {healthSummary}
        </p>
      </section>

      {/* 2. SCORE CARD */}
      <section className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">2 — Score card at a glance</p>
        <ul className="mt-4 divide-y divide-border">
          {scoreCard.map((row) => {
            const grade = gradeLabel(row.score);
            return (
              <li key={row.name} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="text-sm font-medium text-foreground">{row.name}</span>
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums text-foreground">{row.score}/100</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${grade.tone}`}>
                    {grade.label}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* 3. TOP STRENGTHS */}
      <section className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">3 — Top strengths</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">What&apos;s working</h2>
        {strengths.length ? (
          <ul className="mt-4 space-y-2.5">
            {strengths.map((item) => (
              <li key={item.title} className="flex gap-2.5 text-sm leading-snug text-foreground">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>
                  <span className="font-semibold">{item.title}.</span>{' '}
                  <span className="text-muted-foreground">{item.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Your CV already shows authentic, parseable content — protect that clarity.</p>
        )}
      </section>

      {/* 4. PRIORITY FIXES */}
      <section className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">4 — Priority fixes</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">Immediate actions</h2>
        {fixes.length ? (
          <ol className="mt-4 space-y-3">
            {fixes.map((item, i) => (
              <li key={item.title} className="flex gap-3 text-sm leading-snug">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-500/15 text-[11px] font-bold text-amber-800 dark:text-amber-200">
                  {i + 1}
                </span>
                <span>
                  <span className="font-semibold text-foreground">[{item.title}]</span>{' '}
                  <span className="text-muted-foreground">{item.detail}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No critical blockers — polish bullets and you&apos;re interview-ready.</p>
        )}
        {(report.flaggedPhrases?.length || report.missingKeywords?.length) ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {report.flaggedPhrases?.length ? (
              <>
                <span className="font-semibold text-foreground">Watch phrases: </span>
                {report.flaggedPhrases.slice(0, 3).join(' — ')}.
              </>
            ) : null}{' '}
            {report.missingKeywords?.length ? (
              <>
                <span className="font-semibold text-foreground">Prove next: </span>
                {report.missingKeywords.slice(0, 4).join(', ')}.
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      {/* 5. BEFORE vs AFTER */}
      {rewrites.length ? (
        <section className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">5 — Before vs after</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Rewrite guide</h2>
          <div className="mt-4 space-y-4">
            {rewrites.map((example) => (
              <div key={example.before} className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl bg-muted/60 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Current</p>
                  <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{example.before}</p>
                </div>
                <div className="rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-primary">Fixed</p>
                  <p className="mt-1.5 text-sm font-medium leading-snug text-foreground">{example.after}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 6. JOB MATCHES + CTA */}
      <section className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">6 — Recommended matches & next steps</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">Recent job matches</h2>
        {report.jobSearch?.liveResults ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Live listings for “{report.jobSearch.query}” — open a role to apply on the board.
          </p>
        ) : null}
        {topJobs.length > 0 && topJobs.length < 6 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {topJobs.length} current {topJobs.length === 1 ? 'listing' : 'listings'} found in your chosen area. To see more, change your preferred location to an area where this role is more commonly listed and run a new CV review.
          </p>
        ) : null}
        {topJobs.length ? (
          <ul className="mt-4 space-y-2">
            {topJobs.map((job) => {
              const premiumLocked = job.match >= 90 && !premiumUnlocked;
              const href = applyHref(job);
              return (
                <li key={job.id} className="relative overflow-hidden rounded-2xl bg-secondary/50">
                  <div
                    className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm ${
                      premiumLocked ? 'select-none blur-[2.5px] pointer-events-none' : ''
                    }`}
                  >
                    {href && !premiumLocked ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 font-semibold text-foreground hover:text-primary"
                        data-testid={`link-diagnostic-job-${job.id}`}
                        onClick={() => persistSelectedJob(job)}
                      >
                        {job.title}
                        {job.company ? <span className="font-normal text-muted-foreground"> — {job.company}</span> : null}
                        {(job.source || job.posted) && (
                          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                            {[job.source, job.posted === 'Date unavailable' ? 'Posting date unavailable' : job.posted ? `Posted ${job.posted}` : null].filter(Boolean).join(' — ')}
                          </span>
                        )}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 font-semibold text-foreground">
                        {job.title}
                        {job.company ? <span className="font-normal text-muted-foreground"> — {job.company}</span> : null}
                        {(job.source || job.posted) && (
                          <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                            {[job.source, job.posted === 'Date unavailable' ? 'Posting date unavailable' : job.posted ? `Posted ${job.posted}` : null].filter(Boolean).join(' — ')}
                          </span>
                        )}
                      </span>
                    )}
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                        {job.match}% fit
                      </span>
                      {href && !premiumLocked ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-primary-foreground"
                          data-testid={`button-diagnostic-apply-${job.id}`}
                          onClick={() => persistSelectedJob(job)}
                        >
                          Apply <ExternalLink size={12} />
                        </a>
                      ) : null}
                    </span>
                  </div>
                  {premiumLocked ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-between gap-3 bg-background/60 px-4 backdrop-blur-[1px]">
                      <div className="flex min-w-0 items-center gap-2">
                        <Lock size={14} className="shrink-0 text-primary" />
                        <p className="truncate text-xs font-semibold text-foreground">
                          {job.match}% premium match
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold text-muted-foreground">Administrator view</span>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No job listings were found for your chosen role and area. Change your preferred location to an area where this role is more commonly listed, then run a new CV review.</p>
        )}
        {topJobs.length > 0 ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            {premiumUnlocked
              ? 'Administrator view includes all current matches.'
              : 'Candidates can open matches below 90%. Matches of 90% or higher are reserved for administrators.'}
          </p>
        ) : null}
        <BoardSearchLinks report={report} />

        <div className="mt-6 flex flex-col items-stretch gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Apply your fixes in one pass — then send a cleaner CV.</p>
          <button
            type="button"
            onClick={handleGenerateCv}
            className="btn-primary w-full sm:w-auto"
            data-testid="button-generate-cv-section"
          >
            <Sparkles size={15} />
            Generate Improved CV <ArrowRight size={15} />
          </button>
        </div>
      </section>

      <div className="mt-6 text-center">
        <button
          type="button"
          onClick={() => setLocation('/')}
          className="text-xs font-semibold text-muted-foreground hover:text-primary"
          data-testid="button-review-another-cv"
        >
          Review another CV
        </button>
      </div>
    </div>
  );
}

function JobsPage() {
  const [, setLocation] = useLocation();
  const [report, setReport] = useState<DiagnosticReport | null>(null);

  useEffect(() => {
    if (!hasProfile()) {
      setLocation('/signup');
      return;
    }
    const stored = sessionStorage.getItem(REPORT_KEY);
    if (!stored) {
      setLocation('/#cv-check');
      return;
    }
    try {
      setReport(reportForCurrentViewer(JSON.parse(stored) as DiagnosticReport));
    } catch {
      setLocation('/#cv-check');
    }
  }, [setLocation]);

  if (!report) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20 text-center md:px-8">
        <Lock className="mx-auto text-primary" size={32} />
        <h1 className="display mt-5 text-3xl font-semibold text-foreground">Matches unlock after your CV review</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          BonList is built to help you find your next role from your CV — not to browse a general job board.
        </p>
        <Link href="/#cv-check" className="btn-primary mt-8" data-testid="link-jobs-need-cv">
          Upload your CV <ArrowRight size={15} />
        </Link>
      </div>
    );
  }

  const matches = (report.relatedJobs ?? []).slice(0, 6);
  const premiumUnlocked = isAdminUser();

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <PageHeading
        eyebrow="Your matches"
        title="Roles recommended from your CV review."
        description={
          report.jobSearch?.liveResults
            ? `Live listings found for “${report.jobSearch.query}” across trusted SA boards — not an open job feed.`
            : "No job listings were found for your chosen role and area."
        }
        action={
          <Link href="/diagnostic" className="btn-secondary" data-testid="link-matches-to-review">
            Back to CV review <ArrowRight size={14} />
          </Link>
        }
      />
      {report.jobSearch?.queriedBoards?.length ? (
        <div className="mb-6 flex flex-wrap gap-2">
          {report.jobSearch.queriedBoards.slice(0, 8).map((board) => (
            <span
              key={board}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
            >
              {board}
            </span>
          ))}
        </div>
      ) : null}
      {matches.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card px-6 py-16 text-center">
          <BriefcaseBusiness className="mx-auto text-primary" size={32} />
          <h2 className="display mt-4 text-2xl font-semibold text-foreground">No job listings found</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Change your preferred location to an area where this role is more commonly listed, then run a new CV review.
          </p>
          <Link href="/#cv-check" className="btn-primary mt-5" data-testid="link-jobs-to-upload">
            Change location and review CV <ArrowRight size={15} />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {matches.length < 6 ? (
            <p className="text-sm text-muted-foreground">
              {matches.length} current {matches.length === 1 ? 'listing' : 'listings'} found in your chosen area. Change your preferred location to an area where this role is more commonly listed and run a new CV review to find more.
            </p>
          ) : null}
          {matches.map((job) => (
            <JobCard key={job.id} job={job} premiumUnlocked={premiumUnlocked} />
          ))}
        </div>
      )}
      <BoardSearchLinks report={report} />
      <p className="mt-5 text-center text-xs text-muted-foreground">
        {premiumUnlocked
          ? 'Administrator view includes all current matches.'
          : 'Candidates can open matches below 90%. Matches of 90% or higher are reserved for administrators.'}
      </p>
    </div>
  );
}

function JobCard({ job, premiumUnlocked = false }: { job: JobMatch; premiumUnlocked?: boolean }) {
  const premiumLocked = job.match >= 90 && !premiumUnlocked;
  const detailHref = `/jobs/${job.id}`;
  const externalApply = applyHref(job);

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-border bg-card transition-all ${
        premiumLocked ? '' : 'hover:border-primary/35 hover:shadow-sm'
      }`}
      data-testid={`card-job-${job.id}`}
    >
      <div
        className={`grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center ${
          premiumLocked ? 'select-none blur-[3px] pointer-events-none' : ''
        }`}
      >
        <div className="flex gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
            <span className="display text-lg font-semibold">{job.company.charAt(0)}</span>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={detailHref}
                onClick={() => persistSelectedJob(job)}
                className="text-base font-semibold text-foreground hover:text-primary"
                data-testid={`link-job-detail-${job.id}`}
              >
                {job.title}
              </Link>
              <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-bold text-primary">
                {job.match}% fit
              </span>
              {job.source && (
                <span className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {job.source}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{job.company} — {job.sector}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              <MapPin size={14} className="text-primary" />
              {job.location}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.tags.map((tag) => (
                <span key={tag} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-border pt-4 md:items-end md:border-t-0 md:pt-0">
          <div className="md:text-right">
            <p className="text-sm font-semibold text-foreground">{job.salary}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{job.posted === 'Date unavailable' ? 'Posting date unavailable' : `Posted ${job.posted}`}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <Link
              href={detailHref}
              onClick={() => persistSelectedJob(job)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-bold text-foreground hover:border-primary/40"
              data-testid={`button-view-spec-${job.id}`}
            >
              View job spec
            </Link>
            {externalApply ? (
              <a
                href={externalApply}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                data-testid={`button-apply-job-${job.id}`}
              >
                Apply <ExternalLink size={13} />
              </a>
            ) : (
              <button
                className="inline-flex items-center gap-1 text-xs font-bold text-primary"
                onClick={() => navigator.clipboard?.writeText(`${job.title} at ${job.company}`)}
                data-testid={`button-save-job-${job.id}`}
              >
                Save role <HeartHandshake size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {premiumLocked && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/55 px-5 backdrop-blur-[1px]">
          <div className="max-w-sm rounded-2xl border border-border bg-card/95 p-5 text-center shadow-md">
            <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-secondary text-primary">
              <Lock size={18} />
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">{job.match}% premium match</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              This match is available in the administrator view.
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const jobId = params.id || '';
  const [job, setJob] = useState<JobMatch | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = findJobFromSession(jobId);
      if (!found) {
        setLocation('/jobs');
        return;
      }
      if (found.match >= 90 && !isAdminUser()) {
        setLocation('/jobs');
        return;
      }
      if (cancelled) return;
      persistSelectedJob(found);
      setJob(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, setLocation]);

  if (!job) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20 text-center text-sm text-muted-foreground">
        Loading job details…
      </div>
    );
  }

  const externalApply = applyHref(job);
  const spec =
    job.description ||
    `${job.title} at ${job.company}. Location: ${job.location}. Sector: ${job.sector}. Salary: ${job.salary}. Posted ${job.posted}. Review the full specification on the source board before you apply.`;

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 md:px-8 md:py-16">
      <Link href="/jobs" className="inline-flex items-center gap-1 text-xs font-bold text-primary" data-testid="link-back-to-matches">
        ? Back to matches
      </Link>

      <div className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {job.source || 'Trusted board'} — {job.match}% fit
            </p>
            <h1 className="display mt-2 text-3xl font-semibold text-foreground md:text-4xl">{job.title}</h1>
            <p className="mt-2 text-base text-muted-foreground">{job.company}</p>
          </div>
          {externalApply ? (
            <a
              href={externalApply}
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
              data-testid="button-apply-detail"
            >
              Apply on {job.source || 'listing site'} <ExternalLink size={15} />
            </a>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Location</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <MapPin size={14} className="text-primary" />
              {job.location}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Salary</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{job.salary}</p>
          </div>
          <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Posted</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{job.posted}</p>
          </div>
        </div>

        <section className="mt-8 border-t border-border pt-6">
          <h2 className="text-lg font-semibold text-foreground">Job specification</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground whitespace-pre-wrap">{spec}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {job.tags.map((tag) => (
              <span key={tag} className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                {tag}
              </span>
            ))}
            <span className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground">{job.sector}</span>
          </div>
        </section>

        <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-secondary/50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Ready to apply?</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              BonList shows the match and location here. Applications are completed on {job.source || 'the trusted job board'} where the role is listed.
            </p>
          </div>
          {externalApply ? (
            <a
              href={externalApply}
              target="_blank"
              rel="noreferrer"
              className="btn-primary shrink-0"
              data-testid="button-apply-detail-footer"
            >
              Apply now <ExternalLink size={15} />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InterviewPage() {
  const interviewQuery = useGetInterviewPrep({ query: { queryKey: getGetInterviewPrepQueryKey() } });
  const [completed, setCompleted] = useState<number[]>([]);
  const [entitlement, setEntitlement] = useState<Entitlement>(defaultEntitlement());
  const prep = interviewQuery.data as InterviewPrep | undefined;
  const questions = prep?.questions ?? [];
  const completedCount = completed.length || prep?.completed || 0;

  useEffect(() => {
    const profile = readProfile();
    if (!profile?.id) return;
    void fetchEntitlement(profile.id).then(setEntitlement);
  }, []);

  const interviewUnlocked = entitlement.features.interviewTools;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <PageHeading
        eyebrow="Interview room"
        title="Practice the answer behind the answer."
        description="Good preparation is not memorising a script. It is knowing which story to reach for when the question gets specific."
        action={
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Progress</p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {completedCount}
              <span className="text-muted-foreground">/{prep?.total ?? '—'}</span>
            </p>
          </div>
        }
      />
      {!interviewUnlocked ? (
        <div className="mb-6 rounded-2xl border border-border bg-secondary/50 px-5 py-4 text-sm">
          <p className="font-semibold text-foreground">Full interview tools unlock on Career Pro</p>
          <p className="mt-1 text-muted-foreground">
            Or get them included for 3 months with the R2,000 Career Accelerator programme — no extra subscription required.
          </p>
          <Link href="/pricing" className="mt-3 inline-flex items-center gap-1 font-bold text-primary" data-testid="link-interview-pricing">
            View pricing <ArrowRight size={14} />
          </Link>
        </div>
      ) : null}
      {interviewQuery.isError ? (
        <ErrorNotice label="Interview prompts are not available right now." onRetry={() => interviewQuery.refetch()} />
      ) : interviewQuery.isLoading ? (
        <div className="grid gap-5 md:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <LoadingBlock key={item} className="h-48" />
          ))}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="rounded-3xl bg-secondary p-6 text-secondary-foreground md:p-8">
            <ClipboardCheck size={26} className="text-primary" />
            <p className="mt-10 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Before you start</p>
            <h2 className="display mt-3 text-3xl font-semibold leading-tight text-foreground">
              Answer like a person, not a brochure.
            </h2>
            <ul className="mt-7 space-y-4 text-sm leading-5 text-muted-foreground">
              <li className="flex gap-3">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-primary" />
                Name the situation, not just the skill.
              </li>
              <li className="flex gap-3">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-primary" />
                Show what changed because of your work.
              </li>
              <li className="flex gap-3">
                <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-primary" />
                Say what you would do differently now.
              </li>
            </ul>
            <Link
              href="/pricing"
              className="mt-9 inline-flex items-center gap-2 text-sm font-bold text-primary"
              data-testid="link-interview-coaching"
            >
              Join the 3-month Career Accelerator <ArrowRight size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                question={question}
                index={index}
                isComplete={
                  completed.includes(question.id) || (completed.length === 0 && index < (prep?.completed ?? 0))
                }
                onComplete={() =>
                  setCompleted((current) =>
                    current.includes(question.id)
                      ? current.filter((id) => id !== question.id)
                      : [...current, question.id],
                  )
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  index,
  isComplete,
  onComplete,
}: {
  question: InterviewPrep['questions'][number];
  index: number;
  isComplete: boolean;
  onComplete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <article
      className={`rounded-2xl border bg-card p-5 transition-all ${
        isComplete ? 'border-primary/35' : 'border-border'
      }`}
      data-testid={`card-interview-question-${question.id}`}
    >
      <div className="flex items-start gap-4">
        <button
          onClick={onComplete}
          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
            isComplete
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border text-transparent hover:border-primary'
          }`}
          data-testid={`button-complete-question-${question.id}`}
          aria-label={isComplete ? 'Mark question incomplete' : 'Mark question practiced'}
        >
          <Check size={14} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Question 0{index + 1}</p>
          <h2
            className={`mt-2 text-base font-semibold leading-6 ${
              isComplete ? 'text-foreground/55 line-through' : 'text-foreground'
            }`}
          >
            {question.question}
          </h2>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">{question.context}</p>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-primary"
          data-testid={`button-toggle-hint-${question.id}`}
          aria-label="Toggle hint"
        >
          {open ? <ChevronDown size={17} /> : <Info size={17} />}
        </button>
      </div>
      {open && (
        <div className="ml-10 mt-4 rounded-xl bg-muted/70 p-3 text-xs leading-5 text-foreground">
          <strong className="mr-1">Try this:</strong>
          {question.hint}
        </div>
      )}
    </article>
  );
}

function CoachingPage() {
  const profile = readProfile();
  const [submitted, setSubmitted] = useState<{ status: string; message: string } | null>(null);
  const apply = useApplyForCoaching();
  const [form, setForm] = useState<CoachingApplicationInput>({
    name: profile?.name || '',
    email: profile?.email || '',
    experience: '',
    goals: '',
    paymentPlan: 'programme',
  });
  const update = (key: keyof CoachingApplicationInput, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply.mutate(
      { data: { ...form, paymentPlan: 'programme' } },
      { onSuccess: (application) => setSubmitted(application) },
    );
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-20 text-center md:px-8">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-secondary text-primary">
          <CheckCircle2 size={30} />
        </div>
        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Application received</p>
        <h1 className="display mt-3 text-4xl font-semibold text-foreground">We'll be in touch.</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
          {submitted.message ||
            'Your programme interest is in. You can also activate full access instantly from Pricing.'}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/pricing" className="btn-primary" data-testid="link-coaching-to-pricing">
            Join the programme <ArrowRight size={15} />
          </Link>
          <Link href="/" className="btn-secondary" data-testid="link-coaching-done">
            Back to overview
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
      <PageHeading
        eyebrow="3-Month Career Transformation Programme"
        title="STOP SOUNDING LIKE EVERYONE ELSE."
        description="A structured R2,000 once-off programme — not another AI subscription. Full platform access for 3 months, plus training that keeps your authentic professional voice."
        action={
          <Link href="/pricing" className="btn-primary" data-testid="link-coaching-pricing-cta">
            JOIN THE PROGRAMME <ArrowRight size={15} />
          </Link>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <div className="rounded-3xl bg-primary p-7 text-primary-foreground md:p-8">
            <HeartHandshake size={28} />
            <h2 className="display mt-8 text-3xl font-semibold">Three months. Full access. Your voice.</h2>
            <p className="mt-4 text-sm leading-6 text-primary-foreground/80">
              Use AI as a tool. Don't let AI become your voice. Designed to help you become
              interview-ready and improve your chances of securing interviews.
            </p>
            <div className="mt-8 space-y-5">
              {[
                ['01', 'Month 1 — Build Your Foundation', 'Value, transferable skills, CV positioning, job-search strategy, strategic AI.'],
                ['02', 'Month 2 — Stand Out From The Crowd', 'Authentic voice, career stories, applications, LinkedIn, recruiter psychology.'],
                ['03', 'Month 3 — Interview & Job-Search Mastery', 'STAR, difficult questions, mock interviews, salary talk, follow-up.'],
              ].map(([number, title, copy]) => (
                <div key={number} className="flex gap-4 border-t border-primary-foreground/20 pt-4">
                  <span className="text-xs font-bold text-primary-foreground/80">{number}</span>
                  <div>
                    <h3 className="text-sm font-semibold">{title}</h3>
                    <p className="mt-1 text-xs leading-5 text-primary-foreground/70">{copy}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.12em] text-primary-foreground/90">
              R2,000 once-off — 3 months — Full platform access
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-6 shadow-sm md:p-8">
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Programme intake</p>
            <h2 className="display mt-2 text-2xl font-semibold text-foreground">Tell us where you are.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Prefer instant access? Activate the programme on{' '}
              <Link href="/pricing" className="font-semibold text-primary hover:underline">
                Pricing
              </Link>
              .
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Your name"
              value={form.name}
              onChange={(value) => update('name', value)}
              placeholder="Noluthando M."
              testId="input-coaching-name"
              required
            />
            <Field
              label="Email address"
              value={form.email}
              onChange={(value) => update('email', value)}
              placeholder="you@example.com"
              type="email"
              testId="input-coaching-email"
              required
            />
          </div>
          <label className="mt-4 block">
            <span className="mb-2 block text-xs font-semibold text-foreground">Where are you in your career?</span>
            <textarea
              required
              value={form.experience}
              onChange={(event) => update('experience', event.target.value)}
              placeholder="A few lines on your experience, current work or the transition you're navigating."
              className="field-input min-h-24 resize-y"
              data-testid="textarea-coaching-experience"
            />
          </label>
          <label className="mt-4 block">
            <span className="mb-2 block text-xs font-semibold text-foreground">
              What would make 3 months worthwhile?
            </span>
            <textarea
              required
              value={form.goals}
              onChange={(event) => update('goals', event.target.value)}
              placeholder="Be specific: interviews, confidence, a clearer story, standing out from AI-sounding candidates."
              className="field-input min-h-24 resize-y"
              data-testid="textarea-coaching-goals"
            />
          </label>
          <div className="mt-5 rounded-2xl border border-primary/30 bg-secondary/50 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Stand-alone programme</p>
            <p className="mt-1 text-xs text-muted-foreground">
              R2,000 once-off — Full Free + Job Seeker + Career Pro access for 3 months
            </p>
          </div>
          {apply.isError && (
            <p className="mt-4 text-xs text-destructive">
              We couldn't submit this just now. Your details are still here — try again.
            </p>
          )}
          <button
            disabled={apply.isPending}
            className="btn-primary mt-7 w-full disabled:opacity-50"
            data-testid="button-submit-coaching"
          >
            {apply.isPending ? 'Sending your intake…' : 'Send programme interest'} <ArrowRight size={16} />
          </button>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Does not guarantee employment, a job offer, a specific salary, or an interview.
          </p>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  testId,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  testId: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-foreground">{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="field-input"
        data-testid={testId}
      />
    </label>
  );
}

const PUBLIC_AUTH_PATHS = new Set(['/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback']);

function ProtectedApp() {
  const [location, setLocation] = useLocation();
  const [check, setCheck] = useState(0);
  const [access, setAccess] = useState<{ location: string; check: number; status: 'allowed' | 'unavailable' } | null>(null);

  useEffect(() => {
    const refresh = () => setCheck((value) => value + 1);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    let current = true;
    setAccess(null);
    void authFetch('/api/career/auth/me')
      .then(async (response) => {
        if (!current) return;
        if (response.status === 401 || response.status === 403) {
          clearAuthSession();
          queryClient.clear();
          setLocation(`/login?returnTo=${encodeURIComponent(location)}`);
          return;
        }
        if (!response.ok) throw new Error('Session check failed');
        const profile = await response.json() as UserProfile & { isAdmin?: boolean; adminToken?: string };
        if (!profile.id || !profile.email) throw new Error('Invalid session response');
        const storedProfile = readProfile();
        if (!storedProfile || storedProfile.email.toLowerCase() !== profile.email.toLowerCase()) {
          sessionStorage.removeItem(REPORT_KEY);
          sessionStorage.removeItem('bonlist-report');
          sessionStorage.removeItem(SELECTED_JOB_KEY);
          queryClient.clear();
          persistProfile(profile);
        }
        if (profile.isAdmin && profile.adminToken && getAdminToken() !== profile.adminToken) {
          persistAdminAccess(profile.adminToken, true);
        } else if (profile.isAdmin === false && isAuthAdminUser()) {
          persistAdminAccess(undefined, false);
        }
        if (current) setAccess({ location, check, status: 'allowed' });
      })
      .catch(() => {
        if (current) setAccess({ location, check, status: 'unavailable' });
      });
    return () => { current = false; };
  }, [location, check, setLocation]);

  if (!access || access.location !== location || access.check !== check) {
    return <div className="grid min-h-[100dvh] place-items-center bg-background text-sm text-muted-foreground">Checking your session…</div>;
  }
  if (access.status === 'unavailable') {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background px-5 text-center">
        <div>
          <p className="text-sm text-foreground">We could not verify your sign-in right now.</p>
          <button type="button" className="btn-primary mt-4" onClick={() => setCheck((value) => value + 1)}>Try again</button>
          <Link href="/login" className="mt-4 block text-sm text-primary">Go to sign in</Link>
        </div>
      </div>
    );
  }

  const isAdmin = location === '/admin' || location.startsWith('/admin/');
  return isAdmin ? (
    <RoutedErrorBoundary><AdminRoute /></RoutedErrorBoundary>
  ) : (
    <RoutedErrorBoundary>
      <AppShell>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/settings/security" component={SecuritySettingsPage} />
          <Route path="/security/admin-mfa" component={AdminMfaSetupPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/diagnostic" component={DiagnosticPage} />
          <Route path="/jobs/:id" component={JobDetailPage} />
          <Route path="/jobs" component={JobsPage} />
          <Route path="/interview" component={InterviewPage} />
          <Route path="/pricing" component={PricingPage} />
          <Route path="/programme" component={ProgrammePage} />
          <Route path="/cv-builder" component={CvBuilderPage} />
          <Route path="/coaching" component={CoachingPage} />
          <Route component={NotFound} />
        </Switch>
      </AppShell>
    </RoutedErrorBoundary>
  );
}

function Router() {
  const [location] = useLocation();
  const pathname = location.split('?')[0];
  if (PUBLIC_AUTH_PATHS.has(pathname)) {
    return (
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/login" component={LoginPage} />
          <Route path="/signup" component={SignupPage} />
          <Route path="/forgot-password" component={ForgotPasswordPage} />
          <Route path="/reset-password" component={ResetPasswordPage} />
          <Route path="/auth/callback" component={AuthCallbackPage} />
        </Switch>
      </RoutedErrorBoundary>
    );
  }
  if (pathname === '/') {
    return (
      <RoutedErrorBoundary>
        <AppShell>
          <Home />
        </AppShell>
      </RoutedErrorBoundary>
    );
  }
  return <ProtectedApp />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
