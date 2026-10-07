import { lazy, Suspense, type ReactNode, type FormEvent, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { ErrorBoundary } from '@/components/error-boundary';
import { SuggestedRoles } from '@/components/jobs/SuggestedRoles';
import { MatchCountBanner } from '@/components/jobs/MatchCountBanner';
import { normalizeDiagnosticReport } from '@/lib/diagnostic-data';
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
  House,
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
import { trackPageVisit } from '@/pages/admin/tracking';
import PricingPage from '@/pages/pricing';
import { PaidAccessProvider, fetchUnlockedJob, isJobUnlocked, requestPayment, usePaidAccess } from '@/lib/yoco';
import { PaymentResultPage, YocoCheckoutHost } from '@/components/YocoCheckout';
import ProgrammePage from '@/pages/programme';
import CvDashboardPage from '@/pages/CvDashboard';
import OfflineWorkstationPage from '@/pages/OfflineWorkstation';
import { AppUpdatePrompt, UpdatesPage } from '@/pages/UpdatesPage';
import { SmokeyAgent } from '@/components/smokey-agent';
import {
  defaultEntitlement,
  fetchEntitlement,
  type Entitlement,
} from '@/lib/entitlements';
import { ensureCvProfile } from '@/lib/cv-profile';
import { buildParseUploadBody, readFileAsDataUrl } from '@/lib/cv-parse-upload';
import {
  announceJobMatches,
  JOB_MATCHES_FOUND_EVENT,
  isJobMatchesPath,
  markJobMatchesRead,
  useUnreadJobMatches,
} from '@/lib/job-match-notifications';
import { JobListingCard, JobListingDetails } from '@/components/jobs/JobListingCard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { SeoManager } from '@/components/SeoManager';
import { isKnownAppPath } from '@/lib/seo-policy';
import { CookieConsent } from '@/components/CookieConsent';
import { AdProvider } from '@/components/AdProvider';
import { CareerAdviceCategoryPage, CareerAdviceIndexPage, CareerArticlePage } from '@/pages/CareerAdvice';
import { PublicJobCategoryPage, PublicJobsIndexPage } from '@/pages/PublicJobs';
import SharedCvPage from '@/pages/SharedCv';
import { TrustPage } from '@/pages/TrustPages';
import { findPublicJobCategory } from '@/content/public-jobs';
import { directApplicationUrl, normalizeJobResults, toJobListing, type JobDetailsPayload, type JobListingSource } from '@/types/job';

const CvBuilderPage = lazy(() => import('@/pages/cv-builder'));
const AdminRoute = lazy(() => import('@/pages/admin/AdminDashboard').then((module) => ({ default: module.AdminRoute })));

import { isNativeApp } from '@/lib/platform';
import { describeApiMisconfiguration } from '@/lib/api-base';
import { beginSignOut, installSignedOutNavigation, resetSignedOutNavigation } from '@/lib/sign-out';
import { triggerAndroidApkDownload } from '@/lib/download-apk';
import { ThemeToggle } from '@/components/theme-provider';
import { getNativeCv, isOfflineWorkstationActive, listNativeCvs, startNativeCvSync } from '@/lib/native-cv-store';
import {
  clearAuthSession,
  isExplicitlySignedOut,
  dismissSecurityNudgeLocal,
  hasProfile as hasAuthProfile,
  getSessionToken,
  getAdminToken,
  isAdminUser as isAuthAdminUser,
  persistAdminAccess,
  persistProfile,
  persistSessionToken,
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
  // The authenticated API now redacts locked content without changing job IDs.
  // Keep stable IDs so checkout and paid reveals refer to the saved vacancy.
  return normalizeDiagnosticReport(report);
}

function persistSelectedJob(job: JobMatch) {
  sessionStorage.setItem(SELECTED_JOB_KEY, JSON.stringify(job));
}

function findJobFromSession(jobId: string): JobMatch | null {
  try {
    const selected = sessionStorage.getItem(SELECTED_JOB_KEY);
    if (selected) {
      const parsed = JSON.parse(selected) as JobMatch;
      if (String(parsed.id) === jobId) return parsed;
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
  return directApplicationUrl(job);
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
  workspaceMode = false,
}: {
  profileReady: boolean;
  profile: UserProfile | null;
  isAdmin: boolean;
  onLogout: () => void;
  compact?: boolean;
  workspaceMode?: boolean;
}) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  if (profileReady && profile) {
    return (
      <div className={`flex items-center ${compact ? 'w-full flex-col gap-2' : 'gap-1.5 xl:gap-2'}`}>
        {!workspaceMode && !compact ? <Link
          href="/dashboard"
          className={`rounded-xl px-2.5 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground ${compact ? 'w-full border border-border text-center' : 'hidden sm:inline-flex'}`}
          data-testid="link-header-my-resumes"
        >
          My Resumes
        </Link> : null}
        <div className="relative">
          {compact ? (
            <Link
              href="/profile"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 active:bg-slate-100"
              data-testid="button-mobile-profile"
              aria-label="Open profile details"
            >
              <span className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{profile.name.charAt(0).toUpperCase()}</span>
              <span>Profile</span>
            </Link>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((open) => !open)}
                className={`inline-flex items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2 text-sm font-medium text-foreground hover:border-primary/30 xl:px-3 ${workspaceMode ? '!h-9 !w-9 !justify-center !rounded-full !p-0' : ''}`}
                data-testid="button-header-account-menu"
                aria-expanded={profileMenuOpen}
                aria-haspopup="menu"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary text-xs font-bold text-primary">{profile.name.charAt(0).toUpperCase()}</span>
                {!workspaceMode ? <span className="hidden max-w-[7rem] truncate sm:inline xl:max-w-[9rem]">{profile.name.split(' ')[0]}</span> : null}
                {!workspaceMode ? <ChevronDown size={14} className="text-muted-foreground" /> : null}
              </button>
              {profileMenuOpen ? (
                <div role="menu" className="absolute right-0 top-full z-[70] mt-2 w-56 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
                  <Link role="menuitem" href="/profile" onClick={() => setProfileMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-muted" data-testid="link-profile-menu-account">Profile &amp; account settings</Link>
                  {workspaceMode ? <Link role="menuitem" href="/dashboard" onClick={() => setProfileMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-muted">My saved CVs</Link> : null}
                  <Link role="menuitem" href="/settings/security" onClick={() => setProfileMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-muted" data-testid="link-profile-menu-security">Security settings</Link>
                  {isAdmin ? <Link role="menuitem" href="/admin" onClick={() => setProfileMenuOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-semibold text-primary hover:bg-muted" data-testid="link-profile-menu-admin">Admin Console</Link> : null}
                  {workspaceMode ? <button role="menuitem" type="button" onClick={() => { setProfileMenuOpen(false); onLogout(); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted">Log out</button> : null}
                </div>
              ) : null}
            </>
          )}
        </div>
        {Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' ? (
          <Link
            href="/app/updates"
            className={`rounded-xl px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground xl:px-3 ${
              compact ? 'w-full border border-border text-center' : 'hidden sm:inline'
            }`}
            data-testid="link-header-updates"
          >
            Updates
          </Link>
        ) : null}
        {(!workspaceMode || compact) ? <button
          type="button"
          onClick={onLogout}
          className={`pointer-events-auto min-h-11 touch-manipulation rounded-xl px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground xl:px-3 ${
            compact ? 'w-full border border-border' : ''
          }`}
          data-testid="button-header-logout"
        >
          Log out
        </button> : null}
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
        <>
          <img
            src="/brand/bonlist-mark.png"
            alt="BonList"
            className="h-8 w-8 object-contain sm:hidden"
            width={32}
            height={32}
          />
          <img
            src="/brand/bonlist-logo.png"
            alt="BonList - Your Shortcut to Getting Hired."
            className="hidden h-10 w-auto max-w-[min(240px,56vw)] object-contain object-left sm:block"
            height={40}
          />
        </>
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
          { label: 'Authentic Verification', text: 'Review every listed achievement against your real experience and supporting records before using it.' }
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
  const unreadMatchesCount = useUnreadJobMatches();
  const [matchAlertCount, setMatchAlertCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeMobileDropdown, setActiveMobileDropdown] = useState<'resume' | 'tools' | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileDropdownRef = useRef<HTMLDivElement>(null);
  const [cvReady, setCvReady] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const loggingOut = useRef(false);
  const [activeDropdown, setActiveDropdown] = useState<'resume' | 'tools' | null>(null);
  const [guideModalTopic, setGuideModalTopic] = useState<string | null>(null);
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
        setActiveMobileDropdown(null);
        setGuideModalTopic(null);
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!menuOpen && !activeMobileDropdown) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      const insideMenu = target instanceof Node && mobileMenuRef.current?.contains(target);
      const insideDropdown = target instanceof Node && mobileDropdownRef.current?.contains(target);
      if (!insideMenu && !insideDropdown) {
        setMenuOpen(false);
        setActiveMobileDropdown(null);
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('touchstart', closeOnOutside, { passive: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('touchstart', closeOnOutside);
    };
  }, [menuOpen, activeMobileDropdown]);

  useEffect(() => {
    setActiveDropdown(null);
    setMenuOpen(false);
    setActiveMobileDropdown(null);
    // Always land at the top of the new route (fixes empty screen after long pages like Diagnostic)
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location]);

  useEffect(() => {
    const showMatchAlert = (event: Event) => {
      const count = Number((event as CustomEvent<{ count?: number }>).detail?.count || 0);
      setMatchAlertCount(Math.max(0, count));
    };
    window.addEventListener(JOB_MATCHES_FOUND_EVENT, showMatchAlert);
    return () => window.removeEventListener(JOB_MATCHES_FOUND_EVENT, showMatchAlert);
  }, []);

  useEffect(() => {
    if (isJobMatchesPath(location)) {
      markJobMatchesRead();
      setMatchAlertCount(0);
    }
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
    if (loggingOut.current) return;
    loggingOut.current = true;
    console.info('[Auth] Sign out requested');
    setLogoutError('');
    try {
      const cleanup = beginSignOut();
      setProfile(null);
      setIsAdmin(false);
      setMenuOpen(false);
      setActiveMobileDropdown(null);
      setLocation('/login?signingOut=1', { replace: true });
      // Optional cache/cookie cleanup must not interrupt the navigation reset.
      try {
        markJobMatchesRead();
        void queryClient.cancelQueries().catch(error => console.warn('[Auth] Query cancellation failed', error));
        queryClient.clear();
      } catch (error) {
        console.warn('[Auth] Optional logout cleanup failed', error);
      }
      await cleanup;
    } catch (error) {
      console.error('[Auth] Sign out failed; forcing local reset', error);
    } finally {
      // Native routing unmounts protected views without reloading the WebView.
      try { clearAuthSession(); }
      finally {
        loggingOut.current = false;
        resetSignedOutNavigation(path => setLocation(path, { replace: true }));
      }
    }
  };

  const [showNudge, setShowNudge] = useState(false);
  useEffect(() => {
    setShowNudge(Boolean(profile) && shouldShowSecurityNudge());
  }, [profile]);

  const isCvBuilder = location === '/cv-builder' || location.startsWith('/cv-builder/');
  const inNativeApp = isNativeApp();

  return (
    <div className={`min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-background text-foreground ${isCvBuilder ? 'flex h-[100dvh] min-h-0 flex-col overflow-hidden' : ''}`}>
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
          <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center justify-between gap-1.5 px-2.5 min-[390px]:gap-2 min-[390px]:px-3 sm:min-h-16 sm:gap-4 sm:px-5 md:px-8">
          <div className="min-w-0 shrink-0">
            <LogoMark />
          </div>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex" aria-label="Primary navigation">
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
                  activeDropdown === 'resume' || location === '/cv-builder' || location === '/diagnostic' || location === '/jobs'
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                }`}
                aria-expanded={activeDropdown === 'resume'}
                aria-haspopup="true"
              >
                <span>Resume</span>
                <JobMatchBadge count={unreadMatchesCount} />
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
                          href="/jobs"
                          onClick={() => setActiveDropdown(null)}
                          className="group flex items-center gap-3.5 rounded-xl p-2.5 transition-colors hover:bg-muted/70"
                          data-testid="link-nav-resume-job-matches"
                        >
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/10 text-blue-600 transition-colors group-hover:bg-blue-600 group-hover:text-white dark:text-blue-400">
                            <BriefcaseBusiness size={18} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="inline-flex items-center gap-2 text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                              <span>Job Matches</span>
                              <JobMatchBadge count={unreadMatchesCount} />
                            </div>
                            <div className="text-xs text-muted-foreground">Roles matched to your reviewed CV</div>
                          </div>
                        </Link>

                        <Link
                          href="/cv-builder/templates"
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
                  activeDropdown === 'tools' || location === '/interview' || location === '/coaching' || location === '/programme'
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

            <Link
              href="/career-advice"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                location.startsWith('/career-advice')
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
              data-testid="link-nav-career-advice"
            >
              Career Advice
            </Link>

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
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setActiveMobileDropdown((current) => current === 'resume' ? null : 'resume');
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted md:hidden"
              aria-label="Open Resume navigation"
              aria-haspopup="menu"
              aria-expanded={activeMobileDropdown === 'resume'}
            >
              Resume
              <JobMatchBadge count={unreadMatchesCount} />
              <ChevronDown size={13} className={`transition-transform ${activeMobileDropdown === 'resume' ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setActiveMobileDropdown((current) => current === 'tools' ? null : 'tools');
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted md:hidden"
              aria-label="Open Tools navigation"
              aria-haspopup="menu"
              aria-expanded={activeMobileDropdown === 'tools'}
            >
              Tools
              <ChevronDown size={13} className={`transition-transform ${activeMobileDropdown === 'tools' ? 'rotate-180' : ''}`} />
            </button>
              <Link href="/pricing" className="hidden rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 p-[1px] shadow-sm shadow-indigo-500/20 sm:inline-flex" data-testid="link-header-upgrade">
                <span className="rounded-full bg-background px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/60">Upgrade</span>
              </Link>
            <ThemeToggle />
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
              className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-card xl:hidden"
              onClick={() => {
                setActiveMobileDropdown(null);
                setMenuOpen((open) => !open);
              }}
              data-testid="button-mobile-menu"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile account and general navigation menu */}
        {menuOpen && typeof document !== 'undefined' && createPortal((
          <>
            <button
              type="button"
              className="fixed inset-x-0 bottom-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-[100] bg-slate-950/40 backdrop-blur-[2px] xl:hidden"
              onClick={() => setMenuOpen(false)}
              aria-label="Close navigation menu"
            />
            <div
              ref={mobileMenuRef}
              onClickCapture={(event) => {
                const target = event.target;
                if (target instanceof Element && target.closest('a, button') && !target.closest('[data-mobile-menu-stay-open]')) {
                  setMenuOpen(false);
                }
              }}
              className="fixed left-4 right-4 top-[calc(4rem+env(safe-area-inset-top))] z-[101] mx-auto flex max-h-[min(78vh,42rem)] max-w-lg flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl xl:hidden"
              aria-label="Account and app navigation"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-foreground">Account & BonList</p>
                <button type="button" onClick={() => setMenuOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close menu"><X size={18} /></button>
              </div>
              <nav className="grid gap-1" aria-label="General navigation">
                <Link href="/my-resumes" className="rounded-xl px-3 py-3 text-sm font-medium text-foreground hover:bg-muted">My Resumes</Link>
                <Link href="/career-advice" className="rounded-xl px-3 py-3 text-sm font-medium text-foreground hover:bg-muted">Career Advice</Link>
                <Link href="/jobs/explore" className="rounded-xl px-3 py-3 text-sm font-medium text-foreground hover:bg-muted">Job Guides</Link>
                <Link href="/pricing" className="rounded-xl px-3 py-3 text-sm font-medium text-foreground hover:bg-muted">Pricing</Link>
                {!inNativeApp && <button type="button" onClick={() => triggerAndroidApkDownload()} className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-medium text-foreground hover:bg-muted"><Smartphone size={17} />Download Android APK</button>}
              </nav>
              <div className="border-t border-border pt-3">
                <HeaderAuthActions profileReady={profileReady} profile={profile} isAdmin={isAdmin} onLogout={handleLogout} compact />
              </div>
            </div>
          </>
        ), document.body)}

        {/* Independent mobile Resume and Tools dropdowns */}
        {activeMobileDropdown && typeof document !== 'undefined' && createPortal((
          <>
            <button
              type="button"
              className="fixed inset-x-0 bottom-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-[100] bg-slate-950/35 backdrop-blur-[1px] md:hidden"
              onClick={() => setActiveMobileDropdown(null)}
              aria-label="Close navigation dropdown"
            />
            <div
              ref={mobileDropdownRef}
              onClickCapture={(event) => {
                const target = event.target;
                if (target instanceof Element && target.closest('a, button')) setActiveMobileDropdown(null);
              }}
              className="fixed left-3 right-3 top-[calc(4rem+env(safe-area-inset-top))] z-[101] mx-auto max-h-[min(78vh,42rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl md:hidden"
              aria-label={activeMobileDropdown === 'resume' ? 'Resume navigation' : 'Tools navigation'}
              role="menu"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{activeMobileDropdown === 'resume' ? 'Resume' : 'Tools'}</p>
                  <h2 className="mt-1 text-base font-bold text-foreground">{activeMobileDropdown === 'resume' ? 'Resume resources' : 'Career tools'}</h2>
                </div>
                <button type="button" onClick={() => setActiveMobileDropdown(null)} className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close dropdown"><X size={18} /></button>
              </div>
              {activeMobileDropdown === 'resume' ? (
                <div className="grid gap-5">
                  <section>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tools</p>
                    <div className="grid gap-1">
                      <Link role="menuitem" href="/cv-builder?intake=1" className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">AI Resume Builder</Link>
                      <Link role="menuitem" href="/diagnostic" className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">Resume Checker</Link>
                      <Link role="menuitem" href="/jobs" className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"><span>Job Matches</span><JobMatchBadge count={unreadMatchesCount} verbose /></Link>
                      <Link role="menuitem" href="/cv-builder/templates" className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">Resume Templates</Link>
                      <Link role="menuitem" href="/cv-builder?intake=1" className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">Resume Examples</Link>
                    </div>
                  </section>
                  <section>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Learning</p>
                    <div className="grid gap-1">
                      <button role="menuitem" type="button" onClick={() => setGuideModalTopic('how-to-write-a-resume')} className="rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted">How to write a resume</button>
                      <button role="menuitem" type="button" onClick={() => setGuideModalTopic('resume-format')} className="rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted">Choosing a resume format</button>
                      <button role="menuitem" type="button" onClick={() => setGuideModalTopic('resume-summary')} className="rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted">Writing a resume summary</button>
                      <button role="menuitem" type="button" onClick={() => setGuideModalTopic('one-page-resume')} className="rounded-xl px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted">Fit your experience on one page</button>
                    </div>
                  </section>
                </div>
              ) : (
                <section>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Career utilities</p>
                  <div className="grid gap-1">
                    <Link role="menuitem" href="/diagnostic" className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">CV Diagnostic</Link>
                    <Link role="menuitem" href="/diagnostic" className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">ATS Optimizer</Link>
                    <Link role="menuitem" href="/cv-builder?intake=1" className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">Cover Letter Generator</Link>
                    <Link role="menuitem" href="/interview" className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">Interview Prep</Link>
                    <Link role="menuitem" href="/coaching" className="rounded-xl px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted">Career Coaching</Link>
                  </div>
                </section>
              )}
            </div>
          </>
        ), document.body)}
      </header>

      {matchAlertCount > 0 && location !== '/jobs' && !location.startsWith('/jobs/') && typeof document !== 'undefined' ? createPortal(
        <aside
          className="fixed inset-x-4 top-[calc(4.5rem+env(safe-area-inset-top))] z-[90] mx-auto max-w-sm rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:top-auto sm:m-0 sm:w-[24rem] dark:border-emerald-800 dark:bg-slate-950"
          role="status"
          aria-live="polite"
          data-testid="job-matches-alert"
        >
          <button type="button" onClick={() => setMatchAlertCount(0)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Dismiss job matches alert"><X size={16} /></button>
          <div className="flex gap-3 pr-7">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><BriefcaseBusiness size={20} /></span>
            <div>
              <p className="text-sm font-bold text-slate-950 dark:text-white">🎉 Good news!</p>
              <p className="mt-1 text-sm leading-5 text-slate-600 dark:text-slate-300">We found {matchAlertCount} job {matchAlertCount === 1 ? 'match' : 'matches'} tailored to your CV.</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={() => setMatchAlertCount(0)} className="min-h-10 rounded-xl px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Check later</button>
            <button type="button" onClick={() => { markJobMatchesRead(); setMatchAlertCount(0); setLocation('/jobs'); }} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-700">View Job Matches <ArrowRight size={14} /></button>
          </div>
        </aside>,
        document.body,
      ) : null}

      <CareerGuideModal
        topicId={guideModalTopic}
        onClose={() => setGuideModalTopic(null)}
        onSelectTopic={(id) => setGuideModalTopic(id)}
      />

      <div className={`w-full max-w-full min-w-0 overflow-x-hidden ${isCvBuilder ? 'flex min-h-0 flex-1 flex-col' : ''}`}>
      <main className={`w-full max-w-full min-w-0 overflow-x-hidden ${location === '/' ? '' : 'page-enter'} ${isCvBuilder ? 'flex-1 flex flex-col' : ''}`}>{children}</main>

      {!isCvBuilder && (
        <footer className="mt-16 border-t border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 pb-[max(2.5rem,calc(2.5rem+var(--safe-bottom)))] md:flex-row md:items-center md:justify-between md:px-8">
            <div className="space-y-3">
              <LogoMark />
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                Your CV workspace for building, improving and keeping a career document ready for what comes next.
              </p>
              <nav aria-label="Privacy and support" className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-muted-foreground">
                <Link href="/about" className="hover:text-primary">About</Link>
                <Link href="/career-advice" className="hover:text-primary">Career Advice</Link>
                <Link href="/jobs/explore" className="hover:text-primary">Job Guides</Link>
                <Link href="/privacy" className="hover:text-primary">Privacy</Link>
                <Link href="/terms" className="hover:text-primary">Terms</Link>
                <Link href="/cookies" className="hover:text-primary">Cookies</Link>
                <Link href="/data" className="hover:text-primary">Data handling &amp; deletion</Link>
                <Link href="/contact" className="hover:text-primary">Contact</Link>
                <Link href="/advertise" className="hover:text-primary">Business enquiries</Link>
              </nav>
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
    <div className="mb-8 flex w-full max-w-full min-w-0 flex-col justify-between gap-5 md:mb-10 md:flex-row md:items-end">
      <div className="min-w-0">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        <h1 className="display max-w-3xl break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl md:text-4xl">
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
            After your CV review, view tailored roles. Matches below 50% are free; unlock higher-scoring matches with R30 daily access or use seven-day Mega Access.
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
  const [entitlement, setEntitlement] = useState<Entitlement>(defaultEntitlement());
  const [latestReport, setLatestReport] = useState<DiagnosticReport | null>(() => {
    try {
      const stored = sessionStorage.getItem(REPORT_KEY) || sessionStorage.getItem('bonlist-report');
      return stored ? reportForCurrentViewer(JSON.parse(stored) as DiagnosticReport) : null;
    } catch { return null; }
  });
  const [reportUpdatedAt, setReportUpdatedAt] = useState<Date | null>(() => {
    try {
      const stored = sessionStorage.getItem('bonlist-report-updated-at');
      return stored ? new Date(stored) : null;
    } catch { return null; }
  });
  const [fileName, setFileName] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [isCvDragging, setIsCvDragging] = useState(false);
  const [role, setRole] = useState('');
  const [locationArea, setLocationArea] = useState('');
  const [scanStep, setScanStep] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const cvFileInputRef = useRef<HTMLInputElement | null>(null);
  const hasReport = Boolean(latestReport);

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
    let stop: (() => void) | undefined;
    let disposed = false;
    void startNativeCvSync().then((cleanup) => { if (disposed) cleanup(); else stop = cleanup; });
    return () => { disposed = true; stop?.(); };
  }, []);

  useEffect(() => {
    const refreshReport = () => {
      try {
        const stored = sessionStorage.getItem(REPORT_KEY) || sessionStorage.getItem('bonlist-report');
        setLatestReport(stored ? reportForCurrentViewer(JSON.parse(stored) as DiagnosticReport) : null);
        const timestamp = sessionStorage.getItem('bonlist-report-updated-at');
        setReportUpdatedAt(timestamp ? new Date(timestamp) : null);
      } catch { setLatestReport(null); setReportUpdatedAt(null); }
    };
    window.addEventListener('careerbridge-report-updated', refreshReport);
    return () => window.removeEventListener('careerbridge-report-updated', refreshReport);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    const refreshEntitlement = () => {
      void fetchEntitlement(profile.id).then(setEntitlement).catch(() => setEntitlement(defaultEntitlement(profile.id)));
    };
    refreshEntitlement();
    window.addEventListener('careerbridge-entitlement-updated', refreshEntitlement);
    return () => window.removeEventListener('careerbridge-entitlement-updated', refreshEntitlement);
  }, [profile?.id]);

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
      const completedAt = new Date();
      sessionStorage.setItem('bonlist-report-updated-at', completedAt.toISOString());
      setLatestReport(reportForCurrentViewer(payload as DiagnosticReport));
      setReportUpdatedAt(completedAt);
      window.dispatchEvent(new Event('careerbridge-report-updated'));
      announceJobMatches(Array.isArray((payload as DiagnosticReport).relatedJobs) ? (payload as DiagnosticReport).relatedJobs.length : 0);
      setLocation('/diagnostic');
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'We could not review that CV. Please try again.');
    } finally {
      setIsReviewing(false);
    }
  };

  const selectDiagnosticFile = (file: File | null) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedExtensions = ['pdf', 'docx', 'txt'];
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/octet-stream',
    ];
    if (!allowedExtensions.includes(extension) || (file.type && !allowedMimeTypes.includes(file.type))) {
      setCvFile(null);
      setFileName('');
      setReviewError('Choose a PDF, Word (.docx), or text (.txt) CV file.');
      if (cvFileInputRef.current) cvFileInputRef.current.value = '';
      return;
    }
    setCvFile(file);
    setFileName(file.name);
    setReviewError('');
  };

  const openDiagnosticUpload = (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    cvFileInputRef.current?.click();
  };

  const scrollToDiagnosticUpload = (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    document.getElementById('upload-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('upload-section')?.classList.add('ring-2', 'ring-primary/30');
    window.setTimeout(() => document.getElementById('upload-section')?.classList.remove('ring-2', 'ring-primary/30'), 1400);
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
    const paidPlanActive = entitlement.plan !== 'free'
      || entitlement.subscription?.status === 'active'
      || entitlement.programme?.status === 'active';
    const profileFields = [profile.name, profile.email, profile.phone, profile.targetRole, profile.location, latestReport?.summary];
    const profileCompletion = Math.round((profileFields.filter((value) => Boolean(value?.trim())).length / profileFields.length) * 100);
    const matches = (latestReport?.relatedJobs ?? []).slice(0, 4);
    const updateLabel = reportUpdatedAt && !Number.isNaN(reportUpdatedAt.getTime())
      ? (() => {
          const minutes = Math.max(0, Math.floor((Date.now() - reportUpdatedAt.getTime()) / 60_000));
          if (minutes < 1) return 'Updated just now';
          if (minutes < 60) return `Updated ${minutes} min ago`;
          const hours = Math.floor(minutes / 60);
          if (hours < 24) return `Updated ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
          const days = Math.floor(hours / 24);
          return `Updated ${days} ${days === 1 ? 'day' : 'days'} ago`;
        })()
      : 'Run a CV review to see fresh matches';
    const actionCards = [
      {
        href: '/#upload-section', title: 'CV Review',
        copy: 'Check your CV structure, ATS readiness, role fit and the areas worth improving next.',
        action: 'Review my CV', icon: FileCheck2, badge: 'FREE', tone: 'bg-emerald-500/10 text-emerald-700',
      },
      {
        href: '/cv-builder?intake=1', title: 'My CV Workspace',
        copy: 'Build, edit and keep an ATS-friendly CV that stays ready whenever an opportunity appears.',
        action: 'Open CV workspace', icon: Sparkles, badge: 'YOUR CV', tone: 'bg-sky-500/10 text-sky-700',
      },
      {
        href: '/jobs', title: 'Profile-Matched Jobs',
        copy: 'See job listings matched to the profile and CV from your latest review.',
        action: 'View Today’s Matches', icon: BriefcaseBusiness, badge: hasReport ? 'UPDATED' : 'GET STARTED', tone: 'bg-violet-500/10 text-violet-700',
      },
    ] as const;

    return (
      <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-slate-50 text-slate-900 dark:bg-[#090D16] dark:text-slate-100">
        <section className="border-b border-border bg-white dark:bg-slate-950/90">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-7 md:px-8 md:py-9">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Your career workspace</p>
                <h1 className="display mt-2 break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl md:text-4xl">Welcome back, {firstName}</h1>
              </div>
              <div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${paidPlanActive ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>
                <span className={`h-2 w-2 rounded-full ${paidPlanActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {paidPlanActive ? `Paid access · ${entitlement.planName || 'Premium'}` : 'Free workspace · Upgrade only when you need it'}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Pick up where you left off and take the next step toward your target role.</span>
            </div>
          </div>
        </section>

        <main className="mx-auto w-full max-w-7xl overflow-x-hidden px-4 py-6 pb-[calc(2rem+var(--safe-bottom))] sm:px-5 md:px-8 md:py-8 md:pb-[calc(2rem+var(--safe-bottom))]">
          <section aria-label="Quick actions" className="grid gap-4 md:grid-cols-3">
            {actionCards.map((card) => (
              <Link key={card.title} href={card.href} onClick={card.title === 'CV Review' ? openDiagnosticUpload : undefined} className="group flex min-h-48 w-full max-w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md sm:p-5 dark:border-slate-800 dark:bg-slate-900/85 dark:hover:border-indigo-800" data-testid={`dashboard-action-${card.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${card.tone}`}><card.icon size={20} /></span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">{card.badge}</span>
                </div>
                <span className="mt-4 break-words text-base font-semibold text-foreground group-hover:text-primary">{card.title}</span>
                <span className="mt-1 flex-1 break-words text-xs leading-5 text-muted-foreground">{card.copy}</span>
                <span className="mt-4 inline-flex max-w-full items-center gap-1 text-sm font-semibold text-primary">{card.action} <ArrowRight size={15} className="shrink-0" /></span>
              </Link>
            ))}
          </section>

          <section id="cv-check" className="mt-7 grid items-start gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-5">
              <article className="box-border w-full max-w-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur-md transition-all hover:shadow-md sm:p-6 dark:border-slate-800 dark:bg-slate-900/85">
                <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Next best action</p>
                    <h2 className="mt-1 break-words text-base font-bold text-foreground sm:text-lg">Profile completeness</h2>
                  </div>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{profileCompletion}% complete</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-label="Profile completeness" aria-valuenow={profileCompletion} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${profileCompletion}%` }} />
                </div>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">Upload an updated CV to refresh your profile review and job matches.</p>
                <button type="button" onClick={scrollToDiagnosticUpload} className="mt-3 inline-flex max-w-full items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80">Update your CV <ArrowRight size={15} className="shrink-0" /></button>
              </article>

              <article className="box-border w-full max-w-full overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur-md transition-all hover:shadow-md sm:p-6 dark:border-slate-800 dark:bg-slate-900/85">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">From your latest CV review</p>
                    <h2 className="mt-1 break-words text-base font-bold text-foreground sm:text-lg">Profile-matched jobs</h2>
                  </div>
                  <span className="text-xs text-muted-foreground">{updateLabel}</span>
                </div>
                {matches.length ? (
                  <div className="mt-4 divide-y divide-border">
                    {matches.map((job: JobMatch) => (
                      <Link key={job.id} href="/jobs" className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground">{job.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{job.company || 'Company'}{job.location ? ` · ${job.location}` : ''}</span></span>
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200">{job.match}% match</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-muted-foreground dark:bg-slate-800/70">Upload your CV for a review to see the latest matching jobs here.</div>
                )}
                <Link href="/jobs" className="mt-4 inline-flex max-w-full items-center gap-1 text-sm font-semibold text-primary hover:text-primary/80">See all matched jobs <ArrowRight size={15} className="shrink-0" /></Link>
              </article>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Free CV review</p>
                <h2 className="mt-1 text-lg font-semibold text-foreground">Upload your CV</h2>
                <p className="mt-1 text-sm text-muted-foreground">Get a CV score, ATS feedback, and role-fit guidance.</p>
              </div>
              <form
              onSubmit={submitDiagnostic}
              id="upload-section"
              className="box-border w-full max-w-full overflow-hidden rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-6 dark:bg-slate-900"
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
                  <label
                    className="block"
                    onDragOver={(event) => { event.preventDefault(); setIsCvDragging(true); }}
                    onDragEnter={(event) => { event.preventDefault(); setIsCvDragging(true); }}
                    onDragLeave={(event) => { event.preventDefault(); setIsCvDragging(false); }}
                    onDrop={(event) => { event.preventDefault(); setIsCvDragging(false); selectDiagnosticFile(event.dataTransfer.files?.[0] ?? null); }}
                  >
                    <span className="mb-2 block text-xs font-semibold text-foreground">Upload your current CV</span>
                    <span
                      className={`flex min-h-16 w-full max-w-full min-w-0 cursor-pointer items-center gap-2 overflow-hidden rounded-2xl border border-dashed px-3 py-3 transition-colors sm:gap-3 sm:px-4 sm:py-4 ${
                        isCvDragging
                          ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                          : fileName
                          ? 'border-primary/50 bg-secondary'
                          : 'border-border bg-muted/50 hover:border-primary/40'
                      }`}
                    >
                      <input
                        type="file"
                        ref={cvFileInputRef}
                        accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                        className="sr-only"
                        onChange={(event) => {
                          selectDiagnosticFile(event.target.files?.[0] ?? null);
                        }}
                        data-testid="input-cv-file"
                      />
                      <FileText size={18} className={`shrink-0 ${fileName ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground" title={fileName || undefined}>
                        {fileName || 'PDF or Word document'}
                      </span>
                      {fileName ? (
                        <CheckCircle2 size={17} className="shrink-0 text-primary" />
                      ) : (
                        <span className="shrink-0 rounded-lg bg-background px-2 py-1 text-[10px] font-bold text-foreground">
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
              <div className="box-border w-full max-w-full overflow-hidden rounded-2xl border border-border bg-white p-4 shadow-sm sm:p-5 dark:bg-slate-900">
                <h3 className="text-sm font-semibold text-foreground">More career tools</h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    { label: 'Interview Practice', href: '/interview', icon: Bot },
                    { label: 'Career Guidance', href: '/coaching', icon: HeartHandshake },
                    { label: 'My Saved CVs', href: '/dashboard', icon: FileText },
                    { label: 'Subscription & Upgrade', href: '/pricing', icon: ShieldCheck },
                  ].map((item) => (
                    <Link key={item.href} href={item.href} className="flex min-h-14 min-w-0 items-center gap-2 overflow-hidden rounded-xl bg-slate-50 px-2.5 py-2 text-xs font-medium text-foreground transition hover:bg-secondary sm:px-3">
                      <item.icon size={16} className="shrink-0 text-primary" />{item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>
      </main>
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
              alt="BonList"
              className="h-[4.5rem] w-auto max-w-[min(480px,94vw)] object-contain object-left sm:h-20 md:h-24"
            />
            <h1 className="display mt-5 max-w-xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl md:text-[2.75rem] md:leading-[1.1]">
              Your CV. Always ready.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground md:text-lg">
              Build a professional CV, keep it current, and use practical career tools when you need them. Your work stays yours throughout your career.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup?returnTo=/cv-builder" className="btn-primary" data-testid="link-start-profile">
                Build My CV <ArrowRight size={16} />
              </Link>
              <Link href="/signup?returnTo=/#upload-section" className="btn-secondary" data-testid="link-how-review-works">Review My CV</Link>
            </div>
            <p className="mt-4 text-sm font-semibold text-foreground">Build it once. Own it for life.</p>
          </div>
          <div className="rise-in delay-1">
            <HeroProductVisual />
          </div>
        </div>
      </section>

      <section id="cv-check" className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <div className="grid items-start gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Your starting point</p>
            <h2 className="display mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Bring your current CV, or start fresh.
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
              Create a secure profile to save your work, review your CV and keep one career document ready for every next move.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />
                Save and update your CV from one workspace
              </li>
              <li className="flex gap-2">
                <FileCheck2 size={16} className="mt-0.5 shrink-0 text-primary" />
                Get practical feedback and relevant role matches
              </li>
            </ul>
          </div>
          <div className="box-border w-full max-w-full rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6 md:p-8" data-testid="cv-locked-panel">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
              <Lock size={20} />
            </div>
            <h3 className="display mt-5 text-2xl font-semibold text-foreground">Create a profile to continue</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Your profile keeps your CV, reviews and purchased templates connected to you across sessions and devices.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/login" className="btn-secondary" data-testid="link-login-from-cv">
                Log in
              </Link>
              <Link href="/signup" className="btn-primary" data-testid="link-create-profile-from-cv">
                Create account <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-20">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">How it works</p>
          <h2 className="display mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            One CV workspace for your working life.
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
            Keep the essentials free, own purchased templates permanently, and use focused help only when it adds value.
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: FileText,
              title: 'Build',
              copy: 'Create and maintain one clear, professional CV in a guided workspace.',
              delay: 'delay-1',
            },
            {
              icon: FileCheck2,
              title: 'Improve',
              copy: 'Review ATS readiness, strengthen wording and tailor your CV when needed.',
              delay: 'delay-2',
            },
            {
              icon: ShieldCheck,
              title: 'Own',
              copy: 'Unlock a paid template once and keep using it for life on your account.',
              delay: 'delay-3',
            },
            { icon: BriefcaseBusiness, title: 'Apply', copy: 'Find relevant openings and prepare for the conversations that follow.', delay: 'delay-3' },
          ].map((step) => (
            <div key={step.title} className={`rise-in ${step.delay} border-t-2 border-primary pt-5`}>
              <step.icon className="text-primary" size={22} />
              <h3 className="mt-5 text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-border bg-slate-50/80 dark:bg-slate-950/50">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-16 md:grid-cols-3 md:px-8 md:py-20">
          <article className="rounded-3xl border border-border bg-card p-7 shadow-sm">
            <ShieldCheck className="text-primary" size={24} />
            <h2 className="display mt-5 text-2xl font-semibold text-foreground">Permanent template ownership</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Paid CV templates are a once-off R50 purchase. Once unlocked, the template remains available to your account for future edits and downloads.</p>
          </article>
          <article className="rounded-3xl border border-border bg-card p-7 shadow-sm">
            <Sparkles className="text-primary" size={24} />
            <h2 className="display mt-5 text-2xl font-semibold text-foreground">Help when you need it</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Use BonList credits for focused CV improvements, ATS reviews and job-specific tailoring. You always see the credit cost before confirming.</p>
          </article>
          <article className="rounded-3xl border border-border bg-card p-7 shadow-sm">
            <Smartphone className="text-primary" size={24} />
            <h2 className="display mt-5 text-2xl font-semibold text-foreground">Web and Android</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Continue your career work across the BonList website and Android app with the same secure account and saved CVs.</p>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 text-center md:px-8 md:py-20">
        <h2 className="display text-3xl font-semibold text-foreground md:text-4xl">Keep your next opportunity within reach.</h2>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Start with the free workspace, build a CV you can keep current, and add premium tools only when they help you move forward.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/signup?returnTo=/cv-builder" className="btn-primary">Build My CV <ArrowRight size={16} /></Link>
          <Link href="/login" className="btn-secondary">Log in</Link>
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
        className="box-border w-full max-w-full rounded-3xl border border-border bg-card p-4 sm:p-6 md:p-8"
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
      <section className="mt-8 rounded-3xl border border-border bg-card p-5 md:p-7" aria-labelledby="profile-security-heading">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Account settings</p>
          <h2 id="profile-security-heading" className="mt-1 text-lg font-semibold text-foreground">Security</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage sign-in methods, two-factor authentication, passkeys, and active sessions.</p>
        </div>
        <SecuritySettingsPage embedded />
      </section>
    </div>
  );
}

function DiagnosticPage() {
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useLocation();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeWorkstationTab, setActiveWorkstationTab] = useState<'review' | 'jobs' | 'advice'>('review');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewFile, setReviewFile] = useState<File | null>(null);
  const [reviewFileName, setReviewFileName] = useState('');
  const [reviewRole, setReviewRole] = useState('');
  const [reviewArea, setReviewArea] = useState('');
  const [reviewDragging, setReviewDragging] = useState(false);
  const [reviewInProgress, setReviewInProgress] = useState(false);
  const [reviewProgressStep, setReviewProgressStep] = useState(0);
  const [reviewUploadError, setReviewUploadError] = useState('');
  const reviewFileInputRef = useRef<HTMLInputElement | null>(null);
  const unreadMatchesCount = useUnreadJobMatches();

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
        if (!cancelled) setReport(reportForCurrentViewer(payload));
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
    setMobileSidebarOpen(false);
    setLocation('/cv-builder?intake=1');
  };

  useEffect(() => {
    if (!reviewInProgress) {
      setReviewProgressStep(0);
      return;
    }
    setReviewProgressStep(1);
    const timer = window.setInterval(() => {
      setReviewProgressStep((current) => (current >= 4 ? 1 : current + 1));
    }, 900);
    return () => window.clearInterval(timer);
  }, [reviewInProgress]);

  const openReviewDialog = () => {
    const profile = readProfile();
    setReviewFile(null);
    setReviewFileName('');
    setReviewRole(profile?.targetRole || report?.targetRole || '');
    setReviewArea(profile?.location || '');
    setReviewDragging(false);
    setReviewUploadError('');
    if (reviewFileInputRef.current) reviewFileInputRef.current.value = '';
    setReviewDialogOpen(true);
  };

  const selectReviewFile = (file: File | null) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const allowedExtensions = ['pdf', 'docx', 'txt'];
    const allowedMimeTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/octet-stream',
    ];
    if (!allowedExtensions.includes(extension) || (file.type && !allowedMimeTypes.includes(file.type))) {
      setReviewFile(null);
      setReviewFileName('');
      setReviewUploadError('Choose a PDF, Word (.docx), or text (.txt) CV file.');
      if (reviewFileInputRef.current) reviewFileInputRef.current.value = '';
      return;
    }
    setReviewFile(file);
    setReviewFileName(file.name);
    setReviewUploadError('');
  };

  const submitAnotherDiagnostic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewFile || !reviewFileName) return;
    setReviewInProgress(true);
    setReviewUploadError('');
    try {
      const profile = readProfile();
      const parseBody = await buildParseUploadBody(reviewFile);
      const response = await authFetch('/api/career/diagnostic', {
        method: 'POST',
        body: JSON.stringify({
          fileName: reviewFileName,
          fileData: parseBody.fileData,
          text: parseBody.text,
          role: reviewRole || profile?.targetRole || undefined,
          location: reviewArea || profile?.location || undefined,
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
      sessionStorage.setItem('bonlist-report-updated-at', new Date().toISOString());
      const nextReport = reportForCurrentViewer(payload as DiagnosticReport);
      setReport(nextReport);
      setActiveWorkstationTab('review');
      window.dispatchEvent(new Event('careerbridge-report-updated'));
      announceJobMatches(Array.isArray(nextReport?.relatedJobs) ? nextReport.relatedJobs.length : 0);
      setReviewDialogOpen(false);
    } catch (error) {
      setReviewUploadError(error instanceof Error ? error.message : 'We could not review that CV. Please try again.');
    } finally {
      setReviewInProgress(false);
    }
  };

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileSidebarOpen]);

  const sidebarItems = [
    { label: 'Review Results', href: '/diagnostic', icon: FileCheck2 },
    { label: 'Job Matches', href: '/jobs', icon: BriefcaseBusiness },
    { label: 'Advice and Next Steps', href: '/diagnostic', icon: Sparkles },
    { label: 'AI Cover Letter', href: '/cv-builder?intake=1', icon: FileText },
    { label: 'Interview Prep', href: '/interview', icon: Bot },
  ];
  const renderSidebar = (className: string) => (
    <aside className={`flex w-64 shrink-0 flex-col ${className}`}>
      <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
      <nav className="space-y-1.5" aria-label="CV review workspace">
        {sidebarItems.map(({ label, href, icon: Icon }) => {
          const isWorkspaceView = label === 'Job Matches' || label === 'Advice and Next Steps';
          const active = label === 'Job Matches'
            ? activeWorkstationTab === 'jobs'
            : label === 'Advice and Next Steps'
              ? activeWorkstationTab === 'advice'
              : activeWorkstationTab === 'review' && label === 'Review Results' && location.split('?')[0] === '/diagnostic';
          const className = `flex min-h-11 w-full items-center gap-3 rounded-r-lg border-l-4 px-3 text-left text-sm transition ${active ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700' : 'border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`;
          return isWorkspaceView ? (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (label === 'Job Matches') {
                  markJobMatchesRead();
                  setActiveWorkstationTab('jobs');
                } else {
                  setActiveWorkstationTab('advice');
                }
                setMobileSidebarOpen(false);
              }}
              aria-current={active ? 'page' : undefined}
              className={className}
            >
              <Icon size={17} /><span className="flex-1">{label}</span>{label === 'Job Matches' ? <JobMatchBadge count={unreadMatchesCount} /> : null}
            </button>
          ) : (
            <Link
              key={label}
              href={href}
              onClick={() => {
                if (label === 'Review Results') setActiveWorkstationTab('review');
                setMobileSidebarOpen(false);
              }}
              aria-current={active ? 'page' : undefined}
              className={className}
            >
              <Icon size={17} /><span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-xl border border-slate-200/60 bg-slate-50 p-3">
        <p className="text-xs leading-5 text-slate-500">Turn your review into a stronger, interview-ready CV.</p>
        <button type="button" onClick={handleGenerateCv} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700">
          <Sparkles size={14} /> Improve My CV
        </button>
      </div>
      </div>
    </aside>
  );
  const renderWorkstation = (content: ReactNode) => (
    <div className="flex h-[calc(100dvh-3.5rem)] w-full max-w-full min-w-0 gap-3 overflow-hidden bg-slate-50/70 p-2 sm:h-[calc(100dvh-4rem)] sm:p-3 md:gap-6 md:p-6">
      {renderSidebar('hidden h-full md:flex')}
      {mobileSidebarOpen ? (
        <div className="md:hidden">
          <button type="button" className="fixed inset-0 z-[80] bg-slate-950/45 backdrop-blur-[2px]" aria-label="Close workspace navigation" onClick={() => setMobileSidebarOpen(false)} />
          {renderSidebar('fixed inset-y-14 left-3 z-[81] h-[calc(100dvh-4.25rem)] max-w-[85vw] sm:inset-y-16 sm:h-[calc(100dvh-5rem)]')}
        </div>
      ) : null}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-2 z-30 mx-0 mt-1 flex min-h-16 w-full max-w-full shrink-0 items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white/95 px-2.5 shadow-sm backdrop-blur sm:mx-1 sm:gap-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileSidebarOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 md:hidden" aria-label="Open workspace navigation">
              <Menu size={19} />
            </button>
            <div className="min-w-0">
              <p className="hidden text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:block">Career workspace</p>
              <h1 className="truncate text-sm font-bold text-slate-900 sm:text-base">{activeWorkstationTab === 'jobs' ? 'Job Matches' : activeWorkstationTab === 'advice' ? 'Advice and Next Steps' : 'CV Diagnostic Report'}</h1>
            </div>
          </div>
          <button type="button" onClick={handleGenerateCv} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:gap-2 sm:px-4 sm:text-sm" data-testid="button-improve-my-cv">
            <Sparkles size={15} /> <span className="hidden min-[390px]:inline">Improve My CV</span>
          </button>
        </header>
        <div className="mx-auto w-full max-w-6xl min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-2 py-4 min-[390px]:px-3 sm:px-6 sm:py-7 lg:px-8">{content}</div>
      </main>
    </div>
  );

  if (loading) {
    return renderWorkstation(
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm">Loading your CV review…</div>,
    );
  }

  if (!report) {
    return renderWorkstation(
      <div className="space-y-6">
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
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <FileText className="mx-auto text-blue-600" size={36} />
          <h2 className="mt-5 text-2xl font-semibold text-slate-900">No report yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            A useful review starts with your actual CV, not a generic score.
          </p>
        </div>
      </div>,
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
    { name: 'Structure & Formatting', score: report.structureFormattingScore ?? scores.structure ?? sectionScore(/structure|format/i, 70) },
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
  const premiumUnlocked = isAdminUser();

  const healthSummary =
    report.healthCheckMessage?.trim() ||
    report.summary?.trim() ||
    `${overall >= 75 ? 'Solid authenticity and structure' : 'Promising foundation'}, but ${
      (scores.impact ?? 60) < 70 ? 'experience bullets need stronger action verbs and quantified impact' : 'a few targeted edits will lift ATS fit'
    } for ${report.targetRole || 'your target'} roles${locationHint ? ` in ${locationHint}` : ''}.`;

  return renderWorkstation(
    <div className="space-y-6">
      {activeWorkstationTab === 'review' && (
        <>
      <div className="mb-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">CV diagnostic</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Your readiness at a glance</h2>
        <p className="mt-2 break-all text-sm text-slate-500 sm:break-words">
          {report.fileName}
          {report.targetRole ? ` — ${report.targetRole}` : ''}
          {locationHint ? ` — ${locationHint}` : ''}
        </p>
      </div>

      {/* 1. ATS & READINESS OVERVIEW */}
      <section className="box-border w-full max-w-full rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6 md:p-7">
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
        {report.isRoleMatch === false ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
            <p className="font-semibold">The target role does not currently align with the qualifications evidenced in this CV.</p>
            {report.missingMandatoryRequirements?.length ? <><p className="mt-3 text-xs font-bold uppercase tracking-wide">Missing mandatory requirements</p><ul className="mt-2 list-disc space-y-1 pl-5">{report.missingMandatoryRequirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul></> : null}
            {report.recommendation ? <p className="mt-3 leading-6"><span className="font-semibold">Recommendation:</span> {report.recommendation}</p> : null}
          </div>
        ) : null}
      </section>

      {/* 2. SCORE CARD */}
      <section className="mt-6 box-border w-full max-w-full rounded-3xl border border-border bg-card p-4 sm:p-6 md:p-7">
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
      <section className="mt-6 box-border w-full max-w-full rounded-3xl border border-border bg-card p-4 sm:p-6 md:p-7">
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
      <section className="mt-6 box-border w-full max-w-full rounded-3xl border border-border bg-card p-4 sm:p-6 md:p-7">
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
        <section className="mt-6 box-border w-full max-w-full rounded-3xl border border-border bg-card p-4 sm:p-6 md:p-7">
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

        </>
      )}
      {activeWorkstationTab === 'jobs' && (
        <JobMatchesWorkstation
          report={report}
          jobs={relatedJobs}
          premiumUnlocked={premiumUnlocked}
          onOpenJob={(job) => {
            persistSelectedJob(job);
            setLocation(`/jobs/${job.id}`);
          }}
        />
      )}
      {activeWorkstationTab === 'advice' && (
        <AdviceAndNextStepsView
          report={report}
          jobs={relatedJobs}
          premiumUnlocked={premiumUnlocked}
          onImproveCv={handleGenerateCv}
        />
      )}
      {activeWorkstationTab === 'review' && <div className="mt-6 text-center">
        <button
          type="button"
          onClick={openReviewDialog}
          className="text-xs font-semibold text-muted-foreground hover:text-primary"
          data-testid="button-review-another-cv"
        >
          Review another CV
        </button>
      </div>}
      <Dialog open={reviewDialogOpen} onOpenChange={(open) => { if (!reviewInProgress) setReviewDialogOpen(open); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto border-slate-200 p-0 sm:max-w-xl">
          {reviewInProgress ? (
            <div className="overflow-hidden rounded-[inherit] bg-slate-950 text-white" data-testid="review-another-progress">
              <div className="relative isolate overflow-hidden px-6 py-10 text-center sm:px-10 sm:py-12">
                <div className="absolute -left-16 -top-20 h-56 w-56 rounded-full bg-blue-500/25 blur-3xl" />
                <div className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-violet-500/25 blur-3xl" />
                <div className="relative mx-auto h-36 w-28 rounded-2xl border border-white/20 bg-white/10 p-3 shadow-2xl backdrop-blur">
                  <div className="space-y-2 pt-2">
                    <div className="h-2 w-14 rounded-full bg-white/70" />
                    <div className="h-1.5 w-full rounded-full bg-white/25" />
                    <div className="h-1.5 w-4/5 rounded-full bg-white/25" />
                    <div className="h-1.5 w-full rounded-full bg-white/25" />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="h-8 rounded-lg bg-blue-400/25" />
                      <div className="h-8 rounded-lg bg-violet-400/25" />
                    </div>
                  </div>
                  <div className="absolute inset-x-2 top-3 h-8 animate-pulse rounded-lg bg-gradient-to-b from-transparent via-cyan-300/50 to-transparent shadow-[0_0_22px_rgba(103,232,249,0.6)]" />
                  <span className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-xl bg-blue-500 shadow-lg shadow-blue-500/40">
                    <Sparkles className="animate-pulse" size={17} />
                  </span>
                </div>
                <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">AI review in progress</p>
                <DialogTitle className="mt-2 text-xl font-semibold text-white sm:text-2xl">Turning your CV into clear next steps</DialogTitle>
                <DialogDescription className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-300">
                  Keep this window open while we read the document, check its evidence, and match it to your target role.
                </DialogDescription>
                <div className="mx-auto mt-7 max-w-sm">
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 transition-all duration-700" style={{ width: `${reviewProgressStep * 25}%` }} />
                  </div>
                  <div className="mt-4 grid gap-2 text-left">
                    {[
                      'Reading document structure',
                      'Checking ATS and authenticity signals',
                      'Measuring evidence against your target role',
                      'Preparing your updated action plan',
                    ].map((label, index) => {
                      const active = reviewProgressStep >= index + 1;
                      return (
                        <div key={label} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs transition ${active ? 'border-cyan-300/25 bg-white/10 text-white' : 'border-white/5 bg-white/[0.03] text-slate-500'}`}>
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${active ? 'bg-cyan-300 text-slate-950' : 'bg-white/10 text-slate-500'}`}>
                            {active ? <Check size={12} strokeWidth={3} /> : index + 1}
                          </span>
                          {label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={submitAnotherDiagnostic} className="p-5 sm:p-7" data-testid="review-another-form">
              <DialogHeader className="text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">Fresh CV review</p>
                <DialogTitle className="text-xl text-slate-950">Upload another CV</DialogTitle>
                <DialogDescription>Choose the latest version and we’ll replace this report when the new review is ready.</DialogDescription>
              </DialogHeader>

              <label
                className="mt-6 block"
                onDragOver={(event) => { event.preventDefault(); setReviewDragging(true); }}
                onDragEnter={(event) => { event.preventDefault(); setReviewDragging(true); }}
                onDragLeave={(event) => { event.preventDefault(); setReviewDragging(false); }}
                onDrop={(event) => { event.preventDefault(); setReviewDragging(false); selectReviewFile(event.dataTransfer.files?.[0] ?? null); }}
              >
                <span className="mb-2 block text-xs font-semibold text-foreground">Upload your current CV</span>
                <span className={`flex min-h-20 cursor-pointer items-center gap-3 rounded-2xl border border-dashed px-4 py-4 transition ${reviewDragging ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/15' : reviewFileName ? 'border-emerald-400 bg-emerald-50/70' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50'}`}>
                  <input
                    ref={reviewFileInputRef}
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="sr-only"
                    onChange={(event) => selectReviewFile(event.target.files?.[0] ?? null)}
                    data-testid="input-review-another-file"
                  />
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${reviewFileName ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 shadow-sm'}`}>
                    {reviewFileName ? <CheckCircle2 size={20} /> : <FileText size={20} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{reviewFileName || 'PDF or Word document'}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{reviewFileName ? 'Ready for review' : 'Click to choose or drag and drop'}</span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 shadow-sm">Choose</span>
                </span>
              </label>

              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-semibold text-foreground">Role you are targeting <span className="font-normal text-muted-foreground">(optional)</span></span>
                <input value={reviewRole} onChange={(event) => setReviewRole(event.target.value)} placeholder="e.g. Operations coordinator" className="field-input" data-testid="input-review-another-role" />
              </label>
              <label className="mt-4 block">
                <span className="mb-2 block text-xs font-semibold text-foreground">Your area <span className="font-normal text-muted-foreground">(optional)</span></span>
                <select value={reviewArea} onChange={(event) => setReviewArea(event.target.value)} className="field-input" data-testid="select-review-another-location">
                  <option value="">All South Africa</option>
                  <option value="Cape Town">Cape Town / Western Cape</option>
                  <option value="Johannesburg">Johannesburg / Gauteng</option>
                  <option value="Durban">Durban / KZN</option>
                  <option value="Hybrid">Hybrid / Remote</option>
                </select>
              </label>
              {reviewUploadError ? <p className="mt-3 text-xs text-destructive" role="alert">{reviewUploadError}</p> : null}
              <button type="submit" disabled={!reviewFile || !reviewFileName} className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-submit-review-another">
                Run AI CV review <ArrowRight size={16} />
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>,
  );
}

function JobMatchBadge({ count, verbose = false }: { count: number; verbose?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-background"
      aria-label={`${count} unread job ${count === 1 ? 'match' : 'matches'}`}
    >
      {count > 99 ? '99+' : count}{verbose ? ` ${count === 1 ? 'match' : 'matches'}` : ''}
    </span>
  );
}

type JobOpeningsSearchProps = {
  report: DiagnosticReport;
  jobs: JobMatch[];
  premiumUnlocked: boolean;
  onOpenJob: (job: JobMatch) => void;
};

function industryForJob(job: JobMatch): string {
  const details = job as JobMatch & { industry?: string; sector?: string; description?: string };
  const text = [job.title, job.company, job.location, details.industry, details.sector, details.description].join(' ').toLowerCase();
  if (/freight|logistic|supply chain|import|export|warehouse|brokerage|shipping|aviation/.test(text)) return 'Logistics & Supply Chain';
  if (/construction|civil|engineering|site manager|foreman|quantity surveyor/.test(text)) return 'Construction & Engineering';
  if (/customer service|call centre|client support|account support/.test(text)) return 'Customer Service';
  if (/accountant|accounting|finance|credit|payroll|bookkeep/.test(text)) return 'Finance & Accounting';
  if (/software|developer|technology|data analyst|information technology|\bit\b/.test(text)) return 'Technology';
  return 'Other';
}

function postedWithin(postedValue: string, range: string): boolean {
  if (range === 'any') return true;
  const posted = postedValue.toLowerCase();
  if (!posted || posted.includes('unavailable')) return false;
  const days = range === 'day' ? 1 : range === 'week' ? 7 : 30;
  const relative = posted.match(/(\d+)\s*(hour|day|week|month)/);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const ageDays = unit === 'hour' ? amount / 24 : unit === 'week' ? amount * 7 : unit === 'month' ? amount * 30 : amount;
    return ageDays <= days;
  }
  if (/today|just now|yesterday|less than a day/.test(posted)) return true;
  const timestamp = Date.parse(postedValue);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= days * 24 * 60 * 60 * 1000;
}

function JobMatchesWorkstation({ report, jobs: rawJobs, premiumUnlocked, onOpenJob }: JobOpeningsSearchProps) {
  const paidAccess = usePaidAccess();
  const [revealedMatches, setRevealedMatches] = useState<Record<string, JobListingSource>>({});
  const jobs = normalizeJobResults(rawJobs).map(job => revealedMatches[String(job.id)] || job);
  useEffect(() => {
    let cancelled = false;
    for (const job of normalizeJobResults(rawJobs)) {
      if (!(job as JobListingSource & { locked?: boolean }).locked || !isJobUnlocked(job, paidAccess)) continue;
      void fetchUnlockedJob(job.id).then(value => {
        const revealed = normalizeJobResults([value])[0];
        if (!cancelled && revealed) setRevealedMatches(current => ({ ...current, [String(job.id)]: revealed }));
      }).catch(() => { /* Keep server-redacted content when reveal is unavailable. */ });
    }
    return () => { cancelled = true; };
  }, [rawJobs, paidAccess]);
  const [view, setView] = useState<'ai' | 'search'>('ai');
  const [keywordsDraft, setKeywordsDraft] = useState('');
  const [keywords, setKeywords] = useState('');
  const [location, setLocation] = useState('');
  const [industry, setIndustry] = useState('');
  const [postedRange, setPostedRange] = useState('any');
  const [jobType, setJobType] = useState('');
  const [remoteOption, setRemoteOption] = useState('');
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState<Record<string, JobDetailsPayload>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailNotice, setDetailNotice] = useState('');
  const [searchResults, setSearchResults] = useState<JobMatch[]>([]);
  useEffect(() => {
    let cancelled = false;
    for (const job of normalizeJobResults(searchResults)) {
      if (!(job as JobListingSource & { locked?: boolean }).locked || !isJobUnlocked(job, paidAccess)) continue;
      void fetchUnlockedJob(job.id).then(value => {
        const revealed = normalizeJobResults([value])[0];
        if (!cancelled && revealed) setRevealedMatches(current => ({ ...current, [String(job.id)]: revealed }));
      }).catch(() => { /* Keep server-redacted content if verification fails. */ });
    }
    return () => { cancelled = true; };
  }, [searchResults, paidAccess]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedBoardLabels, setSearchedBoardLabels] = useState<string[]>([]);
  const [searchScoring, setSearchScoring] = useState('');
  const [searchNotice, setSearchNotice] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchResultsRef = useRef<HTMLDivElement>(null);
  const [savedJobs, setSavedJobs] = useState<JobMatch[]>(() => {
    try {
      return normalizeJobResults(JSON.parse(localStorage.getItem('bonlist-saved-jobs') || '[]'));
    } catch { return []; }
  });

  // SEARCH is intentionally isolated from the diagnostic's cached relatedJobs.
  // Cached matches are shown only in the AI JOB MATCHES tab above.
  const searchSourceJobs = searchResults.map(job => revealedMatches[String(job.id)] || job);
  const keywordMatches = (searchable: string) => {
    const terms = keywords.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const text = searchable.toLowerCase();
    const hits = terms.filter((term) => text.includes(term)).length;
    return text.includes(keywords.toLowerCase()) || hits >= Math.max(1, Math.ceil(terms.length * 0.6));
  };
  const locationMatches = (listed: string) => {
    const wanted = location.trim().toLowerCase();
    const actual = listed.toLowerCase();
    if (!wanted || actual.includes(wanted)) return true;
    const nearby: Record<string, string[]> = {
      johannesburg: ['gauteng', 'sandton', 'randburg', 'rosebank', 'kempton park', 'benoni', 'germiston', 'edenvale', 'midrand'],
      gauteng: ['johannesburg', 'pretoria', 'sandton', 'randburg', 'rosebank', 'kempton park', 'benoni', 'germiston', 'edenvale', 'midrand'],
      pretoria: ['tshwane', 'centurion', 'midrand', 'johannesburg'],
      'cape town': ['bellville', 'stellenbosch', 'paarl'],
      durban: ['umhlanga', 'pinetown'],
    };
    return (nearby[wanted] || []).some((nearbyLocation) => actual.includes(nearbyLocation));
  };
  const baseFilteredJobs = searchSourceJobs.filter((job) => {
    const extra = job as JobMatch & { employmentType?: string; jobType?: string; remoteOption?: string; description?: string };
    const searchable = [job.title, job.company, job.location, job.sector, job.source, job.description, ...(job.tags || [])].join(' ').toLowerCase();
    // Live results are already role/location filtered by the server, including
    // synonyms and explicitly announced geographic fallbacks.
    const locationMatch = hasSearched || locationMatches(job.location);
    const keywordMatch = hasSearched || keywordMatches(searchable);
    const explicitType = (extra.employmentType || extra.jobType || '').trim().toLowerCase();
    const listingText = `${explicitType} ${searchable}`.toLowerCase();
    // Board listings often omit employment type. Keep those eligible for
    // Full-time searches; only exclude them when a different type is requested.
    const fullTimeEligible = listingText.includes('full-time') || listingText.includes('permanent')
      || (!explicitType && !/part[- ]time|contract|fixed[- ]term|temporary|internship|\bintern\b/.test(listingText));
    const typeMatch = !jobType || (jobType.toLowerCase() === 'full-time' && fullTimeEligible)
      || listingText.includes(jobType.toLowerCase());
    const remoteText = `${extra.remoteOption || ''} ${job.location} ${extra.description || ''}`.toLowerCase();
    const remoteMatch = !remoteOption || remoteText.includes(remoteOption.toLowerCase());
    return keywordMatch && locationMatch && typeMatch && remoteMatch;
  });
  const strictFilteredJobs = baseFilteredJobs.filter((job) => {
    const industryMatch = !industry || industryForJob(job) === industry;
    return industryMatch && postedWithin(job.posted || '', postedRange);
  });
  const showingSoftFilterFallback = strictFilteredJobs.length === 0 && baseFilteredJobs.length > 0;
  const filteredJobs = strictFilteredJobs.length ? strictFilteredJobs : baseFilteredJobs;
  const activeBaseJob = (view === 'ai' ? jobs : filteredJobs).find((job) => String(job.id) === activeJobId) || null;
  const detailKey = activeBaseJob ? `${view}:${activeBaseJob.id}` : '';
  const activeJob = activeBaseJob && jobDetails[detailKey] ? { ...activeBaseJob, ...jobDetails[detailKey] } : activeBaseJob;

  useEffect(() => {
    if (!activeBaseJob || !detailKey || jobDetails[detailKey]) return;
    const source = activeBaseJob as JobListingSource;
    const href = directApplicationUrl(source);
    if (!href || !isJobUnlocked(activeBaseJob, paidAccess)) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailNotice('');
    void authFetch('/api/career/jobs/details', { method: 'POST', body: JSON.stringify({ url: href }) })
      .then(async (response) => {
        if (!response.ok) throw new Error('More detail is only available on the original job board.');
        return readApiJson(response);
      })
      .then((payload) => {
        if (cancelled) return;
        setJobDetails((current) => ({ ...current, [detailKey]: {
          fullDescription: typeof payload.fullDescription === 'string' && payload.fullDescription ? payload.fullDescription : source.fullDescription,
          requirements: Array.isArray(payload.requirements) ? payload.requirements as string[] : source.requirements,
          responsibilities: Array.isArray(payload.responsibilities) ? payload.responsibilities as string[] : source.responsibilities,
          skills: Array.isArray(payload.skills) && payload.skills.length ? payload.skills as string[] : source.skills,
        } }));
      })
      .catch(() => { if (!cancelled) setDetailNotice('Open the original listing for the complete job specification.'); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [activeBaseJob?.id, activeBaseJob?.url, detailKey, jobDetails, premiumUnlocked, view]);

  useEffect(() => {
    if (!hasSearched || searchLoading || view !== 'search') return;
    searchResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hasSearched, searchLoading, view, searchResults.length]);

  useEffect(() => {
    if (!activeJob) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveJobId(null);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [activeJob]);

  const clearFilters = () => {
    setKeywordsDraft('');
    setKeywords('');
    setLocation('');
    setIndustry('');
    setPostedRange('any');
    setJobType('');
    setRemoteOption('');
  };

  const performLiveSearch = async (
    searchTerms: string,
    searchLocation: string,
    preferences = { industry, postedRange },
  ) => {
    setSearchLoading(true);
    setSearchError('');
    setSearchNotice('');
    setSearchResults([]);
    setHasSearched(false);
    setActiveJobId(null);
    try {
      const response = await authFetch('/api/career/jobs/search', {
        method: 'POST',
        body: JSON.stringify({ keywords: searchTerms, location: searchLocation, ...preferences }),
      });
      const payload = await readApiJson(response);
      if (!response.ok) throw new Error(payload.error || 'Job search could not be completed.');
      const results = normalizeJobResults(payload.jobs);
      setSearchResults(results);
      setHasSearched(true);
      setSearchedBoardLabels(Array.isArray(payload.queriedBoards) ? payload.queriedBoards as string[] : []);
      setSearchScoring(typeof payload.scoring === 'string' ? payload.scoring : '');
      setSearchNotice(typeof payload.searchNotice === 'string' ? payload.searchNotice : '');
      setKeywords(searchTerms);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Job search could not be completed.');
      setHasSearched(true);
    } finally {
      setSearchLoading(false);
    }
  };

  const runLiveSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await performLiveSearch(keywordsDraft.trim(), location.trim());
  };

  const clearFiltersAndSearchCustomerService = async () => {
    const broadRole = keywordsDraft.trim() || report.targetRole || 'customer service';
    setKeywordsDraft(broadRole);
    setIndustry('');
    setPostedRange('any');
    setJobType('');
    setRemoteOption('');
    await performLiveSearch(broadRole, location.trim(), { industry: '', postedRange: 'any' });
  };

  const toggleSavedJob = (job: JobMatch) => {
    const id = String(job.id);
    const next = savedJobs.some((saved) => String(saved.id) === id)
      ? savedJobs.filter((saved) => String(saved.id) !== id)
      : [...savedJobs, job];
    setSavedJobs(next);
    try { localStorage.setItem('bonlist-saved-jobs', JSON.stringify(next)); } catch { /* private browsing storage may be unavailable */ }
  };

  const tabs = [
    { id: 'ai' as const, label: 'AI JOB MATCHES' },
    { id: 'search' as const, label: 'SEARCH FOR JOB OPENINGS' },
  ];

  return (
    <section className="space-y-5" aria-label="Job matches workspace">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">Your career workspace</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">Job Matches</h2>
          <p className="mt-1 text-sm text-slate-600">AI recommendations and searchable openings from your CV review.</p>
        </div>
      </div>
      <div className="flex w-full gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5 sm:w-fit" role="tablist" aria-label="Job match views">
        {tabs.map((tab) => (
          <button key={tab.id} id={`jobs-tab-${tab.id}`} type="button" role="tab" aria-selected={view === tab.id} aria-controls={`jobs-panel-${tab.id}`} onClick={() => { setActiveJobId(null); setView(tab.id); }} className={`min-h-10 shrink-0 rounded-lg px-4 text-xs font-bold transition ${view === tab.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {view === 'ai' ? (
        <div id="jobs-panel-ai" role="tabpanel" aria-labelledby="jobs-tab-ai" className="mx-auto w-full max-w-4xl space-y-4">
          <MatchCountBanner jobs={jobs} role={report.targetRole} />
          {report.jobSearch?.searchNotice ? <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{report.jobSearch.searchNotice}</p> : null}
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
            <h3 className="text-sm font-bold text-slate-900">CV-matched vacancies</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">{report.jobSearch?.liveResults ? `Matches gathered for “${report.jobSearch.query}”.` : 'These recommendations are based on the latest CV review.'}</p>
          </div>
          {jobs.length ? jobs.map((job) => <JobListingCard key={job.id} job={toJobListing(job)} locked={!isJobUnlocked(job, paidAccess)} onUnlock={() => requestPayment({ itemType: 'JOB_MATCH_UNLOCK', targetId: job.id })} onViewDetails={() => setActiveJobId(String(job.id))} />) : <SuggestedRoles report={report} />}
          {jobs.some(job => !isJobUnlocked(job, paidAccess)) ? <p className="text-xs text-slate-500">Unlock 50%+ matches with R30 daily access to all 50%+ matches, or get R80 Mega Access for 7 days.</p> : null}
        </div>
      ) : (
        <div id="jobs-panel-search" role="tabpanel" aria-labelledby="jobs-tab-search" className="space-y-5">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Search Job Openings</h3>
              <p className="mt-1 text-xs text-slate-500">Search live job-board listings by role and location. Filters refine the returned listings.</p>
            </div>
            <form onSubmit={runLiveSearch} className="flex flex-col gap-2 sm:flex-row">
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm">
                <Search size={16} className="shrink-0 text-slate-400" />
                <input value={keywordsDraft} onChange={(event) => setKeywordsDraft(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Role, company, or keywords" aria-label="Search role, company, or keywords" />
              </label>
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm">
                <MapPin size={16} className="shrink-0 text-slate-400" />
                <input value={location} onChange={(event) => setLocation(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Location or remote" aria-label="Filter by location" />
              </label>
              <button type="submit" disabled={searchLoading} className="min-h-10 rounded-xl bg-blue-600 px-6 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{searchLoading ? 'Searching…' : 'Search'}</button>
            </form>
            {searchError ? <p role="alert" className="text-xs font-medium text-rose-700">{searchError}</p> : null}
            {searchNotice ? <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{searchNotice}</p> : null}
            {hasSearched && !searchError ? <p className="text-[11px] text-slate-500">Live board search checked {searchedBoardLabels.length ? searchedBoardLabels.join(', ') : 'available South African boards'}. {searchScoring === 'gemini' ? 'Gemini scored results against your CV.' : 'Match scores use available CV evidence.'}</p> : null}
            <div className="grid grid-cols-1 gap-2 border-t border-slate-200/70 pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-[11px] font-semibold text-slate-500">Resume
                <select disabled className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-100">
                  <option>{report.fileName || 'CV used for this review'}</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-500">Industry
                <select value={industry} onChange={(event) => setIndustry(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                  <option value="">All industries</option><option>Logistics &amp; Supply Chain</option><option>Construction &amp; Engineering</option><option>Customer Service</option><option>Finance &amp; Accounting</option><option>Technology</option><option>Other</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-500">Date posted
                <select value={postedRange} onChange={(event) => setPostedRange(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                  <option value="any">Any time</option><option value="day">Past 24 hours</option><option value="week">Past week</option><option value="month">Past month</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-500">Job type
                <select value={jobType} onChange={(event) => setJobType(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                  <option value="">Any job type</option><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold text-slate-500 sm:col-span-2 lg:col-span-2">Workplace
                <select value={remoteOption} onChange={(event) => setRemoteOption(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                  <option value="">Any workplace</option><option>remote</option><option>hybrid</option><option>on-site</option>
                </select>
              </label>
              <button type="button" onClick={clearFilters} className="self-end px-2 py-2 text-left text-xs font-semibold text-slate-500 hover:text-slate-900 sm:col-span-2 lg:col-span-2 lg:text-right">Clear all filters</button>
            </div>
          </div>

          <div ref={searchResultsRef} className="mx-auto w-full max-w-4xl scroll-mt-24 space-y-4">
            {hasSearched ? <MatchCountBanner jobs={filteredJobs} role={keywords} /> : null}
            {showingSoftFilterFallback ? <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">No openings matched all selected industry/date filters. Showing related listings with those optional filters relaxed.</p> : null}
            {!hasSearched ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-7 text-center"><p className="text-sm font-semibold text-slate-800">Search live job-board openings</p><p className="mt-1 text-xs text-slate-500">Enter a role and location, then search to get current listings from the configured boards.</p></div> : filteredJobs.length ? <div className="flex flex-col gap-4">
              {filteredJobs.map((job) => <JobListingCard key={job.id} job={toJobListing(job)} locked={!isJobUnlocked(job, paidAccess)} onUnlock={() => requestPayment({ itemType: 'JOB_MATCH_UNLOCK', targetId: job.id })} onViewDetails={() => setActiveJobId(String(job.id))} />)}
            </div> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-7 text-center">
                <p className="text-sm font-semibold text-slate-800">No openings found matching all strict filters.</p>
                <p className="mt-1 text-xs text-slate-500">Try a broader role or location. We only show real job-board listings, not generated examples.</p>
                <button type="button" onClick={() => void clearFiltersAndSearchCustomerService()} disabled={searchLoading} className="mt-4 min-h-10 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">{searchLoading ? 'Searching…' : 'Clear Filters & Search All Customer Service Roles'}</button>
              </div>}
          </div>
          <BoardSearchLinks report={report} />
        </div>
      )}
      {activeJob ? <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveJobId(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="job-detail-title" className="flex h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-auto sm:max-h-[88dvh] sm:rounded-3xl">
          <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4"><h3 id="job-detail-title" className="text-sm font-bold text-slate-900">Job details</h3><button type="button" onClick={() => setActiveJobId(null)} aria-label="Close job details" className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><X size={18} /></button></header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {!isJobUnlocked(activeJob, paidAccess) ? <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600"><p>Unlock this {activeJob.match}% match with R30 daily access, or get R80 Mega Access for 7 days.</p><button className="btn-primary mt-3" onClick={() => requestPayment({ itemType: 'JOB_MATCH_UNLOCK', targetId: activeJob.id })}>Unlock All Matches for R30</button></div> : <>
              <JobListingDetails job={toJobListing(activeJob)} loading={detailLoading} />
              {detailNotice ? <p className="mt-3 text-xs text-slate-500" role="status">{detailNotice}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => toggleSavedJob(activeJob)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{savedJobs.some((saved) => String(saved.id) === String(activeJob.id)) ? 'Saved job' : 'Save job'}</button>{view === 'ai' ? <button type="button" onClick={() => onOpenJob(activeJob)} className="rounded-lg border border-blue-200 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">Scan match</button> : null}</div>
            </>}
          </div>
          <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-3 text-right"><button type="button" onClick={() => setActiveJobId(null)} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100">Close details</button></footer>
        </section>
      </div> : null}
    </section>
  );
}

function AdviceAndNextStepsView({ report, jobs, premiumUnlocked, onImproveCv }: { report: DiagnosticReport; jobs: JobMatch[]; premiumUnlocked: boolean; onImproveCv: () => void }) {
  const paidAccess = usePaidAccess();
  const topJobs = jobs.slice(0, 10);
  return (
    <div className="space-y-6">
      <section className="box-border w-full max-w-full rounded-3xl border border-border bg-card p-4 sm:p-6 md:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">6 — Recommended matches &amp; next steps</p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">Recent job matches</h2>
        {report.jobSearch?.liveResults ? <p className="mt-1 text-xs text-muted-foreground">Live listings for “{report.jobSearch.query}” — open a role to apply on the board.</p> : null}
        {topJobs.length ? <ul className="mt-4 space-y-2">{topJobs.map((job) => {
          const locked = !isJobUnlocked(job, paidAccess);
          const href = applyHref(job);
          return <li key={job.id} className="relative overflow-hidden rounded-2xl bg-secondary/50"><div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm ${locked ? 'select-none blur-[2.5px] pointer-events-none' : ''}`}>
            {href && !locked ? <a href={href} target="_blank" rel="noreferrer" onClick={() => persistSelectedJob(job)} className="min-w-0 flex-1 font-semibold text-foreground hover:text-primary">{job.title}{job.company ? <span className="font-normal text-muted-foreground"> — {job.company}</span> : null}<span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{[job.source, job.posted && job.posted !== 'Date unavailable' ? `Posted ${job.posted}` : null].filter(Boolean).join(' — ')}</span></a> : <span className="min-w-0 flex-1 font-semibold text-foreground">{locked ? 'Premium job match' : job.title}{!locked && job.company ? <span className="font-normal text-muted-foreground"> — {job.company}</span> : null}</span>}
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-emerald-700">{job.match}% fit</span>
          </div>{locked ? <div className="absolute inset-0 z-10 flex items-center justify-between gap-3 bg-background/60 px-4 backdrop-blur-[1px]"><span className="text-xs font-semibold text-foreground"><Lock size={13} className="mr-2 inline" />Premium match</span><span className="text-[11px] text-muted-foreground">Administrator view</span></div> : null}</li>;
        })}</ul> : <p className="mt-3 text-sm text-muted-foreground">No job listings were returned for this CV review. Improve your CV or update its target location, then run a new review.</p>}
        <BoardSearchLinks report={report} />
        <div className="mt-6 flex flex-col items-stretch gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted-foreground">Apply your fixes in one pass — then send a cleaner CV.</p><button type="button" onClick={onImproveCv} className="btn-primary w-full sm:w-auto"><Sparkles size={15} />Generate Improved CV<ArrowRight size={15} /></button></div>
      </section>
      {report.careerAdvisory ? <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:p-6" aria-labelledby="career-alignment-title">
        <div><h2 id="career-alignment-title" className="text-lg font-bold text-slate-900">🎯 Career Strategic Alignment &amp; Hiring Advisory</h2><p className="mt-1 text-xs text-slate-600">Requested field: <span className="font-semibold">{report.careerAdvisory.requestedField}</span></p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Parsed CV profile</h3><p className="mt-1 text-sm leading-6 text-slate-700">{report.careerAdvisory.cvProfileSummary}</p>{report.careerAdvisory.primarySystems.length ? <p className="mt-2 text-xs text-slate-600"><span className="font-semibold">Systems found:</span> {report.careerAdvisory.primarySystems.join(', ')}</p> : null}</div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Highest Probability Roles</h3><p className="mt-1 text-sm leading-6 text-slate-700">{report.careerAdvisory.highestProbabilityAdvice}</p>{report.careerAdvisory.strongestFitSectors.length ? <div className="mt-3 flex flex-wrap gap-1.5">{report.careerAdvisory.strongestFitSectors.map((sector) => <span key={sector} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">{sector}</span>)}</div> : null}</div><div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-sm font-semibold uppercase tracking-wide text-amber-700">Positioning Adjustments Needed</h3><p className="mt-1 text-sm leading-6 text-slate-700">{report.careerAdvisory.positioningGapsAdvice}</p>{report.careerAdvisory.skillGaps.length ? <p className="mt-2 text-xs text-amber-900"><span className="font-semibold">Potential gaps:</span> {report.careerAdvisory.skillGaps.join(', ')}</p> : null}</div></div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-sm leading-6 text-blue-900"><strong>Agent Success Verdict:</strong> {report.careerAdvisory.strategicSuccessVerdict}</p></div>
      </section> : <div className="box-border w-full max-w-full rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600 sm:p-6">Career alignment advice will appear here when the CV review includes an advisory report.</div>}
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
    let cancelled = false;
    if (stored) {
      try { setReport(reportForCurrentViewer(JSON.parse(stored) as DiagnosticReport)); } catch { /* Recover from the server below. */ }
    }
    void authFetch('/api/career/diagnostic/latest').then(async response => {
      if (!response.ok) return;
      const saved = await readApiJson(response) as unknown as DiagnosticReport;
      if (!cancelled) {
        setReport(reportForCurrentViewer(saved));
        try { sessionStorage.setItem(REPORT_KEY, JSON.stringify(saved)); } catch { /* Storage can be unavailable in WebViews. */ }
      }
    }).catch(() => { /* Keep the upload action available if offline. */ });
    return () => { cancelled = true; };
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

  const matches = normalizeJobResults(report.relatedJobs).slice(0, 10);
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
      {report.jobSearch?.searchNotice ? <p role="status" className="mb-5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{report.jobSearch.searchNotice}</p> : null}
      {matches.length === 0 ? (
        <SuggestedRoles report={report} />
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
          : 'Matches below 50% are free. Unlock higher-scoring matches with R30 daily access to all 50%+ matches, or get seven-day Mega Access for R80.'}
      </p>
    </div>
  );
}

function JobCard({ job }: { job: JobMatch; premiumUnlocked?: boolean }) {
  const paidAccess = usePaidAccess();
  const [detailOpen, setDetailOpen] = useState(false);
  const [revealed, setRevealed] = useState<JobListingSource | null>(null);
  const [details, setDetails] = useState<JobDetailsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const locked = !isJobUnlocked(job, paidAccess);
  const visibleJob = revealed?.id === job.id && !locked ? revealed : job;
  const href = directApplicationUrl(visibleJob);
  useEffect(() => {
    let cancelled = false;
    if (!locked && (job as JobListingSource & { locked?: boolean }).locked) {
      void fetchUnlockedJob(job.id).then(value => {
        const result = normalizeJobResults([value])[0];
        if (!cancelled && result) setRevealed(result);
      }).catch(() => { /* Never reveal details without server verification. */ });
    }
    return () => { cancelled = true; };
  }, [job, locked, paidAccess]);
  useEffect(() => {
    if (!detailOpen || locked || !href) return;
    let cancelled = false;
    setLoading(true);
    void authFetch('/api/career/jobs/details', { method: 'POST', body: JSON.stringify({ url: href }) })
      .then(async response => { if (!response.ok) throw new Error('Details unavailable'); return readApiJson(response); })
      .then(payload => {
        const result = normalizeJobResults([{ ...job, ...payload }])[0];
        if (!cancelled && result) setDetails({ fullDescription: result.fullDescription, requirements: result.requirements, responsibilities: result.responsibilities, skills: result.skills });
      }).catch(() => { /* The saved listing and original board link remain available. */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [detailOpen, locked, href, job]);
  return (
    <div data-testid={`card-job-${job.id}`}>
      <JobListingCard job={toJobListing(visibleJob)} locked={locked}
        onUnlock={() => requestPayment({ itemType: 'JOB_MATCH_UNLOCK', targetId: job.id })}
        onViewDetails={() => setDetailOpen(true)} />
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>Job details</DialogTitle><DialogDescription>{locked ? 'Unlock this match to view the employer and application details.' : 'Full job specification and evidence-based match reasoning.'}</DialogDescription></DialogHeader>
          {locked ? <div className="space-y-3 text-sm"><p>Unlock this match with R30 daily access, or use R80 Mega Access for seven days.</p><button type="button" className="btn-primary" onClick={() => requestPayment({ itemType: 'JOB_MATCH_UNLOCK', targetId: job.id })}>Unlock All Matches for R30</button></div> : <JobListingDetails job={toJobListing({ ...visibleJob, ...details })} loading={loading} />}
        </DialogContent>
      </Dialog>
    </div>
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
      let verified = found;
      if (found.match >= 50 && (found as JobMatch & { isAiMatch?: boolean }).isAiMatch !== false) {
        try { verified = await fetchUnlockedJob(found.id) as JobMatch; }
        catch { requestPayment({ itemType: 'JOB_MATCH_UNLOCK', targetId: found.id }); setLocation('/jobs'); return; }
      }
      if (!verified) {
        setLocation('/jobs');
        return;
      }
      if (cancelled) return;
      persistSelectedJob(verified);
      setJob(verified);
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

      <div className="mt-6 box-border w-full max-w-full rounded-3xl border border-border bg-card p-4 sm:p-6 md:p-8">
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
            Get unlimited downloads and match reveals with R80 Mega Access for seven days.
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
        description="Career coaching resources for existing programme members. The previous paid offering is retired."
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
              Previous offering retired — existing member records preserved
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="box-border w-full max-w-full rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-6 md:p-8">
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
              Explore R80 seven-day Mega Access on Pricing
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
const PUBLIC_INFO_PATHS = new Set(['/pricing', '/about', '/contact', '/privacy', '/terms', '/cookies', '/data', '/support', '/advertise']);

function ProtectedApp() {
  const [location, setLocation] = useLocation();
  const [check, setCheck] = useState(0);
  const [access, setAccess] = useState<{ location: string; check: number; status: 'allowed' | 'offline' | 'unavailable' } | null>(null);

  useEffect(() => {
    const refresh = () => setCheck((value) => value + 1);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('bonlist-auth-signed-out', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('bonlist-auth-signed-out', refresh);
    };
  }, []);

  useEffect(() => {
    let current = true;

    const verifySession = async () => {
      if (isExplicitlySignedOut()) {
        if (current) setLocation('/login?signedOut=1', { replace: true });
        return;
      }
      const routeUrl = new URL(window.location.href);
      const offlineEditorRequested = routeUrl.pathname === '/cv-builder' && routeUrl.searchParams.get('offline') === '1';
      const offlineHomeRequested = routeUrl.pathname === '/offline-workstation';
      if ((offlineEditorRequested || offlineHomeRequested) && isNativeApp() && await isOfflineWorkstationActive()) {
        const localDocuments = offlineHomeRequested ? await listNativeCvs() : [];
        const requestedId = Number(routeUrl.searchParams.get('documentId'));
        const requestedDocument = offlineEditorRequested && Number.isInteger(requestedId) ? await getNativeCv(requestedId) : null;
        if ((offlineHomeRequested && localDocuments.length > 0) || requestedDocument) {
          if (current) setAccess({ location, check, status: 'offline' });
          return;
        }
      }

      const hasSavedToken = Boolean(getSessionToken() || getAdminToken());
      // Native installs must never bootstrap an identity from WebView cookies.
      if (Capacitor.isNativePlatform() && !hasSavedToken) {
        clearAuthSession();
        queryClient.clear();
        setLocation('/login', { replace: true });
        return;
      }
      const endpoints = ['/api/career/auth/me', '/api/auth/me'];
      let lastError: unknown = null;
      let rejectedSession = false;

      for (const endpoint of endpoints) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await authFetch(endpoint, { signal: controller.signal });
          if (response.status === 401 || response.status === 403) {
            rejectedSession = true;
            lastError = new Error('Session expired');
            break;
          }
          if (!response.ok) {
            throw new Error('Session check failed');
          }
          const profile = await response.json() as UserProfile & {
            authenticated?: boolean;
            token?: string;
            sessionToken?: string;
            isAdmin?: boolean;
            adminToken?: string;
          };
          if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Invalid session response');
          if (!current || isExplicitlySignedOut()) return;
          if (profile.authenticated === false) {
            rejectedSession = true;
            lastError = new Error('Session expired');
            break;
          }
          if (!profile || !profile.id || typeof profile.email !== 'string' || !profile.email.trim()) throw new Error('Invalid session response');
          const hydratedToken = profile.sessionToken || profile.token;
          if (hydratedToken) persistSessionToken(hydratedToken);
          const storedProfile = readProfile();
          if (!storedProfile || typeof storedProfile.email !== 'string' || storedProfile.email.toLowerCase() !== profile.email.toLowerCase()) {
            try {
              sessionStorage.removeItem(REPORT_KEY);
              sessionStorage.removeItem('bonlist-report');
              sessionStorage.removeItem(SELECTED_JOB_KEY);
            } catch { /* Session hydration must work even when browser storage is blocked. */ }
            queryClient.clear();
          }
          if (profile.isAdmin && profile.adminToken && getAdminToken() !== profile.adminToken) {
            persistAdminAccess(profile.adminToken, true);
          } else if (profile.isAdmin === false && isAuthAdminUser()) {
            persistAdminAccess(undefined, false);
          }
          persistProfile(profile);
          if (current) setAccess({ location, check, status: 'allowed' });
          return;
        } catch (error) {
          lastError = error;
        } finally {
          clearTimeout(timeout);
        }
      }

      if (!current) return;
      // Possession of cached credentials is not proof of a valid session.
      if (rejectedSession) {
        clearAuthSession();
        queryClient.clear();
        setLocation(`/login?returnTo=${encodeURIComponent(location)}`);
        return;
      }
      if (lastError) {
        setAccess({ location, check, status: 'unavailable' });
        return;
      }
      setLocation(`/login?returnTo=${encodeURIComponent(location)}`);
    };

    void verifySession();
    return () => { current = false; };
  }, [location, check, setLocation]);

  // Keep the current protected route mounted during same-route revalidation.
  // In particular, returning from the native file picker fires `focus`; a
  // temporary full-screen loading state here would unmount CV Builder and
  // discard its selected-file ref before Generate is clicked.
  if (!access || access.location !== location) {
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

  if (access.status === 'offline') {
    const offlinePath = new URL(window.location.href);
    if (offlinePath.pathname === '/offline-workstation') return <OfflineWorkstationPage />;
    if (offlinePath.pathname === '/cv-builder' && offlinePath.searchParams.get('offline') === '1') return <RoutedErrorBoundary><CvBuilderPage /></RoutedErrorBoundary>;
    return <OfflineWorkstationPage />;
  }

  const isAdmin = location === '/admin' || location.startsWith('/admin/');
  return isAdmin ? (
    <RoutedErrorBoundary><AdminRoute /></RoutedErrorBoundary>
  ) : (
    <RoutedErrorBoundary>
      <AppShell>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/settings/security" component={() => <SecuritySettingsPage />} />
          <Route path="/settings/updates" component={UpdatesPage} />
          <Route path="/app/updates" component={UpdatesPage} />
          <Route path="/security/admin-mfa" component={AdminMfaSetupPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/dashboard" component={CvDashboardPage} />
          <Route path="/my-resumes" component={CvDashboardPage} />
          <Route path="/diagnostic" component={DiagnosticPage} />
          <Route path="/jobs/:id" component={JobDetailPage} />
          <Route path="/jobs" component={JobsPage} />
          <Route path="/job-matches" component={JobsPage} />
          <Route path="/interview" component={InterviewPage} />
          <Route path="/pricing" component={PricingPage} />
          <Route path="/programme" component={ProgrammePage} />
          <Route path="/cv-builder/templates" component={CvBuilderPage} />
          <Route path="/cv-builder/import" component={CvBuilderPage} />
          <Route path="/cv-builder/edit" component={CvBuilderPage} />
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
  const publicJobSlug = pathname.match(/^\/jobs\/([^/]+)$/)?.[1];
  const isPublicCareerRoute = pathname === '/career-advice' || pathname.startsWith('/career-advice/');
  const isPublicJobRoute = pathname === '/jobs/explore'
    || Boolean(publicJobSlug && findPublicJobCategory(publicJobSlug));
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
  if (PUBLIC_INFO_PATHS.has(pathname)) {
    return (
      <RoutedErrorBoundary>
        <AppShell>
          <Switch>
            <Route path="/pricing" component={PricingPage} />
            <Route path="/about" component={() => <TrustPage kind="about" />} />
            <Route path="/contact" component={() => <TrustPage kind="contact" />} />
            <Route path="/privacy" component={() => <TrustPage kind="privacy" />} />
            <Route path="/terms" component={() => <TrustPage kind="terms" />} />
            <Route path="/cookies" component={() => <TrustPage kind="cookies" />} />
            <Route path="/data" component={() => <TrustPage kind="data" />} />
            <Route path="/support" component={() => <TrustPage kind="support" />} />
            <Route path="/advertise" component={() => <TrustPage kind="advertise" />} />
          </Switch>
        </AppShell>
      </RoutedErrorBoundary>
    );
  }
  if (isPublicCareerRoute || isPublicJobRoute) {
    return (
      <RoutedErrorBoundary>
        <AppShell>
          <Switch>
            <Route path="/career-advice/category/:slug" component={CareerAdviceCategoryPage} />
            <Route path="/career-advice/:slug" component={CareerArticlePage} />
            <Route path="/career-advice" component={CareerAdviceIndexPage} />
            <Route path="/jobs/explore" component={PublicJobsIndexPage} />
            <Route path="/jobs/:slug" component={PublicJobCategoryPage} />
          </Switch>
        </AppShell>
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
  if (/^\/shared-cv\/[a-f0-9]{64}$/.test(pathname)) return <SharedCvPage />;
  if (pathname === '/payment/success' || pathname === '/payment/cancel') return <AppShell><PaymentResultPage /></AppShell>;
  if (!isKnownAppPath(pathname)) {
    return <RoutedErrorBoundary><AppShell><NotFound /></AppShell></RoutedErrorBoundary>;
  }
  return <ProtectedApp />;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  useEffect(() => installSignedOutNavigation(), []);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let listener: { remove: () => Promise<void> } | undefined;

    const openAuthCallback = (rawUrl?: string | null) => {
      if (!rawUrl) return;
      try {
        const deepLink = new URL(rawUrl);
        if (deepLink.protocol === 'bonlist:' && deepLink.hostname === 'payment' && ['/success','/cancel'].includes(deepLink.pathname)) {
          window.history.replaceState({}, '', `/payment${deepLink.pathname}${deepLink.search}`);
          window.dispatchEvent(new PopStateEvent('popstate')); return;
        }
        if (deepLink.protocol !== 'bonlist:' || deepLink.hostname !== 'auth' || deepLink.pathname !== '/callback') return;
        const params = new URLSearchParams(deepLink.searchParams);
        const target = params.has('mfaToken') || params.has('error') ? '/login' : '/auth/callback';
        const nextLocation = `${target}?${params.toString()}`;
        window.history.replaceState({}, '', nextLocation);
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch (error) {
        console.error('[Auth] Could not process native Google callback:', error);
      }
    };

    void (async () => {
      try {
        const appUrlOpenListener = await CapacitorApp.addListener('appUrlOpen', ({ url }: { url: string }) => openAuthCallback(url));
        if (disposed) await appUrlOpenListener.remove();
        else listener = appUrlOpenListener;
        const launch = await CapacitorApp.getLaunchUrl();
        if (!disposed) openAuthCallback(launch?.url);
      } catch (error: unknown) {
        console.error('[Auth] Native deep-link listener could not start:', error);
      }
    })();

    return () => {
      disposed = true;
      if (listener) void listener.remove();
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
    void CapacitorUpdater.notifyAppReady().catch((error) => {
      console.error('[bonlist-updater] Could not mark the active bundle ready:', error);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppUpdatePrompt />
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <SeoManager />
          <PaidAccessProvider><AdProvider>
            <YocoCheckoutHost />
            <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground" role="status">Loading BonList…</div>}>
              <Router />
            </Suspense>
            <CookieConsent />
          </AdProvider></PaidAccessProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
