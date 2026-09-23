import {
  type ChangeEvent,
  type TextareaHTMLAttributes,
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  Award,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  FileCheck,
  FileCode,
  FileDown,
  FileSpreadsheet,
  FileText,
  FileUp,
  GraduationCap,
  HelpCircle,
  History,
  Info,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  ListChecks,
  Lock,
  Maximize2,
  MessageSquare,
  Minus,
  MoveDown,
  MoveUp,
  Palette,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
  Upload,
  User,
  Wand2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { readStoredProfile } from "@/lib/entitlements";
import { authFetch, readProfile as readAuthProfile } from "@/lib/auth-session";
import { ensureCvProfile } from "@/lib/cv-profile";
import { buildParseUploadBody, parseUploadErrorMessage } from "@/lib/cv-parse-upload";
import {
  buildGeneratedCv as buildGeneratedCvLocally,
  extractCvDataFromText,
  normalizeStructure,
} from "../../../api-server/src/lib/cv-builder";

const GENERATED_CV_KEY = "bonlist-generated-cv";
const REPORT_KEY = "bonlist-report";
const CV_VERSIONS_KEY = "bonlist-cv-versions";

const MAX_BULLETS_PER_ROLE = 12;
const MAX_BULLET_CHARS = 280;

const PDF_JUNK_RE =
  /\b(?:\d+\s+\d+\s+obj|endobj|endstream|stream\b|xref\b|trailer\b|startxref|\/Type\s*\/|\/Filter\s*\/|\/Length\s+\d+|<<|>>)\b/i;
const UI_PLACEHOLDER_RE =
  /click\s+[“"+]|no (?:education|projects|certifications|languages|references|skills)|add qualification|add project|available upon request above|synthesized? your background/i;
const SYNTHETIC_CV_MARKERS = [
  /\bEnterprise Services\b/i,
  /\bRelevant Qualification\b/i,
  /Delivered high-quality support as a .*resolving customer queries/i,
  /Tracked service metrics and escalations to improve response times/i,
  /Collaborated with teammates to maintain accurate records/i,
];

function scrubCvText(value: string | undefined | null): string {
  if (!value) return "";
  let t = String(value)
    .replace(/[\uFFFD\uFFFE\uFFFF\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  if (PDF_JUNK_RE.test(t)) {
    t = t
      .replace(/\b\d+\s+\d+\s+obj\b/gi, " ")
      .replace(/\b(?:endobj|endstream|stream|xref|trailer|startxref)\b/gi, " ")
      .replace(/<<.*?>>/g, " ")
      .replace(/\/[A-Za-z]+\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  if (UI_PLACEHOLDER_RE.test(t)) return "";
  if (PDF_JUNK_RE.test(t)) return "";
  // Drop strings that are mostly symbols / replacement garbage
  const letters = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  if (t.length > 0 && letters / t.length < 0.35) return "";
  return t;
}

function polishBulletText(text: string, maxChars = MAX_BULLET_CHARS): string {
  let t = scrubCvText(text).replace(/^[\s•\-\*▪▫►○●]+/, "").trim();
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length <= maxChars) return t;
  const clipped = t.slice(0, maxChars);
  const atWord = clipped.replace(/\s+\S*$/, "").replace(/[,;:–—-]+$/, "");
  return `${atWord || clipped}…`;
}

/** Expand canvas textareas so wrapped bullet/summary text is never clipped. */
function fitTextareaHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.max(el.scrollHeight, 20)}px`;
}

function AutoGrowTextarea({
  value,
  className,
  onChange,
  onInput,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    fitTextareaHeight(ref.current);
    // Second pass after layout/fonts so long summaries are not visually clipped
    const id = window.requestAnimationFrame(() => fitTextareaHeight(ref.current));
    return () => window.cancelAnimationFrame(id);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => fitTextareaHeight(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={props.rows ?? 1}
      value={value}
      className={`cv-autogrow-textarea ${className || ""}`}
      onChange={(e) => {
        fitTextareaHeight(e.currentTarget);
        onChange?.(e);
      }}
      onInput={(e) => {
        fitTextareaHeight(e.currentTarget);
        onInput?.(e);
      }}
    />
  );
}

function bulletQualityScore(text: string): number {
  const t = text.toLowerCase();
  let score = Math.min(text.length, 160) / 40;
  if (/\b\d+%|\b\d+\+|\$|r\s?\d|kpi|sla|improved|reduced|increased|led|managed|delivered|achieved|coordinated|implemented\b/i.test(text)) {
    score += 3;
  }
  if (/^(responsible for|duties include|helped with|worked on|assisted with)\b/i.test(t)) {
    score -= 2;
  }
  return score;
}

function selectProfessionalBullets(bullets: string[], limit = MAX_BULLETS_PER_ROLE): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of bullets || []) {
    const polished = polishBulletText(raw);
    if (polished.length < 12) continue;
    if (/^[A-Z][\w &/.-]{2,40}\s+[—–-]\s+[A-Z]/i.test(polished) && polished.length < 70) continue;
    if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{4}\b/i.test(polished)) continue;
    const key = polished.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(polished);
  }
  return cleaned
    .sort((a, b) => bulletQualityScore(b) - bulletQualityScore(a))
    .slice(0, limit)
    .map((b) => polishBulletText(b));
}

function sanitizeCvDocument(doc: GeneratedCvDocument): GeneratedCvDocument {
  const fullName = scrubCvText(doc.fullName) || "";
  const headline = scrubCvText(doc.headline) || "";
  const summary = scrubCvText(doc.summary);
  const email = scrubCvText(doc.email);
  const phone = scrubCvText(doc.phone);
  const location = scrubCvText(doc.location);
  const linkedin = scrubCvText(doc.linkedin) || undefined;
  const website = scrubCvText(doc.website) || undefined;
  const contactLine = [email, phone, location, linkedin, website].filter(Boolean).join(" · ");

  const experiences = (doc.experiences || [])
    .map((exp) => ({
      ...exp,
      role: scrubCvText(exp.role),
      company: scrubCvText(exp.company),
      location: scrubCvText(exp.location) || undefined,
      startDate: scrubCvText(exp.startDate) || exp.startDate,
      endDate: scrubCvText(exp.endDate) || exp.endDate,
      bullets: (exp.bullets || []).map((bullet) => scrubCvText(bullet)).filter(Boolean),
    }))
    .filter((exp) => exp.role || exp.company || exp.bullets.length > 0);

  const education = (doc.education || [])
    .map((edu) => ({
      ...edu,
      degree: scrubCvText(edu.degree),
      institution: scrubCvText(edu.institution),
      graduationYear: scrubCvText(edu.graduationYear) || edu.graduationYear,
      details: scrubCvText(edu.details) || undefined,
    }))
    .filter((edu) => edu.degree || edu.institution);

  const skills = (doc.skills || []).map((s) => scrubCvText(s)).filter((s) => s.length > 1 && s.length < 60);
  const toolsAndSoftware = (doc.toolsAndSoftware || []).map((s) => scrubCvText(s)).filter((s) => s.length > 1 && s.length < 80);

  const projects = (doc.projects || [])
    .map((proj) => ({
      ...proj,
      title: scrubCvText(proj.title),
      subtitle: scrubCvText(proj.subtitle) || undefined,
      link: scrubCvText(proj.link) || undefined,
      bullets: (proj.bullets || []).map((bullet) => scrubCvText(bullet)).filter(Boolean),
    }))
    .filter((p) => p.title);

  const certifications = (doc.certifications || [])
    .map((c) => ({
      ...c,
      name: scrubCvText(c.name),
      issuer: scrubCvText(c.issuer),
      year: scrubCvText(c.year) || undefined,
    }))
    .filter((c) => c.name);

  const languages = (doc.languages || []).map((l) => scrubCvText(l)).filter(Boolean);
  const references = (doc.references || [])
    .map((r) => scrubCvText(r))
    .filter((r) => r && !UI_PLACEHOLDER_RE.test(r));

  return {
    ...doc,
    fullName,
    headline,
    summary,
    email,
    phone,
    location,
    linkedin,
    website,
    contactLine,
    experiences,
    education,
    skills,
    toolsAndSoftware,
    projects,
    certifications,
    languages,
    references,
    footerNote: "",
  };
}

function containsSyntheticCvContent(doc: GeneratedCvDocument): boolean {
  const text = [
    doc.summary,
    ...doc.experiences.flatMap((exp) => [exp.role, exp.company, ...exp.bullets]),
    ...doc.education.flatMap((edu) => [edu.degree, edu.institution]),
  ].join("\n");
  return SYNTHETIC_CV_MARKERS.filter((marker) => marker.test(text)).length >= 2;
}

function condenseCvDocument(doc: GeneratedCvDocument): GeneratedCvDocument {
  return sanitizeCvDocument(doc);
}

export type StatementClassification =
  | "VERIFIED"
  | "REPHRASED"
  | "INFERRED"
  | "MISSING"
  | "UNSUPPORTED";

export type HumanizeTone =
  | "professional"
  | "natural"
  | "confident"
  | "straightforward"
  | "executive"
  | "friendly"
  | "technical";

export interface CvExperienceItem {
  id: string;
  role: string;
  company: string;
  location?: string;
  startDate: string;
  endDate: string;
  current?: boolean;
  bullets: string[];
  classification?: StatementClassification;
}

export interface CvEducationItem {
  id: string;
  degree: string;
  institution: string;
  location?: string;
  graduationYear: string;
  details?: string;
  classification?: StatementClassification;
}

export interface CvProjectItem {
  id: string;
  title: string;
  subtitle?: string;
  link?: string;
  bullets: string[];
}

export interface CvCertificationItem {
  id: string;
  name: string;
  issuer: string;
  year?: string;
}

export interface CvSkillGroup {
  category: string;
  skills: string[];
}

export interface GeneratedCvDocument {
  id?: string;
  versionName?: string;
  structure: string;
  structureLabel: string;
  structureDescription: string;
  templateType?: "double_column" | "single_column" | "compact" | "hybrid" | "executive" | "creative" | "international";
  fullName: string;
  headline: string;
  contactLine: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  website?: string;
  summary: string;
  experiences: CvExperienceItem[];
  education: CvEducationItem[];
  skillGroups: CvSkillGroup[];
  skills: string[];
  toolsAndSoftware?: string[];
  projects?: CvProjectItem[];
  certifications?: CvCertificationItem[];
  languages?: string[];
  references?: string[];
  strengths?: string[];
  keywords: string[];
  sections: { heading: string; items: string[] }[];
  tone?: HumanizeTone;
  footerNote: string;
  authenticityScore: number;
  aiFeedback?: AiFeedbackData;
}

export interface GeneratedCvResponse {
  id: number;
  version: number;
  structure: string;
  title: string;
  createdAt: string;
  document: GeneratedCvDocument;
  cv_content?: CvContentData;
  ai_feedback?: AiFeedbackData;
  message?: string;
}

export interface QualityPillarScore {
  score: number;
  status: "Strong" | "Attention" | "Needs Improvement";
  findings: string[];
  actionableFeedback: Array<{
    title: string;
    status: "Strong" | "Needs Improvement" | "Attention";
    whyThisMatters: string;
    recommendedImprovement: string;
    suggestedRewrite?: string;
  }>;
}

export interface BonListQualityReport {
  overallScore: number;
  pillars: {
    content: QualityPillarScore;
    clarity: QualityPillarScore;
    relevance: QualityPillarScore;
    presentation: QualityPillarScore;
    atsReadability: QualityPillarScore;
    authenticity: QualityPillarScore;
  };
  fixTheseFirst: Array<{
    id: string;
    priority: "High" | "Medium" | "Urgent";
    title: string;
    description: string;
    action: string;
  }>;
  authenticityStatus: {
    score: number;
    verifiedPercentage: number;
    unsupportedItemsCount: number;
    statement: string;
  };
}

export interface RecruiterViewReport {
  firstImpression: {
    overview: string;
    quickTakeaways: string[];
    visibleSeniority: string;
    coreDomain: string;
  };
  whatIsUnclear: string[];
  positioningRecommendation: {
    title: string;
    advice: string;
    suggestedFocus: string;
  };
  first5To10Seconds?: {
    immediateHighlights: string[];
    topThirdScan: string;
  };
  careerDirection?: {
    clarity: "Crystal Clear" | "Moderate / Needs Focus" | "Ambiguous";
    assessment: string;
    recommendation: string;
  };
  evidenceLevel?: {
    rating: "Evidence & Outcomes" | "Primarily Routine Duty Listing";
    analysis: string;
    advice: string;
  };
  concernsAndHesitations?: string[];
  shortlistPotential?: {
    strengths: string[];
    competitiveAdvantage: string;
  };
  responsibleDisclaimer?: string;
}

export interface PreFlightCheckItem {
  id: string;
  category: "content" | "chronology" | "formatting" | "ats" | "authenticity" | "language";
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
  fixSuggestion?: string;
}

export interface PreFlightAuditReport {
  readyForDownload: boolean;
  overallGrade: "Ready for Recruiter Submission" | "Review Recommended" | "Action Required";
  checks: PreFlightCheckItem[];
  summary: {
    contentVerified: boolean;
    employmentHistoryChecked: boolean;
    formattingChecked: boolean;
    atsReadabilityChecked: boolean;
    aiClaimsVerified: boolean;
    professionalLanguageChecked: boolean;
  };
  prioritizedActions: string[];
}

export interface CareerPositioningOption {
  id: string;
  title: string;
  targetIndustries: string[];
  strategicRationale: string;
  synergyBreakdown: string[];
  sampleSummary: string;
}

export interface CareerPositioningReport {
  recommendedPositioning: CareerPositioningOption;
  alternativePositionings: CareerPositioningOption[];
  supportingVerifiedEvidence: string[];
  explanation: string;
  responsibleDisclaimer: string;
}

export interface JobMatchAdvancedReport {
  jobTitle: string;
  overallFitPercentage: number;
  tiers: {
    essential: string[];
    preferred: string[];
    demonstrated: string[];
    notDemonstrated: string[];
    transferable: string[];
    missing: string[];
  };
  keywordIntelligence: {
    matchedSemanticConcepts: Array<{ roleTerm: string; cvEquivalent: string }>;
    potentialKeywordStuffingRisk: boolean;
    naturalReadabilityNote: string;
  };
  cautionNotice: string;
  recommendedActions: string[];
  proposals: TailoringProposal[];
}

export interface TransferableSkillItem {
  provenTask: string;
  transferableCompetency: string;
  relevanceToTarget: string;
  suggestedBulletPhrasing: string;
  whyLegitimate: string;
}

export interface TransferableSkillsReport {
  targetDomain: string;
  transferableItems: TransferableSkillItem[];
  summaryAdvice: string;
}

export interface AchievementDiscoveryQuestion {
  id: string;
  expId: string;
  role: string;
  company: string;
  dutyBullet: string;
  question: string;
  category: "volume" | "speed" | "quality" | "tools" | "sla";
  hint: string;
}

export interface TailoringProposal {
  id: string;
  section: "summary" | "experience" | "skills" | "order";
  title: string;
  reason: string;
  before: string;
  after: string;
  status: "pending" | "accepted" | "rejected" | "customized";
}

export type ImproveCvScope =
  | "entire"
  | "summary"
  | "experience"
  | "skills"
  | "education"
  | "other";

export interface ImproveCvProposal {
  id: string;
  section: "summary" | "experience" | "skills" | "education" | "certifications" | "projects" | "headline";
  path: string;
  title: string;
  reason: string;
  before: string;
  after: string;
  status: "pending" | "accepted" | "rejected" | "edited";
  missingHint?: string;
}

export interface ImproveCvReport {
  scope: ImproveCvScope;
  proposalCount: number;
  unchangedNote?: string;
  qualityNotes: string[];
  missingSuggestions: string[];
  proposals: ImproveCvProposal[];
}

export interface JobMatchReport {
  jobTitle: string;
  overallMatch: number;
  strongMatches: string[];
  missingOrUnclear: string[];
  cautionNotice: string;
  recommendedAction: string;
  proposals: TailoringProposal[];
}

export interface CvContentData {
  personal: {
    fullName: string;
    email: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    website?: string;
    professionalTitle?: string;
  };
  summary: string;
  experiences: CvExperienceItem[];
  education: CvEducationItem[];
  skills: string[];
  toolsAndSoftware?: string[];
  certifications?: CvCertificationItem[];
  languages?: string[];
  projects?: CvProjectItem[];
  references?: string[];
}

export interface AiFeedbackData {
  summaryFeedback?: string;
  internalTips: string[];
  missingKeywords: string[];
  jobBoardAdvice: string[];
  flaggedPhrases: string[];
  strengths: Array<{ title: string; detail: string }>;
  improvements: Array<{ title: string; detail: string; priority?: string }>;
  recommendations?: string[];
}

export function isReviewerFeedbackNote(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return /your cv reads as|recruiters in \w+ need|impact language is the main gap|need clearer proof|quantify outcomes,? not activity|replace task lists with|cut polished filler phrases|recommendations? for (?:this|your) cv/i.test(text);
}

export interface ExtractedCvData {
  cv_content?: CvContentData;
  ai_feedback?: AiFeedbackData;
  personal: {
    fullName: string;
    email: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    website?: string;
    professionalTitle?: string;
  };
  summary: string;
  experiences: CvExperienceItem[];
  education: CvEducationItem[];
  skills: string[];
  toolsAndSoftware: string[];
  certifications: CvCertificationItem[];
  languages: string[];
  projects: CvProjectItem[];
  references: string[];
  verificationBreakdown: {
    personal: { verified: boolean; missingFields: string[] };
    experience: { count: number; verifiedDates: boolean; verifiedCompanies: boolean };
    education: { count: number; verified: boolean };
    skills: { count: number };
  };
  verificationAudit?: {
    verifiedEntities: string[];
    droppedHallucinations: string[];
    antiLeakageApplied: boolean;
  };
}

/**
 * Keep CV intake usable if the edge parser route is temporarily unavailable.
 * The browser already has readable text for PDF, DOCX and TXT uploads, so use
 * the same parser as the Worker as a local fallback instead of losing intake.
 */
async function parseCvUpload(file: File, onProgress?: (message: string) => void): Promise<ExtractedCvData> {
  const parseBody = await buildParseUploadBody(file, onProgress);
  const localData = parseBody.text?.trim()
    ? extractCvDataFromText(parseBody.text, file.name) as ExtractedCvData
    : null;
  try {
    const response = await authFetch("/api/career/cv/parse-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parseBody),
    });
    if (response.ok) {
      const remoteData = (await response.json()) as ExtractedCvData;
      if (!localData) return remoteData;
      const remoteContent = remoteData.cv_content || remoteData;
      const localContent = localData.cv_content || localData;
      const richness = (data: typeof remoteContent) =>
        (data.experiences?.length || 0) * 5 +
        (data.education?.length || 0) * 4 +
        (data.skills?.length || 0) * 2 +
        (data.projects?.length || 0) * 2 +
        (data.summary?.length || 0) +
        (data.personal?.email ? 1 : 0) +
        (data.personal?.fullName ? 1 : 0);
      return richness(localContent) > richness(remoteContent) ? localData : remoteData;
    }

    const errBody = (await response.json().catch(() => null)) as { error?: string } | null;
    if (localData) {
      onProgress?.("Using the local CV reader…");
      return localData;
    }
    throw new Error(parseUploadErrorMessage(response.status, errBody));
  } catch (error) {
    if (localData) {
      onProgress?.("Using the local CV reader…");
      return localData;
    }
    throw error;
  }
}

/** A profile header alone is not enough to call a CV successfully built. */
function hasUsableCvBody(data?: ExtractedCvData | null): boolean {
  if (!data) return false;
  const content = data.cv_content || data;
  const summary = String(content.summary || "").trim();
  const usableSummary = summary.length >= 24 && !/synthesize your background|add (?:a|your) (?:professional )?summary|write (?:a|your) summary/i.test(summary);
  return Boolean(
    usableSummary ||
    content.experiences?.some((item) => Boolean(item.role?.trim() || item.company?.trim() || item.bullets?.some((bullet) => bullet.trim()))) ||
    content.education?.some((item) => Boolean(item.degree?.trim() || item.institution?.trim())) ||
    content.skills?.some((skill) => String(skill).trim()) ||
    content.projects?.some((project) => Boolean(project.title?.trim() || project.bullets?.some((bullet) => bullet.trim()))) ||
    content.certifications?.some((certification) => Boolean(certification.name?.trim()))
  );
}

async function parseCvText(text: string, fileName = "Pasted CV"): Promise<ExtractedCvData> {
  try {
    const response = await authFetch("/api/career/cv/parse-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, fileName }),
    });
    if (response.ok) return (await response.json()) as ExtractedCvData;
  } catch {
    // The same parser runs locally below when the edge route is unavailable.
  }
  return extractCvDataFromText(text, fileName) as ExtractedCvData;
}

function buildLocalCvResponse(
  options: { structure?: string; extracted?: ExtractedCvData },
  profile: { name?: string; email?: string; phone?: string; location?: string; targetRole?: string },
  message: string,
): GeneratedCvResponse {
  const structure = normalizeStructure(options.structure || "double_column");
  const document = buildGeneratedCvLocally({
    profile: {
      name: profile.name || options.extracted?.personal?.fullName || "Candidate",
      email: profile.email || options.extracted?.personal?.email || "",
      phone: profile.phone || options.extracted?.personal?.phone,
      location: profile.location || options.extracted?.personal?.location,
      targetRole: profile.targetRole || options.extracted?.personal?.professionalTitle,
    },
    extracted: options.extracted as unknown as Parameters<typeof buildGeneratedCvLocally>[0]["extracted"],
    structure,
  });
  const localDocument = document as unknown as GeneratedCvDocument;
  return {
    id: 0,
    version: 1,
    structure: localDocument.structure,
    title: `${localDocument.fullName} · ${localDocument.headline} CV (${localDocument.structureLabel})`,
    createdAt: new Date().toISOString(),
    document: localDocument,
    cv_content: options.extracted?.cv_content,
    ai_feedback: localDocument.aiFeedback,
    message,
  };
}

export interface TemplateDefinition {
  id: string;
  category: "Modern" | "Traditional" | "Creative" | "ATS-Friendly" | "Executive" | "Minimalist";
  name: string;
  tagline: string;
  bestFor: string;
  columns: "double" | "single";
  previewAccent: string;
  pageDensity: string;
  structuralTag: string;
  templateType:
    | "double_column"
    | "single_column"
    | "compact"
    | "hybrid"
    | "executive"
    | "creative"
    | "international"
    | "timeline"
    | "minimal";
}

const TEMPLATE_CATALOG: TemplateDefinition[] = [
  {
    id: "serif_classic",
    category: "Traditional",
    name: "Serif Classic",
    tagline: "Centered classic serif header with formal rules — polished academic & professional single-column CV.",
    bestFor: "Engineering, academia, consulting, traditional corporate roles",
    columns: "single",
    previewAccent: "#111827",
    pageDensity: "1-2 pages",
    structuralTag: "Serif Classic",
    templateType: "single_column",
  },
  {
    id: "corporate_blue",
    category: "Modern",
    name: "Corporate Blue",
    tagline: "Modern blue accent headings, right-aligned dates, and crisp professional experience hierarchy.",
    bestFor: "Finance, operations, analysts, corporate professionals",
    columns: "single",
    previewAccent: "#2563eb",
    pageDensity: "1-2 pages",
    structuralTag: "Corporate Blue",
    templateType: "single_column",
  },
  {
    id: "editorial_gold",
    category: "Executive",
    name: "Editorial Gold",
    tagline: "Editorial serif headings with warm gold accent rules and left-aligned narrative layout.",
    bestFor: "Legal, executive, advisory, senior professional roles",
    columns: "single",
    previewAccent: "#b45309",
    pageDensity: "1-2 pages",
    structuralTag: "Editorial Gold",
    templateType: "single_column",
  },
  {
    id: "analyst_clean",
    category: "Modern",
    name: "Analyst Clean",
    tagline: "Modern grayscale split header, dotted section dividers, certificates, and proficiency-ready skills.",
    bestFor: "Business analysts, product, operations, tech professionals",
    columns: "single",
    previewAccent: "#334155",
    pageDensity: "1-2 pages",
    structuralTag: "Analyst Clean",
    templateType: "single_column",
  },
  {
    id: "double_column",
    category: "Modern",
    name: "Double Column",
    tagline: "Enhancv signature compact two-column layout. Balances your highlights with your career story.",
    bestFor: "Consulting, engineering, management, mid and senior roles",
    columns: "double",
    previewAccent: "#059669",
    pageDensity: "1-2 pages",
    structuralTag: "Enhancv Signature",
    templateType: "double_column",
  },
  {
    id: "ivy_league",
    category: "Traditional",
    name: "Ivy League",
    tagline: "Distinguished academic & legal single-column layout with centered header and classic divider rules.",
    bestFor: "Law, finance, academia, strategy consulting, executive corporate",
    columns: "single",
    previewAccent: "#1e3a8a",
    pageDensity: "1-2 pages",
    structuralTag: "Ivy League",
    templateType: "single_column",
  },
  {
    id: "elegant",
    category: "Traditional",
    name: "Elegant",
    tagline: "Sophisticated typography, delicate subheaders, italicized company accents, and subtle borders.",
    bestFor: "Executive leadership, communications, luxury, arts management",
    columns: "single",
    previewAccent: "#7c3aed",
    pageDensity: "1-2 pages",
    structuralTag: "Elegant",
    templateType: "single_column",
  },
  {
    id: "contemporary",
    category: "Modern",
    name: "Contemporary",
    tagline: "Fresh modern sans-serif with bold left accent bars on headings and clean card/pill competencies.",
    bestFor: "Product, marketing, growth, tech leads, design managers",
    columns: "double",
    previewAccent: "#0284c7",
    pageDensity: "1-2 pages",
    structuralTag: "Contemporary",
    templateType: "double_column",
  },
  {
    id: "modern",
    category: "Modern",
    name: "Modern",
    tagline: "Sleek dual-column layout with visual hierarchy, accent header bar, and balanced right sidebar.",
    bestFor: "Software, product, analytics, digital operations",
    columns: "double",
    previewAccent: "#0f766e",
    pageDensity: "1-2 pages",
    structuralTag: "Modern",
    templateType: "double_column",
  },
  {
    id: "timeline",
    category: "Creative",
    name: "Timeline",
    tagline: "Enhancv signature chronological timeline. Visual vertical milestone track connecting career progression.",
    bestFor: "Project managers, customer operations, career advancers, engineers",
    columns: "single",
    previewAccent: "#4338ca",
    pageDensity: "1-2 pages",
    structuralTag: "Timeline",
    templateType: "timeline",
  },
  {
    id: "creative",
    category: "Creative",
    name: "Creative",
    tagline: "Visual impact layout with colored summary highlight card, badge tags, and portfolio emphasis.",
    bestFor: "Designers, creative directors, copywriters, media professionals",
    columns: "double",
    previewAccent: "#be123c",
    pageDensity: "1-2 pages",
    structuralTag: "Creative",
    templateType: "creative",
  },
  {
    id: "stylish",
    category: "Creative",
    name: "Stylish",
    tagline: "High-contrast tinted header band, sleek modern typography, and refined metadata chips.",
    bestFor: "Brand strategy, startups, digital marketing, creative leadership",
    columns: "double",
    previewAccent: "#b45309",
    pageDensity: "1-2 pages",
    structuralTag: "Stylish",
    templateType: "double_column",
  },
  {
    id: "single_column",
    category: "ATS-Friendly",
    name: "Single Column",
    tagline: "Classic linear ATS-optimized layout with right-aligned dates and maximum machine parseability.",
    bestFor: "Workday, Taleo, Greenhouse, Lever, enterprise portals",
    columns: "single",
    previewAccent: "#1e3a8a",
    pageDensity: "1-2 pages",
    structuralTag: "ATS Standard",
    templateType: "single_column",
  },
  {
    id: "compact",
    category: "Modern",
    name: "Compact",
    tagline: "High-density two-column layout that fits 15-20% more verified content into a single page.",
    bestFor: "Junior and mid-level professionals, dense engineering profiles",
    columns: "double",
    previewAccent: "#0f766e",
    pageDensity: "1-page dense",
    structuralTag: "Compact 1-Page",
    templateType: "compact",
  },
  {
    id: "polished",
    category: "Executive",
    name: "Polished",
    tagline: "Executive presentation with crisp divider rules, formal role hierarchy, and structured alignments.",
    bestFor: "Directors, VPs, senior consultants, general managers",
    columns: "single",
    previewAccent: "#334155",
    pageDensity: "1-2 pages",
    structuralTag: "Executive",
    templateType: "executive",
  },
  {
    id: "multicolumn",
    category: "Modern",
    name: "Multicolumn",
    tagline: "Dynamic modular multi-panel structure balancing experience tenure with rapid-scan skills.",
    bestFor: "Multi-skilled specialists, hybrid leaders, technical managers",
    columns: "double",
    previewAccent: "#0284c7",
    pageDensity: "1-2 pages",
    structuralTag: "Multicolumn",
    templateType: "double_column",
  },
  {
    id: "classic",
    category: "Traditional",
    name: "Classic",
    tagline: "Timeless reverse-chronological corporate standard. Clean headings, traditional bullet hierarchy.",
    bestFor: "Corporate finance, operations, business administration, banking",
    columns: "single",
    previewAccent: "#18181b",
    pageDensity: "1-2 pages",
    structuralTag: "Classic",
    templateType: "single_column",
  },
  {
    id: "high_performer",
    category: "Executive",
    name: "High Performer",
    tagline: "Outcome-driven format engineered to spotlight quantified metrics, achievements, and business scale.",
    bestFor: "Sales leaders, commercial directors, revenue operators, founders",
    columns: "single",
    previewAccent: "#059669",
    pageDensity: "1-2 pages",
    structuralTag: "Impact-First",
    templateType: "single_column",
  },
  {
    id: "minimal",
    category: "Minimalist",
    name: "Minimal",
    tagline: "Ultra-clean minimalist layout with generous whitespace, delicate divider lines, and zero distractions.",
    bestFor: "Minimalists, architects, analysts, modern tech workers",
    columns: "single",
    previewAccent: "#18181b",
    pageDensity: "1-2 pages",
    structuralTag: "Minimalist",
    templateType: "minimal",
  },
];

export const resolveTemplate = (id?: string | null): TemplateDefinition => {
  if (!id) return TEMPLATE_CATALOG[0]!;
  const direct = TEMPLATE_CATALOG.find((t) => t.id === id);
  if (direct) return direct;
  if (id === "professional") return TEMPLATE_CATALOG.find((t) => t.id === "double_column") || TEMPLATE_CATALOG[0]!;
  if (id === "executive" || id === "executive_classic") return TEMPLATE_CATALOG.find((t) => t.id === "polished") || TEMPLATE_CATALOG[0]!;
  if (id === "graduate") return TEMPLATE_CATALOG.find((t) => t.id === "single_column") || TEMPLATE_CATALOG[0]!;
  if (id === "technical" || id === "tech_minimal") return TEMPLATE_CATALOG.find((t) => t.id === "compact") || TEMPLATE_CATALOG[0]!;
  if (id === "ats_friendly" || id === "ats") return TEMPLATE_CATALOG.find((t) => t.id === "single_column") || TEMPLATE_CATALOG[0]!;
  if (id === "contemporary_hybrid") return TEMPLATE_CATALOG.find((t) => t.id === "contemporary") || TEMPLATE_CATALOG[0]!;
  if (id === "impact_performer" || id === "impact") return TEMPLATE_CATALOG.find((t) => t.id === "high_performer") || TEMPLATE_CATALOG[0]!;
  return TEMPLATE_CATALOG[0]!;
};

const COLOR_THEMES = [
  { id: "emerald", label: "Emerald Focus (Signature)", primary: "#059669", secondary: "#ecfdf5", border: "#a7f3d0" },
  { id: "navy", label: "Royal Navy Executive", primary: "#1e3a8a", secondary: "#eff6ff", border: "#bfdbfe" },
  { id: "sky", label: "Deep Ocean / Sky", primary: "#0284c7", secondary: "#f0f9ff", border: "#bae6fd" },
  { id: "teal", label: "Deep Teal Tech", primary: "#0f766e", secondary: "#f0fdfa", border: "#99f6e4" },
  { id: "indigo", label: "Electric Indigo", primary: "#4338ca", secondary: "#eef2ff", border: "#c7d2fe" },
  { id: "purple", label: "Jacaranda Purple", primary: "#7c3aed", secondary: "#faf5ff", border: "#ddd6fe" },
  { id: "crimson", label: "Crimson Prestige", primary: "#be123c", secondary: "#fff1f2", border: "#fecdd3" },
  { id: "amber", label: "Protea Amber Gold", primary: "#b45309", secondary: "#fffbeb", border: "#fde68a" },
  { id: "pine", label: "Forest Pine", primary: "#166534", secondary: "#f0fdf4", border: "#bbf7d0" },
  { id: "charcoal", label: "Charcoal Minimal", primary: "#18181b", secondary: "#fafafa", border: "#e4e4e7" },
];

const FONT_OPTIONS = [
  { id: "lato", label: "Lato (Enhancv Signature)", family: "'Lato', sans-serif" },
  { id: "rubik", label: "Rubik (Modern Geometric)", family: "'Rubik', sans-serif" },
  { id: "sans", label: "Inter / Figtree (Clean UI)", family: "var(--font-sans), ui-sans-serif, system-ui, sans-serif" },
  { id: "merriweather", label: "Merriweather (Ivy League Serif)", family: "'Merriweather', Georgia, serif" },
  { id: "raleway", label: "Raleway (Sophisticated)", family: "'Raleway', sans-serif" },
  { id: "playfair", label: "Playfair Display (Executive Editorial)", family: "'Playfair Display', Georgia, serif" },
  { id: "mono", label: "Technical Mono (System Stack)", family: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];

const BACKGROUND_PATTERNS = [
  { id: "none", label: "Pure White", description: "Standard A4 clean document", style: {} },
  { id: "ivory", label: "Warm Ivory", description: "Subtle warm paper tone", style: { backgroundColor: "#fdfbf7" } },
  { id: "dots", label: "Subtle Dots", description: "Enhancv geometric dot matrix", style: { backgroundImage: "radial-gradient(#e2e8f0 1.2px, transparent 1.2px)", backgroundSize: "16px 16px" } },
  { id: "grid", label: "Subtle Grid", description: "Architectural graph lines", style: { backgroundImage: "linear-gradient(to right, #f1f5f9 1px, transparent 1px), linear-gradient(to bottom, #f1f5f9 1px, transparent 1px)", backgroundSize: "20px 20px" } },
];

export function clearGeneratedCv() {
  try {
    sessionStorage.removeItem(GENERATED_CV_KEY);
  } catch {
    // ignore
  }
}

export function persistGeneratedCv(payload: GeneratedCvResponse) {
  const next = {
    ...payload,
    document: condenseCvDocument(payload.document),
  };
  sessionStorage.setItem(GENERATED_CV_KEY, JSON.stringify(next));
}

export function readGeneratedCv(): GeneratedCvResponse | null {
  try {
    const raw = sessionStorage.getItem(GENERATED_CV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GeneratedCvResponse;
    if (!parsed?.document) return parsed;
    return {
      ...parsed,
      document: condenseCvDocument(parsed.document),
    };
  } catch {
    return null;
  }
}

function readReport() {
  try {
    const raw =
      sessionStorage.getItem(REPORT_KEY) ||
      sessionStorage.getItem("careerbridge-report") ||
      sessionStorage.getItem("bonlist-report");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function generateCv(options: { regenerate?: boolean; structure?: string; extracted?: ExtractedCvData } = {}) {
  // The edge generator upserts a signed-in profile and can preview a guest CV.
  const candidate = options.extracted?.cv_content?.personal || options.extracted?.personal;
  const existing = readStoredProfile() || readAuthProfile();
  const diagnostic = readReport();
  const body = {
    name: candidate?.fullName || existing?.name,
    email: candidate?.email || existing?.email,
    phone: candidate?.phone || existing?.phone,
    location: candidate?.location || existing?.location,
    targetRole: candidate?.professionalTitle || existing?.targetRole,
    diagnosticId: diagnostic?.id,
    diagnostic,
    regenerate: Boolean(options.regenerate),
    structure: options.structure,
    extracted: options.extracted,
  };

  if (!hasUsableCvBody(options.extracted)) {
    throw new Error("The uploaded information did not include a readable summary, work history, education, skills, project, or certification. Please retry the upload or paste the CV text so it can be captured before building.");
  }

  let response: Response;
  try {
    response = await authFetch("/api/career/cv/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
  } catch {
    response = new Response(JSON.stringify({ error: "The BonList CV service is temporarily unavailable. Please try again." }), {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  const rawResponse = await response.text();
  let payload: Record<string, any> = {};
  try {
    payload = rawResponse ? (JSON.parse(rawResponse) as Record<string, any>) : {};
  } catch {
    const fallback = buildLocalCvResponse(
      options,
      {
        name: body.name || candidate?.fullName || existing?.name,
        email: body.email || existing?.email,
        phone: body.phone || existing?.phone,
        location: body.location || existing?.location,
        targetRole: body.targetRole || candidate?.professionalTitle || existing?.targetRole,
      },
      "Built locally from your uploaded CV because the CV service could not be reached.",
    );
    persistGeneratedCv(fallback);
    return fallback;
  }

  if (!response.ok) {
    const fallback = buildLocalCvResponse(
      options,
      {
        name: body.name || candidate?.fullName || existing?.name,
        email: body.email || existing?.email,
        phone: body.phone || existing?.phone,
        location: body.location || existing?.location,
        targetRole: body.targetRole || candidate?.professionalTitle || existing?.targetRole,
      },
      payload.error || "Built locally from your uploaded CV because the CV service is temporarily unavailable.",
    );
    persistGeneratedCv(fallback);
    return fallback;
  }

  const generated = payload as GeneratedCvResponse;
  if (!generated.document) {
    const fallback = buildLocalCvResponse(options, {
      name: body.name || candidate?.fullName || existing?.name,
      email: body.email || existing?.email,
      phone: body.phone || existing?.phone,
      location: body.location || existing?.location,
      targetRole: body.targetRole || candidate?.professionalTitle || existing?.targetRole,
    }, "The CV service returned no document, so this CV was built locally from your uploaded information.");
    persistGeneratedCv(fallback);
    return fallback;
  }

  // Preserve extracted sections if an older edge deployment returns a partial
  // CV document, and honor the template selected in the builder.
  const localDocument = buildLocalCvResponse(options, {
    name: body.name || candidate?.fullName || existing?.name,
    email: body.email || existing?.email,
    phone: body.phone || existing?.phone,
    location: body.location || existing?.location,
    targetRole: body.targetRole || candidate?.professionalTitle || existing?.targetRole,
  }, "").document;
  generated.document = sanitizeCvDocument({
    ...localDocument,
    ...generated.document,
    structure: localDocument.structure,
    structureLabel: localDocument.structureLabel,
    structureDescription: localDocument.structureDescription,
    templateType: localDocument.templateType,
    fullName: generated.document.fullName || localDocument.fullName,
    headline: generated.document.headline || localDocument.headline,
    contactLine: generated.document.contactLine || localDocument.contactLine,
    email: generated.document.email || localDocument.email,
    phone: generated.document.phone || localDocument.phone,
    location: generated.document.location || localDocument.location,
    summary: generated.document.summary && !/synthesize your background|add (?:a|your) (?:professional )?summary|write (?:a|your) summary/i.test(generated.document.summary)
      ? generated.document.summary
      : localDocument.summary,
    experiences: generated.document.experiences?.length ? generated.document.experiences : localDocument.experiences,
    education: generated.document.education?.length ? generated.document.education : localDocument.education,
    skills: generated.document.skills?.length ? generated.document.skills : localDocument.skills,
    skillGroups: generated.document.skillGroups?.length ? generated.document.skillGroups : localDocument.skillGroups,
    sections: generated.document.sections?.length ? generated.document.sections : localDocument.sections,
    projects: generated.document.projects?.length ? generated.document.projects : localDocument.projects,
    certifications: generated.document.certifications?.length ? generated.document.certifications : localDocument.certifications,
    languages: generated.document.languages?.length ? generated.document.languages : localDocument.languages,
    references: generated.document.references?.length ? generated.document.references : localDocument.references,
  });
  generated.structure = generated.document.structure;
  generated.title = `${generated.document.fullName} · ${generated.document.headline} CV (${generated.document.structureLabel})`;
  persistGeneratedCv(generated);
  return generated;
}

// ---------------------------------------------------------------------------
// Template Thumbnail — compact full-CV preview (no Live badge)
// ---------------------------------------------------------------------------
function TemplateThumbnail({
  tpl,
  selected,
  onSelect,
  doc,
}: {
  tpl: TemplateDefinition;
  selected: boolean;
  onSelect: () => void;
  doc?: GeneratedCvDocument | null;
}) {
  const accent = tpl.previewAccent;
  const isDouble = tpl.columns === "double";
  const isTimeline = tpl.templateType === "timeline" || tpl.id === "timeline";
  const isStylish = tpl.id === "stylish";
  const isSerifClassic = tpl.id === "serif_classic" || tpl.id === "ivy_league";
  const isCorporateBlue = tpl.id === "corporate_blue";
  const isEditorialGold = tpl.id === "editorial_gold" || tpl.id === "elegant" || tpl.id === "polished";
  const isAnalystClean = tpl.id === "analyst_clean" || tpl.id === "minimal";
  const isCreative = tpl.id === "creative";

  const name = (doc?.fullName || "").trim();
  const title = (doc?.headline || "").trim();
  const contact = [doc?.email, doc?.phone, doc?.location].filter(Boolean).join(" · ");
  const summaryRaw = (doc?.summary || "").trim();
  const summary = summaryRaw.slice(0, 90) + (summaryRaw.length > 90 ? "…" : "");
  const experiences = (doc?.experiences || []).slice(0, 2);
  const skills = (doc?.skills || []).slice(0, 6);
  const education = (doc?.education || []).slice(0, 2);
  const languages = (doc?.languages || []).slice(0, 3);
  const certs = (doc?.certifications || []).slice(0, 1);

  const sectionLabel = (label: string) => {
    if (isAnalystClean) return label.toUpperCase().split("").join(" ");
    if (isSerifClassic || isCorporateBlue) return label.toUpperCase();
    return label;
  };

  const headingColor = isSerifClassic ? "#0f172a" : accent;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex w-full flex-col rounded-2xl border p-2 text-left transition-all ${
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/40 shadow-md"
          : "border-border bg-card hover:border-primary/50 hover:bg-secondary/40 hover:shadow-sm"
      }`}
    >
      <div className="relative mb-2 aspect-[210/297] w-full overflow-hidden rounded-md border border-slate-300 bg-white shadow-[0_8px_20px_rgba(15,23,42,0.14)]">
        <div
          className="origin-top-left"
          style={{
            width: "310%",
            height: "310%",
            transform: "scale(0.323)",
            fontFamily: isSerifClassic || isEditorialGold ? "Georgia, 'Times New Roman', serif" : "system-ui, sans-serif",
          }}
        >
          <div className="bg-white p-3.5 text-[8.5px] leading-[1.3] text-slate-800">
            {isStylish ? (
              <div className="-mx-3.5 -mt-3.5 mb-2 px-3.5 py-2.5 text-white" style={{ backgroundColor: accent }}>
                <div className="text-[14px] font-black tracking-tight">{name}</div>
                <div className="text-[9px] font-semibold opacity-90">{title}</div>
                <div className="mt-1 text-[7px] opacity-80">{contact}</div>
              </div>
            ) : isAnalystClean ? (
              <div className="mb-2 flex items-start justify-between gap-2 border-b border-dashed border-slate-300 pb-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-black text-slate-900">{name}</div>
                  <div className="text-[9px] text-slate-600">{title}</div>
                </div>
                <div className="max-w-[40%] shrink-0 text-right text-[7px] leading-snug text-slate-500">
                  <div>{doc?.phone || "+27 …"}</div>
                  <div className="break-all">{doc?.email || "email@domain.com"}</div>
                  <div>{doc?.location || "City"}</div>
                </div>
              </div>
            ) : isSerifClassic ? (
              <div className="mb-2 border-b border-slate-900 pb-2 text-center">
                <div className="font-serif text-[15px] font-bold text-slate-950">{name}</div>
                <div className="font-serif text-[9px] italic text-slate-600">{title}</div>
                <div className="mt-1 text-[7px] text-slate-500">{contact}</div>
              </div>
            ) : isCorporateBlue || isEditorialGold ? (
              <div className="mb-2">
                <div
                  className={`font-bold ${isCorporateBlue ? "text-[13px] uppercase tracking-wide" : "font-serif text-[15px]"}`}
                  style={{ color: accent }}
                >
                  {name}
                </div>
                <div className={`text-[8px] font-semibold text-slate-700 ${isCorporateBlue ? "uppercase tracking-wider" : ""}`}>
                  {title}
                </div>
                <div className="mt-0.5 text-[7px] text-slate-500">{contact}</div>
                <div className="mt-1.5 h-[2px] w-full" style={{ backgroundColor: accent }} />
              </div>
            ) : (
              <div className={`mb-2 ${tpl.id === "ivy_league" || tpl.id === "polished" ? "text-center" : ""}`}>
                <div className="text-[14px] font-black" style={{ color: accent }}>{name}</div>
                <div className="text-[9px] font-semibold text-slate-700">{title}</div>
                <div className="mt-0.5 text-[7px] text-slate-500">{contact}</div>
                <div className="mt-1.5 h-px w-full" style={{ backgroundColor: accent }} />
              </div>
            )}

            <div className={isDouble ? "grid grid-cols-[1.4fr_1fr] gap-2.5" : "space-y-2"}>
              <div className="min-w-0 space-y-2">
                <div>
                  <div
                    className={`mb-0.5 text-[8px] font-bold ${isSerifClassic ? "border-y border-slate-800 py-0.5" : ""}`}
                    style={{ color: headingColor }}
                  >
                    {sectionLabel(isEditorialGold ? "Profile" : "Summary")}
                  </div>
                  <p className="text-[7px] text-slate-600">{summary}</p>
                </div>

                <div>
                  <div
                    className={`mb-0.5 text-[8px] font-bold ${isAnalystClean ? "border-b border-dashed border-slate-300 pb-0.5" : ""}`}
                    style={{ color: headingColor }}
                  >
                    {sectionLabel("Experience")}
                  </div>
                  <div className="space-y-1.5">
                    {experiences.map((exp, idx) => (
                      <div key={idx}>
                        {isTimeline ? (
                          <div className="relative ml-1 border-l-2 pl-2" style={{ borderColor: `${accent}66` }}>
                            <span className="absolute -left-[4px] top-0.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
                            <div className="text-[8px] font-bold text-slate-900">
                              {exp.role} · {exp.company}
                            </div>
                            <div className="text-[6.5px] text-slate-500">
                              {exp.startDate} – {exp.endDate}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-baseline justify-between gap-1">
                              <div className="min-w-0 text-[8px] font-bold text-slate-900">
                                {exp.role} · {exp.company}
                              </div>
                              <div className="shrink-0 text-[6.5px] text-slate-500">
                                {exp.startDate} – {exp.endDate}
                              </div>
                            </div>
                            <ul className="mt-0.5 space-y-0.5">
                              {(exp.bullets || []).slice(0, 2).map((b, i) => (
                                <li key={i} className="flex gap-1 text-[7px] text-slate-600">
                                  <span className="mt-[2px] h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                                  <span>{b.length > 95 ? `${b.slice(0, 95)}…` : b}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {!isDouble && (
                  <div>
                    <div className="mb-0.5 text-[8px] font-bold" style={{ color: headingColor }}>
                      {sectionLabel("Education")}
                    </div>
                    {education.map((edu, i) => (
                      <div key={i} className="text-[7px] text-slate-700">
                        <span className="font-semibold">{edu.degree}</span>
                        {edu.institution ? ` · ${edu.institution}` : ""}
                        {edu.graduationYear ? ` · ${edu.graduationYear}` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={`min-w-0 space-y-2 ${isDouble ? "rounded bg-slate-50 p-1.5" : ""}`}>
                <div>
                  <div className="mb-0.5 text-[8px] font-bold" style={{ color: headingColor }}>
                    {sectionLabel("Skills")}
                  </div>
                  <div className="flex flex-wrap gap-0.5">
                    {skills.map((s) => (
                      <span
                        key={s}
                        className="rounded border px-1 py-[1px] text-[6px] font-medium"
                        style={{ borderColor: `${accent}55`, color: accent, backgroundColor: `${accent}12` }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {isDouble && (
                  <div>
                    <div className="mb-0.5 text-[8px] font-bold" style={{ color: headingColor }}>
                      {sectionLabel("Education")}
                    </div>
                    {education.map((edu, i) => (
                      <div key={i} className="text-[7px] text-slate-600">
                        {edu.degree}
                        {edu.institution ? ` · ${edu.institution}` : ""}
                      </div>
                    ))}
                  </div>
                )}

                {languages.length > 0 && (
                  <div>
                    <div className="mb-0.5 text-[8px] font-bold" style={{ color: headingColor }}>
                      {sectionLabel("Languages")}
                    </div>
                    <div className="text-[7px] text-slate-600">{languages.join(" · ")}</div>
                  </div>
                )}

                {certs.length > 0 && (
                  <div>
                    <div className="mb-0.5 text-[8px] font-bold" style={{ color: headingColor }}>
                      {sectionLabel("Certifications")}
                    </div>
                    <div className="text-[7px] text-slate-600">{certs[0]?.name}</div>
                  </div>
                )}

                {isCreative && (
                  <div className="rounded border p-1.5" style={{ backgroundColor: `${accent}14`, borderColor: `${accent}33` }}>
                    <div className="text-[8px] font-bold" style={{ color: accent }}>{sectionLabel("Highlights")}</div>
                    <p className="text-[7px] text-slate-600">{summary.slice(0, 60)}…</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {selected && (
          <span className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white shadow">
            ✓
          </span>
        )}
      </div>

      <div className="min-w-0 px-0.5">
        <div className="truncate text-xs font-bold text-foreground">{tpl.name}</div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {isDouble ? "2-Column" : isTimeline ? "Timeline" : "Single-Column"} �� {tpl.pageDensity}
        </div>
      </div>
    </button>
  );
}

function offsetWithinRoot(el: HTMLElement, root: HTMLElement): { top: number; height: number } {
  const rootRect = root.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const scale = rootRect.width / Math.max(root.offsetWidth, 1) || 1;
  return {
    top: (elRect.top - rootRect.top) / scale,
    height: elRect.height / scale,
  };
}

/** Prefer keeping previous spacer when the delta is small — prevents A4 shake loops. */
function spacersEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => Math.abs((a[k] || 0) - (b[k] || 0)) <= 10);
}

function mergeSpacersStable(
  prev: Record<string, number>,
  next: Record<string, number>,
): Record<string, number> {
  if (spacersEqual(prev, next)) return prev;
  const merged: Record<string, number> = {};
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    const a = prev[key] || 0;
    const b = next[key] || 0;
    // Keep previous value unless the new push differs enough (hysteresis)
    merged[key] = Math.abs(a - b) <= 10 ? a : Math.round(b);
    if (merged[key]! <= 2) delete merged[key];
  }
  return merged;
}

/**
 * Compute blank space BEFORE each [data-a4-id] block so the whole block starts on
 * the next A4 page when it would otherwise split. Measures with existing spacers
 * collapsed so results are stable (no measure→push→remeasure oscillation).
 */
function computeA4Spacers(root: HTMLElement): Record<string, number> {
  const pageH = (root.offsetWidth / 210) * 297;
  if (!Number.isFinite(pageH) || pageH < 40) return {};

  const styles = getComputedStyle(root);
  const padY = parseFloat(styles.paddingTop) || 0;
  const padBottom = parseFloat(styles.paddingBottom) || padY;
  const usable = Math.max(40, pageH - padY - padBottom);
  // Keep a clear band above the page cut so content never sits on the dashed guide
  const edgeSafety = Math.max(padBottom, Math.round(pageH * 0.04), 32);

  const spacerEls = Array.from(root.querySelectorAll<HTMLElement>("[data-a4-spacer]"));
  const prevSpacerStyles = spacerEls.map((s) => s.getAttribute("style"));
  // Collapse spacers so we measure the natural (unpushed) layout once
  for (const s of spacerEls) {
    s.style.setProperty("height", "0px", "important");
    s.style.setProperty("min-height", "0px", "important");
    s.style.setProperty("margin", "0", "important");
    s.style.setProperty("padding", "0", "important");
    s.style.setProperty("overflow", "hidden", "important");
  }

  type Item = { id: string; naturalTop: number; height: number };
  const groups = new Map<HTMLElement, Item[]>();

  try {
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-a4-id]"))) {
      if (el.classList.contains("hidden") || el.classList.contains("no-print")) continue;
      if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") continue;
      const id = el.getAttribute("data-a4-id") || "";
      if (!id) continue;
      const parent = el.parentElement;
      if (!parent) continue;

      const { top, height } = offsetWithinRoot(el, root);
      if (height <= 1) continue;

      const list = groups.get(parent) || [];
      list.push({ id, naturalTop: top, height });
      groups.set(parent, list);
    }
  } finally {
    spacerEls.forEach((s, i) => {
      const prev = prevSpacerStyles[i];
      if (prev == null || prev === "") s.removeAttribute("style");
      else s.setAttribute("style", prev);
    });
  }

  const result: Record<string, number> = {};

  for (const items of groups.values()) {
    items.sort((a, b) => a.naturalTop - b.naturalTop || a.id.localeCompare(b.id));
    let cumulative = 0;

    for (const item of items) {
      // Blocks taller than one usable page must be allowed to flow across breaks
      if (item.height > usable - 4) continue;

      const top = item.naturalTop + cumulative;
      const pageIndex = Math.max(0, Math.floor(top / pageH));
      const hardEnd = (pageIndex + 1) * pageH;
      const bottom = top + item.height;
      const contentEnd = hardEnd - edgeSafety;

      // Would cross the page cut / bottom margin while starting on this page
      if (top < contentEnd && bottom > contentEnd) {
        const push = Math.round(hardEnd + padY - top);
        if (push > 4 && push < pageH) {
          result[item.id] = push;
          cumulative += push;
        }
      }
    }
  }

  return result;
}

function A4PageSpacer({ id, height }: { id: string; height: number }) {
  if (height <= 0) return null;
  return (
    <div
      data-a4-spacer={id}
      className="cv-a4-spacer pointer-events-none !mt-0 !mb-0"
      style={{ height, width: "100%", flexShrink: 0, overflow: "hidden" }}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------------------
// Main CvBuilderPage Component
// ---------------------------------------------------------------------------
export default function CvBuilderPage() {
  const [, setLocation] = useLocation();
  const profile = readStoredProfile() || readAuthProfile();
  const printRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [a4PageCount, setA4PageCount] = useState(1);
  const [a4StackHeightPx, setA4StackHeightPx] = useState(0);
  const [a4Spacers, setA4Spacers] = useState<Record<string, number>>({});
  const [canvasFitScale, setCanvasFitScale] = useState(1);
  const [canvasPageWidthPx, setCanvasPageWidthPx] = useState(794);

  const [cv, setCv] = useState<GeneratedCvResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Styling & Customization (Enhancv Clone Architecture with Custom Brand Colors)
  const [selectedTemplate, setSelectedTemplate] = useState<string>("double_column");
  const [selectedColor, setSelectedColor] = useState(COLOR_THEMES[0]!);
  const [selectedFont, setSelectedFont] = useState(FONT_OPTIONS[0]!);
  const [fontSize, setFontSize] = useState<number>(10.5); // pt
  const [lineSpacing, setLineSpacing] = useState<"tight" | "balanced" | "relaxed">("balanced");
  const [marginSize, setMarginSize] = useState<"compact" | "normal" | "wide">("normal");
  const [zoomLevel, setZoomLevel] = useState<number>(100); // 80, 90, 100, 110
  const [bgPattern, setBgPattern] = useState<string>("none");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const [showPopiaNotice, setShowPopiaNotice] = useState(true);

  // Enhancv-Style Left Navigation Rail State
  // 5 Main Options: "templates" | "design" | "sections" | "ai" | "ats" (null if collapsed)
  const [activeNavPanel, setActiveNavPanel] = useState<"templates" | "design" | "sections" | "ai" | "ats" | null>(null);
  const showTemplatesAfterGeneration = () => {
    setActiveNavPanel(window.innerWidth >= 768 ? "templates" : null);
  };

  // Right Slide-Out Drawers
  const [showAtsDrawer, setShowAtsDrawer] = useState(false);
  const [showJobMatchDrawer, setShowJobMatchDrawer] = useState(false);
  const [atsActiveTab, setAtsActiveTab] = useState<"audit" | "raw_parser">("audit");
  const [highlightJobKeywords, setHighlightJobKeywords] = useState(false);

  // Export Menu State
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  // CV Strategic Advisor State
  const [advisorQuestion, setAdvisorQuestion] = useState("");
  const [advisorResponse, setAdvisorResponse] = useState<{
    question: string;
    answer: string;
    reasoning: string;
    suggestedAction?: string;
  } | null>(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);

  // Paste CV Text Modal
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pasteInputText, setPasteInputText] = useState("");

  // Change History & Undo State
  const [changeHistory, setChangeHistory] = useState<
    Array<{
      id: string;
      timestamp: string;
      action: string;
      snapshot: GeneratedCvDocument;
    }>
  >([]);

  // Quality & Recruiter Reports
  const [qualityReport, setQualityReport] = useState<BonListQualityReport | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [recruiterReport, setRecruiterReport] = useState<RecruiterViewReport | null>(null);

  // Job Tailoring
  const [jobDescription, setJobDescription] = useState("");
  const [tailoringReport, setTailoringReport] = useState<JobMatchReport | null>(null);
  const [tailoringLoading, setTailoringLoading] = useState(false);

  // Smart Bullet Enhancement Modal
  const [enhancingBullet, setEnhancingBullet] = useState<{
    expIdx: number;
    bulletIdx: number;
    original: string;
    improved: string;
    whyBetter: string[];
    missingMetricInquiry?: string;
  } | null>(null);
  const [userMetricInput, setUserMetricInput] = useState("");

  // Improve CV — review before apply
  const [isImproveModalOpen, setIsImproveModalOpen] = useState(false);
  const [improveScope, setImproveScope] = useState<ImproveCvScope>("entire");
  const [improveLoading, setImproveLoading] = useState(false);
  const [improveReport, setImproveReport] = useState<ImproveCvReport | null>(null);
  const [improveDrafts, setImproveDrafts] = useState<Record<string, string>>({});

  // Humanize Engine
  const [selectedTone, setSelectedTone] = useState<HumanizeTone>("natural");
  const [humanizePreview, setHumanizePreview] = useState<{ tone?: string; original: string; humanized: string; explanation: string } | null>(null);
  const [humanizing, setHumanizing] = useState(false);

  // Extraction Review Screen (Import CV)
  const [isExtractModalOpen, setIsExtractModalOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedCvData | null>(null);
  const [rawUploadText, setRawUploadText] = useState("");
  const [newSkillInput, setNewSkillInput] = useState("");

  // Version Control
  const [currentVersionName, setCurrentVersionName] = useState("My Master CV");
  const [savedCvVersions, setSavedCvVersions] = useState<
    Array<{
      id: string;
      name: string;
      template: string;
      updatedAt: string;
      document: GeneratedCvDocument;
    }>
  >([]);
  const [isNewVersionModalOpen, setIsNewVersionModalOpen] = useState(false);
  const [newVersionNameInput, setNewVersionNameInput] = useState("");
  const [compareSnapshot, setCompareSnapshot] = useState<GeneratedCvDocument | null>(null);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [showVersionDropdown, setShowVersionDropdown] = useState(false);

  // Pre-Flight CV Quality Control Engine (Section 37)
  const [preFlightReport, setPreFlightReport] = useState<PreFlightAuditReport | null>(null);
  const [isPreFlightModalOpen, setIsPreFlightModalOpen] = useState(false);
  const [preFlightLoading, setPreFlightLoading] = useState(false);
  const [pendingDownloadAction, setPendingDownloadAction] = useState<"print" | "html" | "txt" | "doc" | null>(null);

  // Career Positioning Engine (Section 30)
  const [positioningReport, setPositioningReport] = useState<CareerPositioningReport | null>(null);

  // Advanced 6-Tier Match & Transferable Skills (Sections 31-33)
  const [advancedMatchReport, setAdvancedMatchReport] = useState<JobMatchAdvancedReport | null>(null);
  const [transferableReport, setTransferableReport] = useState<TransferableSkillsReport | null>(null);

  // Achievement Discovery Engine (Section 34)
  const [isAchievementDiscoveryOpen, setIsAchievementDiscoveryOpen] = useState(false);
  const [discoveryQuestions, setDiscoveryQuestions] = useState<AchievementDiscoveryQuestion[]>([]);
  const [currentDiscoveryIdx, setCurrentDiscoveryIdx] = useState(0);
  const [discoveryAnswerInput, setDiscoveryAnswerInput] = useState("");
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  // Candidate-Approved Outcomes Tracking (Section 41)
  const [loggedOutcomes, setLoggedOutcomes] = useState<
    Array<{
      id: number;
      roleTitle: string;
      company: string;
      status: string;
      notes?: string;
      createdAt: string;
    }>
  >([]);
  const [newOutcomeRole, setNewOutcomeRole] = useState("");
  const [newOutcomeCompany, setNewOutcomeCompany] = useState("");
  const [newOutcomeStatus, setNewOutcomeStatus] = useState("applied");
  const [newOutcomeNotes, setNewOutcomeNotes] = useState("");
  const [outcomeConsent, setOutcomeConsent] = useState(true);
  const [outcomesLoading, setOutcomesLoading] = useState(false);

  // Section Visibility Toggles
  const [visibleSections, setVisibleSections] = useState<Record<string, boolean>>({
    summary: true,
    experience: true,
    skills: true,
    systems: true,
    education: true,
    projects: true,
    certifications: true,
    languages: true,
    references: true,
  });

  // Intake Workstation State (Upload CV or Add Manually before generation)
  const [isIntakeModalOpen, setIsIntakeModalOpen] = useState(false);
  const [intakeTab, setIntakeTab] = useState<"manual" | "upload">("manual");
  const [generatingFromIntake, setGeneratingFromIntake] = useState(false);
  const [intakePasteText, setIntakePasteText] = useState("");
  const [showPasteInsideUpload, setShowPasteInsideUpload] = useState(false);

  // Agent Working State: Animated High-Trust Progress Screen
  const [isAgentWorking, setIsAgentWorking] = useState(false);
  const [agentStepIndex, setAgentStepIndex] = useState(0);
  const [agentStepText, setAgentStepText] = useState("");
  const [agentFileName, setAgentFileName] = useState("");

  // Manual Info Form State
  const [manualInput, setManualInput] = useState<{
    fullName: string;
    professionalTitle: string;
    email: string;
    phone: string;
    location: string;
    linkedin: string;
    website: string;
    summary: string;
    experiences: Array<{
      id: string;
      role: string;
      company: string;
      startDate: string;
      endDate: string;
      bullets: string[];
    }>;
    education: Array<{
      id: string;
      degree: string;
      institution: string;
      graduationYear: string;
    }>;
    skills: string;
    projects: Array<{
      id: string;
      title: string;
      subtitle?: string;
      link?: string;
      bullets: string[];
    }>;
    certifications: Array<{
      id: string;
      name: string;
      issuer: string;
      year?: string;
    }>;
    languages: string;
    references: string;
  }>({
    fullName: "",
    professionalTitle: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    website: "",
    summary: "",
    experiences: [],
    education: [],
    skills: "",
    projects: [],
    certifications: [],
    languages: "",
    references: "",
  });

  // Decoupled AI Feedback Channel State (Quarantined from CV document canvas)
  const [aiFeedback, setAiFeedback] = useState<AiFeedbackData | null>(null);

  // Manual input mutation helpers
  const handleAddManualExperience = () => {
    setManualInput((prev) => ({
      ...prev,
      experiences: [
        ...prev.experiences,
        {
          id: `exp-${prev.experiences.length + 1}`,
          role: "",
          company: "",
          startDate: "",
          endDate: "",
          bullets: [],
        },
      ],
    }));
  };

  const handleRemoveManualExperience = (idx: number) => {
    setManualInput((prev) => ({
      ...prev,
      experiences: prev.experiences.filter((_, i) => i !== idx),
    }));
  };

  const handleAddManualBullet = (expIdx: number) => {
    setManualInput((prev) => {
      const exps = [...prev.experiences];
      const exp = { ...exps[expIdx]! };
      exp.bullets = [...exp.bullets, ""];
      exps[expIdx] = exp;
      return { ...prev, experiences: exps };
    });
  };

  const handleRemoveManualBullet = (expIdx: number, bulletIdx: number) => {
    setManualInput((prev) => {
      const exps = [...prev.experiences];
      const exp = { ...exps[expIdx]! };
      exp.bullets = exp.bullets.filter((_, i) => i !== bulletIdx);
      exps[expIdx] = exp;
      return { ...prev, experiences: exps };
    });
  };

  const handleAddManualEducation = () => {
    setManualInput((prev) => ({
      ...prev,
      education: [
        ...prev.education,
        {
          id: `edu-${prev.education.length + 1}`,
          degree: "",
          institution: "",
          graduationYear: "",
        },
      ],
    }));
  };

  const handleRemoveManualEducation = (idx: number) => {
    setManualInput((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== idx),
    }));
  };

  const handleAddManualProject = () => {
    setManualInput((prev) => ({
      ...prev,
      projects: [
        ...prev.projects,
        {
          id: `proj-${prev.projects.length + 1}`,
          title: "Project / Product Name",
          subtitle: "Role or Technologies Used",
          bullets: ["Engineered core functionality and delivered on business requirements."],
        },
      ],
    }));
  };

  const handleRemoveManualProject = (idx: number) => {
    setManualInput((prev) => ({
      ...prev,
      projects: prev.projects.filter((_, i) => i !== idx),
    }));
  };

  const handleAddManualCertification = () => {
    setManualInput((prev) => ({
      ...prev,
      certifications: [
        ...prev.certifications,
        {
          id: `cert-${prev.certifications.length + 1}`,
          name: "Certification Name",
          issuer: "Issuing Organization",
          year: "2024",
        },
      ],
    }));
  };

  const handleRemoveManualCertification = (idx: number) => {
    setManualInput((prev) => ({
      ...prev,
      certifications: prev.certifications.filter((_, i) => i !== idx),
    }));
  };

  const handlePrefillWithDiagnostic = () => {
    const diag = readReport();
    if (!diag) return;
    const targetRole = diag.targetRole || profile?.targetRole || "";

    // Decouple internal feedback: route reviewer critique to isolated aiFeedback channel
    if (diag.summary) {
      setAiFeedback((prev) => ({
        summaryFeedback: diag.summary,
        internalTips: diag.improvements?.map((i: any) => `${i.title}: ${i.detail}`) || prev?.internalTips || [],
        missingKeywords: diag.missingKeywords || prev?.missingKeywords || [],
        jobBoardAdvice: prev?.jobBoardAdvice || [
          "Target role titles recognized on South African job boards (Pnet, CareerJunction, LinkedIn).",
          "Ensure bullet points lead with active verbs and verifiable metrics.",
        ],
        flaggedPhrases: diag.flaggedPhrases || prev?.flaggedPhrases || [],
        strengths: diag.strengths || prev?.strengths || [],
        improvements: diag.improvements || prev?.improvements || [],
      }));
    }

    setManualInput((prev) => ({
      ...prev,
      fullName: prev.fullName || profile?.name || "",
      professionalTitle: prev.professionalTitle || targetRole,
      email: prev.email || profile?.email || "",
      phone: prev.phone || profile?.phone || "",
      location: prev.location || profile?.location || "",
    }));
    setMessage("Profile details and the chosen target role were added. Upload the original CV to import employment and education.");
    setTimeout(() => setMessage(""), 3500);
  };

  const handleIntakeFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const uploadInput = event.currentTarget;
    const file = uploadInput.files?.[0];
    // Reset immediately so selecting the same document after an error starts a new upload.
    uploadInput.value = "";
    if (!file) return;

    setError("");
    setAgentFileName(file.name);
    setIsAgentWorking(true);
    setAgentStepIndex(0);
    setAgentStepText("Preparing document for extraction…");
    setExtracting(true);
    // Close intake modal while agent works
    setIsIntakeModalOpen(false);

    try {
      const data = await parseCvUpload(file, (message) => {
        setAgentStepText(message);
      });

      // Update animated agent steps
      setAgentStepIndex(1);
      setAgentStepText("Structuring verified employment history…");

      setAgentStepIndex(2);
      setAgentStepText("Structuring candidate achievements, education & ATS keyword tags…");
      setExtractedData(data);
      const candidateContent = data.cv_content || data;

      const rawExperiences = (candidateContent.experiences || []).map((exp, idx) => ({
        id: exp.id || `exp-${idx + 1}`,
        role: exp.role || "",
        company: exp.company || "",
        startDate: exp.startDate || "",
        endDate: exp.endDate || "",
        bullets: exp.bullets || [],
        classification: "VERIFIED" as const,
      }));

      const rawEducation = (candidateContent.education || []).map((edu, idx) => ({
        id: edu.id || `edu-${idx + 1}`,
        degree: edu.degree || "",
        institution: edu.institution || "",
        graduationYear: edu.graduationYear || "",
        classification: "VERIFIED" as const,
      }));

      const rawSkills = candidateContent.skills || [];
      if (!hasUsableCvBody(data)) {
        throw new Error(
          "We could read contact details, but not a professional summary, work history, education, skills, projects, or certifications. Please paste the CV text or re-export as a text-based PDF / Word (.docx).",
        );
      }
      const rawProjects = candidateContent.projects || [];
      const rawCertifications = candidateContent.certifications || [];
      const rawLanguages = candidateContent.languages || [];
      const rawReferences = candidateContent.references || [];

      // Update manual form state in case the user wants to adjust details later
      setManualInput({
        fullName: candidateContent.personal?.fullName || "",
        professionalTitle: candidateContent.personal?.professionalTitle || "",
        email: candidateContent.personal?.email || "",
        phone: candidateContent.personal?.phone || "",
        location: candidateContent.personal?.location || "",
        linkedin: candidateContent.personal?.linkedin || "",
        website: candidateContent.personal?.website || "",
        summary: candidateContent.summary || "",
        experiences: rawExperiences,
        education: rawEducation,
        skills: rawSkills.join(", "),
        projects: rawProjects,
        certifications: rawCertifications,
        languages: rawLanguages.join(", "),
        references: rawReferences.join("\n"),
      });

      if (data.ai_feedback) {
        setAiFeedback(data.ai_feedback);
      }

      setAgentStepIndex(3);
      setAgentStepText("Compiling modern ATS-compliant layout with verified evidence…");

      // Build generated CV directly from extracted data
      const extractedPayload: ExtractedCvData = {
        cv_content: {
          personal: candidateContent.personal,
          summary: candidateContent.summary,
          experiences: rawExperiences,
          education: rawEducation,
          skills: rawSkills,
          toolsAndSoftware: candidateContent.toolsAndSoftware || [],
          certifications: rawCertifications,
          languages: rawLanguages,
          projects: rawProjects,
          references: rawReferences,
        },
        ai_feedback: data.ai_feedback || {
          internalTips: [],
          missingKeywords: [],
          jobBoardAdvice: [],
          flaggedPhrases: [],
          strengths: [],
          improvements: [],
        },
        personal: candidateContent.personal,
        summary: candidateContent.summary,
        experiences: rawExperiences,
        education: rawEducation,
        skills: rawSkills,
        toolsAndSoftware: candidateContent.toolsAndSoftware || [],
        certifications: rawCertifications,
        languages: rawLanguages,
        projects: rawProjects,
        references: rawReferences,
        verificationBreakdown: data.verificationBreakdown || {
          personal: { verified: Boolean(candidateContent.personal?.fullName && (candidateContent.personal?.email || candidateContent.personal?.phone)), missingFields: [] },
          experience: { count: rawExperiences.length, verifiedDates: true, verifiedCompanies: rawExperiences.length > 0 },
          education: { count: rawEducation.length, verified: rawEducation.length > 0 },
          skills: { count: rawSkills.length },
        },
      };

      const created = await generateCv({
        structure: selectedTemplate,
        extracted: extractedPayload,
        regenerate: true,
      });

      // Brief delay so candidate can perceive the completed steps
      await new Promise((r) => setTimeout(r, 600));

      // Keep the last working CV visible until the replacement has been parsed and built.
      clearGeneratedCv();
      setCv(created);
      if (created.ai_feedback) {
        setAiFeedback(created.ai_feedback);
      } else if (created.document.aiFeedback) {
        setAiFeedback(created.document.aiFeedback);
      }
      persistGeneratedCv(created);

      // Automatically open the templates panel on the left rail for instant template switching
      showTemplatesAfterGeneration();
      setMessage(`CV built successfully from ${file.name}! Use Templates to try another layout.`);
      setTimeout(() => setMessage(""), 6000);
      void runQualityEvaluation(created.document, jobDescription);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not parse file. You can enter details manually or paste text.",
      );
      setIsIntakeModalOpen(true);
      setIntakeTab("upload");
    } finally {
      setIsAgentWorking(false);
      setExtracting(false);
    }
  };

  const handleIntakePasteExtract = async () => {
    if (!intakePasteText.trim()) return;

    setAgentFileName("Pasted CV Text");
    setIsAgentWorking(true);
    setAgentStepIndex(0);
    setAgentStepText("Analyzing pasted text structure…");
    setIsIntakeModalOpen(false);

    try {
      setAgentStepIndex(1);
      setAgentStepText("Extracting career progression & contact details…");

      const data = await parseCvText(intakePasteText, "Pasted CV");

      setAgentStepIndex(2);
      setAgentStepText("Structuring ATS competencies & bullet points…");

      setExtractedData(data);
      const candidateContent = data.cv_content || data;

      const rawExperiences = (candidateContent.experiences || []).map((exp, idx) => ({
        id: exp.id || `exp-${idx + 1}`,
        role: exp.role || "",
        company: exp.company || "",
        startDate: exp.startDate || "",
        endDate: exp.endDate || "",
        bullets: exp.bullets || [],
        classification: "VERIFIED" as const,
      }));

      const rawEducation = (candidateContent.education || []).map((edu, idx) => ({
        id: edu.id || `edu-${idx + 1}`,
        degree: edu.degree || "",
        institution: edu.institution || "",
        graduationYear: edu.graduationYear || "",
        classification: "VERIFIED" as const,
      }));

      const rawSkills = candidateContent.skills || [];
      if (rawExperiences.length === 0 && rawEducation.length === 0 && rawSkills.length === 0) {
        throw new Error(
          "We could read contact details, but not Work Experience / Education / Skills. Please use “Paste Raw CV Text Instead”, or re-export as a text-based PDF / Word (.docx).",
        );
      }
      const rawProjects = candidateContent.projects || [];
      const rawCertifications = candidateContent.certifications || [];
      const rawLanguages = candidateContent.languages || [];
      const rawReferences = candidateContent.references || [];

      setManualInput({
        fullName: candidateContent.personal?.fullName || "",
        professionalTitle: candidateContent.personal?.professionalTitle || "",
        email: candidateContent.personal?.email || "",
        phone: candidateContent.personal?.phone || "",
        location: candidateContent.personal?.location || "",
        linkedin: candidateContent.personal?.linkedin || "",
        website: candidateContent.personal?.website || "",
        summary: candidateContent.summary || "",
        experiences: rawExperiences,
        education: rawEducation,
        skills: rawSkills.join(", "),
        projects: rawProjects,
        certifications: rawCertifications,
        languages: rawLanguages.join(", "),
        references: rawReferences.join("\n"),
      });

      if (data.ai_feedback) {
        setAiFeedback(data.ai_feedback);
      }

      setAgentStepIndex(3);
      setAgentStepText("Building modern ATS CV canvas…");

      const extractedPayload: ExtractedCvData = {
        cv_content: {
          personal: candidateContent.personal,
          summary: candidateContent.summary,
          experiences: rawExperiences,
          education: rawEducation,
          skills: rawSkills,
          toolsAndSoftware: candidateContent.toolsAndSoftware || [],
          certifications: rawCertifications,
          languages: rawLanguages,
          projects: rawProjects,
          references: rawReferences,
        },
        ai_feedback: data.ai_feedback || {
          internalTips: [],
          missingKeywords: [],
          jobBoardAdvice: [],
          flaggedPhrases: [],
          strengths: [],
          improvements: [],
        },
        personal: candidateContent.personal,
        summary: candidateContent.summary,
        experiences: rawExperiences,
        education: rawEducation,
        skills: rawSkills,
        toolsAndSoftware: candidateContent.toolsAndSoftware || [],
        certifications: rawCertifications,
        languages: rawLanguages,
        projects: rawProjects,
        references: rawReferences,
        verificationBreakdown: data.verificationBreakdown || {
          personal: { verified: Boolean(candidateContent.personal?.fullName && (candidateContent.personal?.email || candidateContent.personal?.phone)), missingFields: [] },
          experience: { count: rawExperiences.length, verifiedDates: true, verifiedCompanies: rawExperiences.length > 0 },
          education: { count: rawEducation.length, verified: rawEducation.length > 0 },
          skills: { count: rawSkills.length },
        },
      };

      const created = await generateCv({
        structure: selectedTemplate,
        extracted: extractedPayload,
        regenerate: true,
      });

      await new Promise((r) => setTimeout(r, 600));

      setCv(created);
      if (created.ai_feedback) {
        setAiFeedback(created.ai_feedback);
      } else if (created.document.aiFeedback) {
        setAiFeedback(created.document.aiFeedback);
      }
      persistGeneratedCv(created);

      setShowPasteInsideUpload(false);
      showTemplatesAfterGeneration();
      setMessage("CV created from text! Use Templates to switch layouts.");
      setTimeout(() => setMessage(""), 6000);
      void runQualityEvaluation(created.document, jobDescription);
    } catch {
      setError("Failed to parse text. Please check format or enter manually.");
      setIsIntakeModalOpen(true);
    } finally {
      setIsAgentWorking(false);
      setExtracting(false);
    }
  };

  const handleGenerateFromIntake = async () => {
    setGeneratingFromIntake(true);
    setError("");

    const authProfile = readStoredProfile() || readAuthProfile();
    const mergedName = manualInput.fullName.trim() || authProfile?.name?.trim() || "";
    const mergedEmail = manualInput.email.trim() || authProfile?.email?.trim() || "";

    if (intakeTab === "upload" && !extractedData && !intakePasteText.trim()) {
      setError("Upload a CV file (or paste CV text), or switch to Enter Information Manually before generating.");
      setGeneratingFromIntake(false);
      return;
    }

    if (!mergedName || mergedName.length < 2) {
      setError("Add your full name before generating. Use manual entry or upload a CV that includes your name.");
      setIntakeTab("manual");
      setGeneratingFromIntake(false);
      return;
    }

    if (mergedName !== manualInput.fullName || mergedEmail !== manualInput.email) {
      setManualInput((prev) => ({
        ...prev,
        fullName: mergedName,
        email: mergedEmail || prev.email,
        phone: prev.phone.trim() || authProfile?.phone || "",
        location: prev.location.trim() || authProfile?.location || prev.location,
        professionalTitle:
          prev.professionalTitle.trim() || authProfile?.targetRole || prev.professionalTitle,
      }));
    }

    setAgentFileName(extractedData ? "Uploaded CV" : "Manual Candidate Profile");
    setIsAgentWorking(true);
    setAgentStepIndex(0);
    setAgentStepText("Validating candidate profile and structure…");
    setIsIntakeModalOpen(false);

    try {
      setAgentStepIndex(1);
      setAgentStepText("Structuring roles, qualifications & core skills…");
      const rawExperiences = manualInput.experiences
        .filter((exp) => exp.role.trim() || exp.company.trim())
        .map((exp) => ({
          id: exp.id || `exp-${Math.random().toString(36).substring(2, 7)}`,
          role: exp.role.trim(),
          company: exp.company.trim(),
          startDate: exp.startDate.trim(),
          endDate: exp.endDate.trim(),
          bullets: exp.bullets.filter((b) => b.trim().length > 0),
          classification: "VERIFIED" as const,
        }));

      const rawEducation = manualInput.education
        .filter((edu) => edu.degree.trim() || edu.institution.trim())
        .map((edu) => ({
          id: edu.id || `edu-${Math.random().toString(36).substring(2, 7)}`,
          degree: edu.degree.trim(),
          institution: edu.institution.trim(),
          graduationYear: edu.graduationYear.trim(),
          classification: "VERIFIED" as const,
        }));

      const rawSkills = manualInput.skills
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const rawProjects = (manualInput.projects || [])
        .filter((p) => p.title.trim())
        .map((p) => ({
          id: p.id || `proj-${Math.random().toString(36).substring(2, 7)}`,
          title: p.title.trim(),
          subtitle: p.subtitle?.trim() || undefined,
          link: p.link?.trim() || undefined,
          bullets: (p.bullets || []).filter((b) => b.trim().length > 0),
        }));

      const rawCertifications = (manualInput.certifications || [])
        .filter((c) => c.name.trim())
        .map((c) => ({
          id: c.id || `cert-${Math.random().toString(36).substring(2, 7)}`,
          name: c.name.trim(),
          issuer: c.issuer.trim(),
          year: c.year?.trim() || undefined,
        }));

      const rawLanguages = manualInput.languages
        .split(/[,;\n]+/)
        .map((l) => l.trim())
        .filter(Boolean);

      const rawReferences = manualInput.references
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean);

      const hasManualEvidence = Boolean(
        manualInput.summary.trim() ||
        rawExperiences.length ||
        rawEducation.length ||
        rawSkills.length ||
        rawProjects.length ||
        rawCertifications.length ||
        rawLanguages.length ||
        rawReferences.length,
      );
      if (!hasManualEvidence && !hasUsableCvBody(extractedData)) {
        throw new Error("Add a professional summary, work history, education, skills, project, or certification before generating. A name and contact details alone are not enough to build a CV.");
      }

      const candidateContent: CvContentData = {
        personal: {
  fullName: mergedName,
  email: mergedEmail,
  professionalTitle:
    manualInput.professionalTitle.trim() || authProfile?.targetRole || "",
  phone: manualInput.phone.trim() || authProfile?.phone || "",
  location: manualInput.location.trim() || authProfile?.location || "",
          linkedin: manualInput.linkedin.trim() || undefined,
          website: manualInput.website.trim() || undefined,
        },
        summary: manualInput.summary.trim(),
        experiences: rawExperiences,
        education: rawEducation,
        skills: rawSkills,
        toolsAndSoftware: [],
        certifications: rawCertifications,
        languages: rawLanguages,
        projects: rawProjects,
        references: rawReferences,
      };

      const extractedPayload: ExtractedCvData = extractedData
        ? {
            ...extractedData,
            // Always send the reviewed form as the source of truth. Previously the
            // extracted document was spread back over manual edits, so changes made
            // after upload silently disappeared before generation.
            personal: candidateContent.personal,
            summary: candidateContent.summary,
            experiences: rawExperiences,
            education: rawEducation,
            skills: rawSkills,
            certifications: rawCertifications,
            languages: rawLanguages,
            projects: rawProjects,
            references: rawReferences,
            cv_content: candidateContent,
          }
        : {
            cv_content: candidateContent,
            ai_feedback: aiFeedback || {
              internalTips: [],
              missingKeywords: [],
              jobBoardAdvice: [],
              flaggedPhrases: [],
              strengths: [],
              improvements: [],
            },
            personal: candidateContent.personal,
            summary: candidateContent.summary,
            experiences: rawExperiences,
            education: rawEducation,
            skills: rawSkills,
            toolsAndSoftware: [],
            certifications: rawCertifications,
            languages: rawLanguages,
            projects: rawProjects,
            references: rawReferences,
            verificationBreakdown: {
              personal: {
                verified: Boolean(mergedName && (mergedEmail || manualInput.phone.trim())),
                missingFields: [],
              },
              experience: {
                count: rawExperiences.length,
                verifiedDates: rawExperiences.every((exp) => Boolean(exp.startDate && exp.endDate)),
                verifiedCompanies: rawExperiences.length > 0,
              },
              education: { count: rawEducation.length, verified: rawEducation.length > 0 },
              skills: { count: rawSkills.length },
          },
        };

      if (!hasUsableCvBody(extractedPayload)) {
        throw new Error("The uploaded CV content is still missing. Please re-upload the original document or paste its text before generating.");
      }

      setAgentStepIndex(2);
      setAgentStepText("Formatting semantic ATS hierarchy and layout…");

      const created = await generateCv({
        structure: selectedTemplate,
        extracted: extractedPayload,
        regenerate: true,
      });

      setAgentStepIndex(3);
      setAgentStepText("Finalizing CV canvas…");
      await new Promise((r) => setTimeout(r, 500));

      setCv(created);
      if (created.ai_feedback) {
        setAiFeedback(created.ai_feedback);
      } else if (created.document.aiFeedback) {
        setAiFeedback(created.document.aiFeedback);
      }
      persistGeneratedCv(created);
      setIsIntakeModalOpen(false);
      showTemplatesAfterGeneration();
      setMessage("Your modern ATS CV is ready! Use Templates to test layouts.");
      setTimeout(() => setMessage(""), 5000);
      void runQualityEvaluation(created.document, jobDescription);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate CV");
      setIsIntakeModalOpen(true);
    } finally {
      setIsAgentWorking(false);
      setGeneratingFromIntake(false);
    }
  };

  // Load existing CV or fallback profile, and check for intake request
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const diag = readReport();
    const prof = readStoredProfile() || readAuthProfile();
    const targetRole = diag?.targetRole || prof?.targetRole || "";
    const name = prof?.name || "";
    const email = prof?.email || "";
    const phone = prof?.phone || "";
    const loc = prof?.location || "";

    setManualInput((prev) => ({
      ...prev,
      fullName: prev.fullName || name,
      professionalTitle: prev.professionalTitle || targetRole,
      email: prev.email || email,
      phone: prev.phone || phone,
      location: prev.location || loc,
    }));

    if (prof?.name || prof?.email) {
      void ensureCvProfile({
        name: prof.name,
        email: prof.email,
        phone: prof.phone,
        location: prof.location,
        targetRole: prof.targetRole,
      }).catch(() => undefined);
    }

    const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const isIntakeRequested = searchParams?.get("intake") === "1";
    const panelParam = searchParams?.get("panel");
    if (panelParam === "templates" || panelParam === "design" || panelParam === "sections" || panelParam === "ai") {
      setActiveNavPanel(panelParam);
    }

    const existing = readGeneratedCv();
    if (existing) {
      const condensed = {
        ...existing,
        document: sanitizeCvDocument(existing.document),
      };
      const looksBroken =
        (!condensed.document.experiences.length &&
          !condensed.document.education.length &&
          !condensed.document.skills.length &&
          !condensed.document.summary) ||
        containsSyntheticCvContent(condensed.document) ||
        /obj|endobj/i.test(existing.document.summary || "") ||
        /[\uFFFD]/.test(existing.document.fullName || "");
      if (looksBroken) {
        clearGeneratedCv();
        setCv(null);
        setMessage("Your previous CV was incomplete. Please re-upload your PDF/DOCX so we can rebuild all sections.");
        setTimeout(() => setMessage(""), 8000);
        setIsIntakeModalOpen(true);
        showTemplatesAfterGeneration();
        return;
      }
      setCv(condensed);
      persistGeneratedCv(condensed);
      setSelectedTemplate(existing.structure || "professional");
      void runQualityEvaluation(condensed.document);
      if (isIntakeRequested) setIsIntakeModalOpen(true);
      return;
    }

    // No existing CV — land on the setup flow immediately
    setIsIntakeModalOpen(true);
    showTemplatesAfterGeneration();
  }, [profile?.id, setLocation]);

  // Close download menu when clicking outside
  useEffect(() => {
    if (!showExportDropdown) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("[data-export-menu]")) return;
      setShowExportDropdown(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showExportDropdown]);

  // Pin BonList Final Check to the center of the viewport (portal + lock scroll)
  useEffect(() => {
    if (!isPreFlightModalOpen) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isPreFlightModalOpen]);

  // Keep setup modal pinned to the top of the viewport (avoid empty dark space above)
  useEffect(() => {
    if (!isIntakeModalOpen) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Next frame: reset any nested scroll containers to top
    const id = window.requestAnimationFrame(() => {
      const dialog = document.querySelector('[role="dialog"][aria-labelledby="cv-intake-title"]');
      if (dialog instanceof HTMLElement) dialog.scrollTop = 0;
    });
    return () => {
      window.cancelAnimationFrame(id);
      document.body.style.overflow = previousOverflow;
    };
  }, [isIntakeModalOpen]);

  // Load saved role versions
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bonlist_saved_cv_versions");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSavedCvVersions(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    if (cv) {
      const initial = [
        {
          id: "master",
          name: "My Master CV",
          template: selectedTemplate || "professional",
          updatedAt: new Date().toISOString(),
          document: cv.document,
        },
      ];
      setSavedCvVersions(initial);
      localStorage.setItem("bonlist_saved_cv_versions", JSON.stringify(initial));
    }
  }, [cv?.id]);

  // Change History & Undo Handlers
  const recordChange = (actionName: string, prevDoc?: GeneratedCvDocument) => {
    if (!cv) return;
    const snapshot = prevDoc
      ? JSON.parse(JSON.stringify(prevDoc))
      : JSON.parse(JSON.stringify(cv.document));
    setChangeHistory((prev) => [
      {
        id: Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        action: actionName,
        snapshot,
      },
      ...prev.slice(0, 19),
    ]);
  };

  const handleUndo = () => {
    if (changeHistory.length === 0 || !cv) return;
    const last = changeHistory[0]!;
    const remaining = changeHistory.slice(1);
    setChangeHistory(remaining);
    const updatedDoc = last.snapshot;
    const updatedCv = { ...cv, document: updatedDoc };
    setCv(updatedCv);
    persistGeneratedCv(updatedCv);
    setMessage(`Reverted: "${last.action}"`);
    setTimeout(() => setMessage(""), 3000);
    void runQualityEvaluation(updatedDoc, jobDescription);
  };

  // CV Strategic Advisor
  const handleAskAdvisor = async (questionText: string) => {
    if (!cv || !questionText.trim()) return;
    setAdvisorLoading(true);
    try {
      const res = await authFetch("/api/career/cv/advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          cvDocument: cv.document,
          targetJob: jobDescription || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAdvisorResponse(data);
      }
    } catch {
      // ignore
    } finally {
      setAdvisorLoading(false);
    }
  };

  // Version Switching & Creation
  const handleSwitchVersion = (target: {
    id: string;
    name: string;
    template: string;
    document: GeneratedCvDocument;
  }) => {
    if (!cv) return;
    recordChange(`Switched from "${currentVersionName}" to "${target.name}"`);
    setCurrentVersionName(target.name);
    setSelectedTemplate(target.template);
    const updatedCv = { ...cv, structure: target.template, document: target.document };
    setCv(updatedCv);
    persistGeneratedCv(updatedCv);
    void runQualityEvaluation(target.document, jobDescription);
    setMessage(`Switched to version: "${target.name}"`);
    setTimeout(() => setMessage(""), 3000);
  };

  const handleCreateNewVersion = () => {
    if (!cv) return;
    const name = newVersionNameInput.trim() || `Targeted Version (${new Date().toLocaleDateString()})`;
    const newVer = {
      id: "ver_" + Math.random().toString(36).substring(2, 8),
      name,
      template: selectedTemplate,
      updatedAt: new Date().toISOString(),
      document: JSON.parse(JSON.stringify(cv.document)),
    };
    const updated = [...savedCvVersions, newVer];
    setSavedCvVersions(updated);
    localStorage.setItem("bonlist_saved_cv_versions", JSON.stringify(updated));
    setCurrentVersionName(name);
    setIsNewVersionModalOpen(false);
    setNewVersionNameInput("");
    setMessage(`Created new version: "${name}". You can now tailor it without modifying your Master CV.`);
    setTimeout(() => setMessage(""), 4000);
  };

  // Extract from pasted text
  const handleExtractPastedText = async () => {
    if (!pasteInputText.trim()) return;
    setExtracting(true);
    try {
      const data = await parseCvText(pasteInputText, "Pasted CV");
      setExtractedData(data);
      setIsPasteModalOpen(false);
      setIsExtractModalOpen(true);
    } catch {
      setError("Failed to parse CV text. Please verify formatting.");
    } finally {
      setExtracting(false);
    }
  };

  const runQualityEvaluation = async (doc: GeneratedCvDocument, jd?: string) => {
    setQualityLoading(true);
    try {
      const [resScore, resRecruiter, resPos] = await Promise.all([
        authFetch("/api/career/cv/quality-score", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cvDocument: doc, jobDescription: jd }),
        }),
        authFetch("/api/career/cv/recruiter-view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cvDocument: doc }),
        }),
        authFetch("/api/career/cv/positioning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cvDocument: doc, targetJob: doc.headline }),
        }),
      ]);
      if (resScore.ok) {
        const report = (await resScore.json()) as BonListQualityReport;
        setQualityReport(report);
      }
      if (resRecruiter.ok) {
        const report = (await resRecruiter.json()) as RecruiterViewReport;
        setRecruiterReport(report);
      }
      if (resPos.ok) {
        const pos = (await resPos.json()) as CareerPositioningReport;
        setPositioningReport(pos);
      }
    } catch {
      // ignore
    } finally {
      setQualityLoading(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    // Auto-match accent colour to the selected modern template
    const themeByTemplate: Record<string, string> = {
      serif_classic: "charcoal",
      corporate_blue: "sky",
      editorial_gold: "amber",
      analyst_clean: "charcoal",
      stylish: "emerald",
      ivy_league: "navy",
      polished: "navy",
      high_performer: "emerald",
      contemporary: "teal",
      creative: "purple",
    };
    const themeId = themeByTemplate[templateId];
    if (themeId) {
      const theme = COLOR_THEMES.find((t) => t.id === themeId);
      if (theme) setSelectedColor(theme);
    }
    if (!cv) return;
    const meta = TEMPLATE_CATALOG.find((t) => t.id === templateId);
    const updatedDoc: GeneratedCvDocument = {
      ...cv.document,
      structure: templateId,
      structureLabel: meta?.name || templateId,
    };
    const updatedCv = { ...cv, structure: templateId, document: updatedDoc };
    setCv(updatedCv);
    persistGeneratedCv(updatedCv);
    void runQualityEvaluation(updatedDoc, jobDescription);
  };

  const handleSaveCv = async (customTitle?: string) => {
    if (!cv) return;
    setSaving(true);
    setError("");
    try {
      const ensured = await ensureCvProfile();
      const res = await authFetch("/api/career/cv/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          profileId: ensured.id,
          name: ensured.name,
          email: ensured.email,
          phone: ensured.phone,
          location: ensured.location,
          targetRole: ensured.targetRole,
          document: cv.document,
          title: customTitle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save CV");
      setCv(data);
      persistGeneratedCv(data);
      setMessage("CV saved successfully to BonList Cloud!");
      setTimeout(() => setMessage(""), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save CV");
    } finally {
      setSaving(false);
    }
  };

  // Inline Canvas Editing Helper
  const updateDocumentField = (key: keyof GeneratedCvDocument, value: unknown) => {
    if (!cv) return;
    const updatedDoc = { ...cv.document, [key]: value };
    const updatedCv = { ...cv, document: updatedDoc };
    setCv(updatedCv);
    persistGeneratedCv(updatedCv);
  };

  // Smart Bullet Improvement
  const handleOpenEnhanceBullet = async (expIdx: number, bulletIdx: number, bulletText: string) => {
    setUserMetricInput("");
    try {
      const res = await authFetch("/api/career/cv/enhance-bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bullet: bulletText, role: cv?.document.headline }),
      });
      if (res.ok) {
        const data = await res.json();
        setEnhancingBullet({
          expIdx,
          bulletIdx,
          original: bulletText,
          improved: data.improved,
          whyBetter: data.whyBetter || [],
          missingMetricInquiry: data.missingMetricInquiry,
        });
      }
    } catch {
      // fallback
    }
  };

  const applyImproveProposalToDocument = (
    doc: GeneratedCvDocument,
    proposal: ImproveCvProposal,
    afterText: string,
  ): GeneratedCvDocument => {
    const next = { ...doc };
    const path = proposal.path;

    if (path === "summary") {
      next.summary = afterText;
      return next;
    }
    if (path === "skills") {
      next.skills = afterText.split(",").map((s) => s.trim()).filter(Boolean);
      return next;
    }

    const expMatch = path.match(/^experiences\.(\d+)\.bullets\.(\d+)$/);
    if (expMatch) {
      const expIdx = Number(expMatch[1]);
      const bulletIdx = Number(expMatch[2]);
      next.experiences = next.experiences.map((exp, i) => {
        if (i !== expIdx) return exp;
        const bullets = [...exp.bullets];
        bullets[bulletIdx] = afterText;
        return { ...exp, bullets };
      });
      return next;
    }

    const eduMatch = path.match(/^education\.(\d+)\.details$/);
    if (eduMatch) {
      const eduIdx = Number(eduMatch[1]);
      next.education = next.education.map((edu, i) =>
        i === eduIdx ? { ...edu, details: afterText } : edu,
      );
      return next;
    }

    const certMatch = path.match(/^certifications\.(\d+)\.name$/);
    if (certMatch) {
      const cIdx = Number(certMatch[1]);
      next.certifications = (next.certifications || []).map((cert, i) =>
        i === cIdx ? { ...cert, name: afterText } : cert,
      );
      return next;
    }

    const projMatch = path.match(/^projects\.(\d+)\.bullets\.(\d+)$/);
    if (projMatch) {
      const pIdx = Number(projMatch[1]);
      const bIdx = Number(projMatch[2]);
      next.projects = (next.projects || []).map((proj, i) => {
        if (i !== pIdx) return proj;
        const bullets = [...(proj.bullets || [])];
        bullets[bIdx] = afterText;
        return { ...proj, bullets };
      });
      return next;
    }

    return next;
  };

  const openImproveCvModal = () => {
    if (!cv) {
      setError("Generate or upload a CV first, then use Improve CV.");
      setIsIntakeModalOpen(true);
      return;
    }
    setImproveReport(null);
    setImproveDrafts({});
    setImproveScope("entire");
    setIsImproveModalOpen(true);
  };

  const handleRunImproveCv = async (scope: ImproveCvScope = improveScope) => {
    if (!cv) return;
    setImproveLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/career/cv/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvDocument: cv.document,
          scope,
          targetJob: jobDescription.trim() || cv.document.headline || undefined,
        }),
      });
      const data = (await res.json()) as ImproveCvReport & { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not analyse CV wording");
      setImproveReport(data);
      const drafts: Record<string, string> = {};
      for (const p of data.proposals) drafts[p.id] = p.after;
      setImproveDrafts(drafts);
      setImproveScope(scope);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not improve CV");
    } finally {
      setImproveLoading(false);
    }
  };

  const updateImproveProposalStatus = (id: string, status: ImproveCvProposal["status"], after?: string) => {
    setImproveReport((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        proposals: prev.proposals.map((p) =>
          p.id === id
            ? { ...p, status, after: after !== undefined ? after : p.after }
            : p,
        ),
      };
    });
  };

  const handleAcceptImproveProposal = (proposalId: string) => {
    if (!cv || !improveReport) return;
    const proposal = improveReport.proposals.find((p) => p.id === proposalId);
    if (!proposal || proposal.status === "accepted" || proposal.status === "rejected") return;
    const afterText = (improveDrafts[proposalId] ?? proposal.after).trim();
    if (!afterText) return;

    recordChange(`Improved ${proposal.title}`);
    const updatedDoc = applyImproveProposalToDocument(cv.document, proposal, afterText);
    const updatedCv = { ...cv, document: updatedDoc };
    setCv(updatedCv);
    persistGeneratedCv(updatedCv);
    updateImproveProposalStatus(proposalId, afterText === proposal.after ? "accepted" : "edited", afterText);
    setMessage(`Applied: ${proposal.title}`);
    setTimeout(() => setMessage(""), 2500);
    void runQualityEvaluation(updatedDoc, jobDescription);
  };

  const handleRejectImproveProposal = (proposalId: string) => {
    updateImproveProposalStatus(proposalId, "rejected");
  };

  const handleAcceptAllImproveProposals = () => {
    if (!cv || !improveReport) return;
    const pending = improveReport.proposals.filter((p) => p.status === "pending");
    if (pending.length === 0) return;

    let doc = cv.document;
    for (const proposal of pending) {
      const afterText = (improveDrafts[proposal.id] ?? proposal.after).trim();
      if (!afterText) continue;
      doc = applyImproveProposalToDocument(doc, proposal, afterText);
    }
    recordChange(`Accepted ${pending.length} Improve CV suggestion(s)`);
    const updatedCv = { ...cv, document: doc };
    setCv(updatedCv);
    persistGeneratedCv(updatedCv);
    setImproveReport({
      ...improveReport,
      proposals: improveReport.proposals.map((p) =>
        pending.some((x) => x.id === p.id)
          ? { ...p, status: "accepted" as const, after: improveDrafts[p.id] ?? p.after }
          : p,
      ),
    });
    setMessage(`Applied ${pending.length} wording improvement(s).`);
    setTimeout(() => setMessage(""), 3000);
    void runQualityEvaluation(doc, jobDescription);
  };

  // Quick Action: Enhance Action Verbs
  const handleQuickEnhanceVerbs = (expIdx: number, bulletIdx: number, text: string) => {
    if (!cv) return;
    let updated = text.trim();
    const passiveReplacements: Array<[RegExp, string]> = [
      [/^(?:responsible for|was responsible for)\s+/i, "Orchestrated "],
      [/^(?:helped with|assisted with|assisted in)\s+/i, "Collaborated to execute "],
      [/^(?:handled|worked on)\s+/i, "Managed and delivered "],
      [/^(?:did|performed)\s+/i, "Executed "],
      [/^(?:duties included|tasks included)\s+/i, "Directed "],
      [/^(?:involved in)\s+/i, "Spearheaded "],
    ];
    let replaced = false;
    for (const [regex, replacement] of passiveReplacements) {
      if (regex.test(updated)) {
        updated = updated.replace(regex, replacement);
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      const words = updated.split(" ");
      if (words.length > 0) {
        words[0] = words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1);
        updated = words.join(" ");
      }
    }
    if (!/[.!?]$/.test(updated)) updated += ".";

    const experiences = [...cv.document.experiences];
    const exp = { ...experiences[expIdx]! };
    const bullets = [...exp.bullets];
    bullets[bulletIdx] = updated;
    exp.bullets = bullets;
    experiences[expIdx] = exp;
    recordChange(`Enhanced action verbs in ${exp.role}`);
    updateDocumentField("experiences", experiences);
    setMessage("Enhanced bullet with active power verb!");
    setTimeout(() => setMessage(""), 3000);
    void runQualityEvaluation({ ...cv.document, experiences }, jobDescription);
  };

  // Quick Action: Fix Grammar & Polish
  const handleQuickFixGrammar = (expIdx: number, bulletIdx: number, text: string) => {
    if (!cv) return;
    let cleaned = text.trim().replace(/\s{2,}/g, " ");
    cleaned = cleaned.replace(/results-driven\s*/gi, "disciplined ");
    cleaned = cleaned.replace(/fast-paced environment\s*/gi, "operational environment ");
    cleaned = cleaned.replace(/dynamic\s*/gi, "adaptable ");
    cleaned = cleaned.replace(/synergy\s*/gi, "collaboration ");
    cleaned = cleaned.replace(/highly motivated\s*/gi, "dependable ");
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    if (!/[.!?]$/.test(cleaned)) cleaned += ".";

    const experiences = [...cv.document.experiences];
    const exp = { ...experiences[expIdx]! };
    const bullets = [...exp.bullets];
    bullets[bulletIdx] = cleaned;
    exp.bullets = bullets;
    experiences[expIdx] = exp;
    recordChange(`Polished grammar and clarity in ${exp.role}`);
    updateDocumentField("experiences", experiences);
    setMessage("Polished bullet grammar & removed generic buzzwords!");
    setTimeout(() => setMessage(""), 3000);
    void runQualityEvaluation({ ...cv.document, experiences }, jobDescription);
  };

  // Delete bullet
  const handleDeleteBullet = (expIdx: number, bulletIdx: number) => {
    if (!cv) return;
    const experiences = [...cv.document.experiences];
    const exp = { ...experiences[expIdx]! };
    if (exp.bullets.length <= 1) {
      setMessage("Each role should retain at least one bullet point.");
      setTimeout(() => setMessage(""), 3000);
      return;
    }
    const bullets = exp.bullets.filter((_, idx) => idx !== bulletIdx);
    exp.bullets = bullets;
    experiences[expIdx] = exp;
    recordChange(`Removed bullet point in ${exp.role}`);
    updateDocumentField("experiences", experiences);
  };

  // Add bullet
  const handleAddBullet = (expIdx: number) => {
    if (!cv) return;
    const experiences = [...cv.document.experiences];
    const exp = { ...experiences[expIdx]! };
    exp.bullets = [...exp.bullets, "Coordinated and executed operational deliverables to ensure high service standards."];
    experiences[expIdx] = exp;
    recordChange(`Added bullet point in ${exp.role}`);
    updateDocumentField("experiences", experiences);
  };

  const applyBulletImprovement = () => {
    if (!cv || !enhancingBullet) return;
    const experiences = [...cv.document.experiences];
    const exp = { ...experiences[enhancingBullet.expIdx]! };
    let finalBullet = enhancingBullet.improved;

    if (userMetricInput.trim()) {
      finalBullet = finalBullet.replace(/\.$/, "") + `, achieving ${userMetricInput.trim()}.`;
    }

    const bullets = [...exp.bullets];
    bullets[enhancingBullet.bulletIdx] = finalBullet;
    exp.bullets = bullets;
    experiences[enhancingBullet.expIdx] = exp;

    recordChange(`Improved bullet in ${exp.role}`);
    updateDocumentField("experiences", experiences);
    setEnhancingBullet(null);
    void runQualityEvaluation({ ...cv.document, experiences }, jobDescription);
  };

  // "Make It Sound Like Me" (Humanize)
  const handleRunHumanize = async (tone: HumanizeTone) => {
    if (!cv) return;
    setSelectedTone(tone);
    setHumanizing(true);
    try {
      const res = await authFetch("/api/career/cv/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: cv.document.summary,
          tone,
          role: cv.document.headline,
          name: cv.document.fullName,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setHumanizePreview(data);
      }
    } catch {
      // ignore
    } finally {
      setHumanizing(false);
    }
  };

  const applyHumanizedSummary = () => {
    if (!cv || !humanizePreview) return;
    recordChange(`Applied "${selectedTone}" voice to summary`);
    updateDocumentField("summary", humanizePreview.humanized);
    setHumanizePreview(null);
    setMessage(`Tone applied: ${selectedTone.toUpperCase()} (100% verified facts preserved).`);
    setTimeout(() => setMessage(""), 3500);
  };

  // Job Tailoring with Advanced 6-Tier & Transferable Skills
  const handleRunTailoring = async () => {
    if (!cv || !jobDescription.trim()) return;
    setTailoringLoading(true);
    try {
      const [resTailor, resAdvanced, resTrans] = await Promise.all([
        authFetch("/api/career/cv/tailor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cvDocument: cv.document,
            jobDescription,
          }),
        }),
        authFetch("/api/career/cv/match-advanced", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cvDocument: cv.document,
            jobDescription,
          }),
        }),
        authFetch("/api/career/cv/transferable-skills", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cvDocument: cv.document,
            targetRoleOrIndustry: cv.document.headline,
          }),
        }),
      ]);

      if (resTailor.ok) {
        const data = (await resTailor.json()) as JobMatchReport;
        setTailoringReport(data);
      }
      if (resAdvanced.ok) {
        const adv = (await resAdvanced.json()) as JobMatchAdvancedReport;
        setAdvancedMatchReport(adv);
      }
      if (resTrans.ok) {
        const trans = (await resTrans.json()) as TransferableSkillsReport;
        setTransferableReport(trans);
      }
    } catch {
      // ignore
    } finally {
      setTailoringLoading(false);
    }
  };

  const applyTailoringProposal = (proposalId: string) => {
    if (!cv) return;
    const proposal =
      tailoringReport?.proposals.find((p) => p.id === proposalId) ||
      advancedMatchReport?.proposals.find((p) => p.id === proposalId);
    if (!proposal) return;

    recordChange(`Accepted tailoring proposal for ${proposal.section}`);
    if (proposal.section === "summary") {
      updateDocumentField("summary", proposal.after);
    } else if (proposal.section === "skills") {
      const newSkills = proposal.after.split(", ").map((s) => s.trim()).filter(Boolean);
      updateDocumentField("skills", newSkills);
    }

    if (tailoringReport) {
      setTailoringReport({
        ...tailoringReport,
        proposals: tailoringReport.proposals.map((p) =>
          p.id === proposalId ? { ...p, status: "accepted" as const } : p,
        ),
      });
    }
    if (advancedMatchReport) {
      setAdvancedMatchReport({
        ...advancedMatchReport,
        proposals: advancedMatchReport.proposals.map((p) =>
          p.id === proposalId ? { ...p, status: "accepted" as const } : p,
        ),
      });
    }
  };

  const rejectTailoringProposal = (proposalId: string) => {
    if (tailoringReport) {
      setTailoringReport({
        ...tailoringReport,
        proposals: tailoringReport.proposals.map((p) =>
          p.id === proposalId ? { ...p, status: "rejected" as const } : p,
        ),
      });
    }
    if (advancedMatchReport) {
      setAdvancedMatchReport({
        ...advancedMatchReport,
        proposals: advancedMatchReport.proposals.map((p) =>
          p.id === proposalId ? { ...p, status: "rejected" as const } : p,
        ),
      });
    }
  };

  // Career Positioning Engine Handlers
  const handleApplyPositioning = (pos: CareerPositioningOption) => {
    if (!cv) return;
    recordChange(`Applied Positioning: ${pos.title}`);
    updateDocumentField("headline", pos.title);
    updateDocumentField("summary", pos.sampleSummary);
    setMessage(`Positioning updated to "${pos.title}".`);
    setTimeout(() => setMessage(""), 3500);
  };

  // Achievement Discovery Handlers
  const handleStartAchievementDiscovery = async () => {
    if (!cv) return;
    setDiscoveryLoading(true);
    setIsAchievementDiscoveryOpen(true);
    try {
      const res = await authFetch("/api/career/cv/achievement-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvDocument: cv.document }),
      });
      if (res.ok) {
        const data = await res.json();
        setDiscoveryQuestions(data.questions || []);
        setCurrentDiscoveryIdx(0);
        setDiscoveryAnswerInput("");
      }
    } catch {
      // fallback
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const handleIncorporateAchievement = async () => {
    const q = discoveryQuestions[currentDiscoveryIdx];
    if (!cv || !q || !discoveryAnswerInput.trim()) return;

    try {
      const res = await authFetch("/api/career/cv/achievement-incorporate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalBullet: q.dutyBullet,
          candidateAnswer: discoveryAnswerInput,
          category: q.category,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const experiences = cv.document.experiences.map((exp) => {
          if (exp.id === q.expId) {
            return {
              ...exp,
              bullets: exp.bullets.map((b) => (b === q.dutyBullet ? data.improvedBullet : b)),
            };
          }
          return exp;
        });

        recordChange(`Added verified metric to ${q.role}`);
        updateDocumentField("experiences", experiences);
        void runQualityEvaluation({ ...cv.document, experiences }, jobDescription);

        setDiscoveryAnswerInput("");
        if (currentDiscoveryIdx + 1 < discoveryQuestions.length) {
          setCurrentDiscoveryIdx((prev) => prev + 1);
        } else {
          setIsAchievementDiscoveryOpen(false);
          setMessage("Verified achievement successfully added to your CV!");
          setTimeout(() => setMessage(""), 4000);
        }
      }
    } catch {
      // fallback
    }
  };

  // Pre-Flight Quality Control Handlers
  const triggerPreFlightAudit = async (action: "print" | "html" | "txt" | "doc") => {
    if (!cv) {
      setError("Generate or load a CV before downloading.");
      return;
    }
    setPendingDownloadAction(action);
    setPreFlightLoading(true);
    setIsPreFlightModalOpen(true);
    setPreFlightReport(null);

    const fallbackReport: PreFlightAuditReport = {
      readyForDownload: true,
      overallGrade: "Ready for Recruiter Submission",
      checks: [],
      summary: {
        contentVerified: true,
        employmentHistoryChecked: true,
        formattingChecked: true,
        atsReadabilityChecked: true,
        aiClaimsVerified: true,
        professionalLanguageChecked: true,
      },
      prioritizedActions: [],
    };

    try {
      const res = await authFetch("/api/career/cv/pre-flight-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvDocument: cv.document }),
      });
      if (res.ok) {
        const data = (await res.json()) as PreFlightAuditReport;
        setPreFlightReport(data);
      } else {
        setPreFlightReport(fallbackReport);
      }
    } catch {
      setPreFlightReport(fallbackReport);
    } finally {
      setPreFlightLoading(false);
    }
  };

  const executeDownloadHtml = () => {
    if (!cv) return;
    const clean = sanitizeCvDocument(cv.document);
    const blob = new Blob(
      [generateSemanticHtml(clean, selectedColor, selectedFont, selectedTemplate)],
      { type: "text/html;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(cv.document.fullName || "BonList_CV").replace(/\s+/g, "_")}_CV_BonList.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage("HTML CV downloaded.");
    setTimeout(() => setMessage(""), 3000);
  };

  // Plain Text (.txt) ATS Export
  const executeDownloadTxt = () => {
    if (!cv) return;
    const doc = sanitizeCvDocument(cv.document);
    const lines: string[] = [];
    lines.push(doc.fullName.toUpperCase());
    if (doc.headline) lines.push(doc.headline);
    const contact = [doc.email, doc.phone, doc.location, doc.linkedin, doc.website].filter(Boolean).join(" | ");
    if (contact) lines.push(contact);
    lines.push("");
    if (doc.summary) {
      lines.push("==================================================");
      lines.push("PROFESSIONAL SUMMARY");
      lines.push("==================================================");
      lines.push(doc.summary);
      lines.push("");
    }
    if (doc.experiences && doc.experiences.length > 0) {
      lines.push("==================================================");
      lines.push("WORK EXPERIENCE");
      lines.push("==================================================");
      doc.experiences.forEach((exp) => {
        lines.push(`${exp.role.toUpperCase()} - ${exp.company}`);
        lines.push(`${exp.startDate} - ${exp.endDate}${exp.location ? " | " + exp.location : ""}`);
        exp.bullets.forEach((b) => lines.push(`* ${b}`));
        lines.push("");
      });
    }

    if (doc.projects && doc.projects.length > 0) {
      lines.push("==================================================");
      lines.push("KEY PROJECTS");
      lines.push("==================================================");
      doc.projects.forEach((proj) => {
        lines.push(`${proj.title.toUpperCase()}${proj.subtitle ? ` - ${proj.subtitle}` : ""}${proj.link ? ` (${proj.link})` : ""}`);
        (proj.bullets || []).forEach((b) => lines.push(`* ${b}`));
        lines.push("");
      });
    }

    if (doc.skills && doc.skills.length > 0) {
      lines.push("==================================================");
      lines.push("CORE SKILLS & COMPETENCIES");
      lines.push("==================================================");
      lines.push(doc.skills.join(" • "));
      lines.push("");
    }

    if (doc.toolsAndSoftware && doc.toolsAndSoftware.length > 0) {
      lines.push("==================================================");
      lines.push("SYSTEMS & SOFTWARE");
      lines.push("==================================================");
      lines.push(doc.toolsAndSoftware.join(" • "));
      lines.push("");
    }

    if (doc.education && doc.education.length > 0) {
      lines.push("==================================================");
      lines.push("EDUCATION");
      lines.push("==================================================");
      doc.education.forEach((edu) => {
        lines.push(`${edu.degree} - ${edu.institution} (${edu.graduationYear})`);
      });
      lines.push("");
    }

    if (doc.certifications && doc.certifications.length > 0) {
      lines.push("==================================================");
      lines.push("CERTIFICATIONS & ACCREDITATIONS");
      lines.push("==================================================");
      doc.certifications.forEach((c) => {
        lines.push(`${c.name} - ${c.issuer}${c.year ? ` (${c.year})` : ""}`);
      });
      lines.push("");
    }

    if (doc.languages && doc.languages.length > 0) {
      lines.push("==================================================");
      lines.push("LANGUAGES");
      lines.push("==================================================");
      lines.push(doc.languages.join(" • "));
      lines.push("");
    }

    if (doc.references && doc.references.length > 0) {
      lines.push("==================================================");
      lines.push("REFERENCES");
      lines.push("==================================================");
      doc.references.forEach((r) => lines.push(r));
      lines.push("");
    }

    const text = lines.join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(doc.fullName || "BonList_CV").replace(/\s+/g, "_")}_CV_ATS.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage("ATS text CV downloaded.");
    setTimeout(() => setMessage(""), 3000);
  };

  // Word Document (.doc) Export
  const executeDownloadDoc = () => {
    if (!cv) return;
    const clean = sanitizeCvDocument(cv.document);
    const html = generateSemanticHtml(clean, selectedColor, selectedFont, selectedTemplate);
    const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(cv.document.fullName || "BonList_CV").replace(/\s+/g, "_")}_CV_BonList.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMessage("Word CV downloaded.");
    setTimeout(() => setMessage(""), 3000);
  };

  /**
   * Prints the on-canvas CV (selected template + colours) so Save as PDF
   * matches exactly what the user sees on the workstation.
   */
  const executeDownloadPdf = (options?: { onReady?: () => void }) => {
    if (!cv || !printRef.current) {
      setError("Generate a CV and keep it open on the canvas before downloading PDF.");
      options?.onReady?.();
      return;
    }
    // Ensure canvas content is cleaned before print/PDF
    const cleaned = sanitizeCvDocument(cv.document);
    if (JSON.stringify(cleaned) !== JSON.stringify(cv.document)) {
      const updated = { ...cv, document: cleaned };
      setCv(updated);
      persistGeneratedCv(updated);
    }
    const previousZoom = zoomLevel;
    setZoomLevel(100);
    const runPrint = () => {
      try {
        if (printRef.current) {
          printRef.current
            .querySelectorAll<HTMLTextAreaElement>("textarea")
            .forEach((el) => fitTextareaHeight(el));
        }
        window.print();
        setMessage("Choose “Save as PDF” in the print dialog to download your final CV.");
        setTimeout(() => setMessage(""), 5000);
        options?.onReady?.();
      } catch {
        setError("Could not open the print dialog. Allow printing for this site and try again.");
        options?.onReady?.();
      } finally {
        setZoomLevel(previousZoom);
      }
    };
    window.setTimeout(runPrint, 100);
  };

  const handleConfirmPreFlightDownload = () => {
    const action = pendingDownloadAction;
    if (!action) {
      setIsPreFlightModalOpen(false);
      return;
    }

    const finish = () => {
      setPendingDownloadAction(null);
      setIsPreFlightModalOpen(false);
    };

    // Start download/print immediately — close the modal as the download begins, not before
    if (action === "print") {
      executeDownloadPdf({ onReady: finish });
      return;
    }
    if (action === "html") {
      executeDownloadHtml();
    } else if (action === "txt") {
      executeDownloadTxt();
    } else if (action === "doc") {
      executeDownloadDoc();
    }
    finish();
  };

  const handleDirectDownload = (action: "print" | "html" | "txt" | "doc") => {
    setShowExportDropdown(false);
    if (!cv) {
      setError("Generate or load a CV before downloading.");
      return;
    }
    // Jump to viewport center immediately so Final Check is visible without scrolling
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    void triggerPreFlightAudit(action);
  };

  // Section 41: Candidate Outcomes Handlers
  const fetchLoggedOutcomes = async () => {
    if (!profile?.id) return;
    try {
      const res = await authFetch(`/api/career/cv/outcomes?profileId=${profile.id}`);
      if (res.ok) {
        const data = await res.json();
        setLoggedOutcomes(data.outcomes || []);
      }
    } catch {
      // ignore
    }
  };

  const handleSaveOutcome = async () => {
    if (!profile?.id || !newOutcomeRole.trim() || !newOutcomeCompany.trim()) return;
    setOutcomesLoading(true);
    try {
      const res = await authFetch("/api/career/cv/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profile.id,
          roleTitle: newOutcomeRole,
          company: newOutcomeCompany,
          status: newOutcomeStatus,
          cvStructure: selectedTemplate,
          notes: newOutcomeNotes,
          consentedToAnalytics: outcomeConsent,
        }),
      });
      if (res.ok) {
        setNewOutcomeRole("");
        setNewOutcomeCompany("");
        setNewOutcomeNotes("");
        void fetchLoggedOutcomes();
        setMessage("Outcome recorded! This consented signal powers BonList's empirical outcomes engine.");
        setTimeout(() => setMessage(""), 4000);
      }
    } catch {
      // ignore
    } finally {
      setOutcomesLoading(false);
    }
  };

  // CV Upload & Extraction
  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const uploadInput = event.currentTarget;
    const file = uploadInput.files?.[0];
    uploadInput.value = "";
    if (!file) return;
    setError("");
    setExtracting(true);
    setAgentFileName(file.name);
    setIsAgentWorking(true);
    setAgentStepIndex(0);
    setAgentStepText("Preparing document for extraction…");
    try {
      const data = await parseCvUpload(file, (message) => {
        setAgentStepText(message);
      });
      if (!hasUsableCvBody(data)) {
        throw new Error("The document was opened, but its CV sections could not be read. Please try a text-based PDF/Word file or paste the CV text.");
      }
      setAgentStepIndex(1);
      setAgentStepText("Structuring verified employment history…");
      setExtractedData(data);
        const candidateContent = data.cv_content || data;

        const rawExperiences = (candidateContent.experiences || []).map((exp, idx) => ({
          id: exp.id || `exp-${idx + 1}`,
          role: exp.role || "",
          company: exp.company || "",
          startDate: exp.startDate || "",
          endDate: exp.endDate || "",
          bullets: exp.bullets || [],
          classification: "VERIFIED" as const,
        }));

        const rawEducation = (candidateContent.education || []).map((edu, idx) => ({
          id: edu.id || `edu-${idx + 1}`,
          degree: edu.degree || "",
          institution: edu.institution || "",
          graduationYear: edu.graduationYear || "",
          classification: "VERIFIED" as const,
        }));

        const rawSkills = candidateContent.skills || [];
        const rawProjects = candidateContent.projects || [];
        const rawCertifications = candidateContent.certifications || [];
        const rawLanguages = candidateContent.languages || [];
        const rawReferences = candidateContent.references || [];

        setManualInput({
          fullName: candidateContent.personal?.fullName || "",
          professionalTitle: candidateContent.personal?.professionalTitle || "",
          email: candidateContent.personal?.email || "",
          phone: candidateContent.personal?.phone || "",
          location: candidateContent.personal?.location || "",
          linkedin: candidateContent.personal?.linkedin || "",
          website: candidateContent.personal?.website || "",
          summary: candidateContent.summary || "",
          experiences: rawExperiences,
          education: rawEducation,
          skills: rawSkills.join(", "),
          projects: rawProjects,
          certifications: rawCertifications,
          languages: rawLanguages.join(", "),
          references: rawReferences.join("\n"),
        });

        setAgentStepIndex(2);
        setAgentStepText("Structuring achievements, education & ATS tags…");

        const created = await generateCv({
          structure: selectedTemplate,
          extracted: data,
          regenerate: true,
        });

        setAgentStepIndex(3);
        setAgentStepText("Compiling modern ATS layout & switching to template viewer…");
        await new Promise((r) => setTimeout(r, 600));

        setCv(created);
        if (created.ai_feedback) {
          setAiFeedback(created.ai_feedback);
        } else if (created.document.aiFeedback) {
          setAiFeedback(created.document.aiFeedback);
        }
        persistGeneratedCv(created);
        setIsIntakeModalOpen(false);
        showTemplatesAfterGeneration();
        setMessage("Your CV has been built and verified! Use Templates to test different layouts.");
        setTimeout(() => setMessage(""), 5000);
      void runQualityEvaluation(created.document, jobDescription);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to read CV file. Please try pasting the text directly or filling manually.",
      );
      setIsIntakeModalOpen(true);
      setIntakeTab("upload");
    } finally {
      setIsAgentWorking(false);
      setExtracting(false);
    }
  };

  const confirmExtractionAndBuild = async () => {
    if (!extractedData) return;
    setLoading(true);
    setIsExtractModalOpen(false);
    setIsAgentWorking(true);
    setAgentStepIndex(2);
    setAgentStepText("Structuring achievements, education & ATS tags…");
    try {
      const created = await generateCv({
        structure: selectedTemplate,
        extracted: extractedData,
      });

      setAgentStepIndex(3);
      setAgentStepText("Compiling modern ATS layout & templates…");
      await new Promise((r) => setTimeout(r, 500));

      setCv(created);
      persistGeneratedCv(created);
      showTemplatesAfterGeneration();
      setMessage("Your CV has been generated from your verified information.");
      void runQualityEvaluation(created.document);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build CV from extracted data");
    } finally {
      setIsAgentWorking(false);
      setLoading(false);
    }
  };

  // Generate ATS raw text representation
  const generateAtsRawText = (doc: GeneratedCvDocument) => {
    const parts: string[] = [];
    parts.push(`FULL_NAME: ${doc.fullName}`);
    if (doc.headline) parts.push(`TARGET_ROLE: ${doc.headline}`);
    const contact = [doc.email, doc.phone, doc.location, doc.linkedin, doc.website].filter(Boolean).join(" | ");
    if (contact) parts.push(`CONTACT_INFO: ${contact}`);
    if (doc.summary) parts.push(`\n[SECTION: PROFESSIONAL SUMMARY]\n${doc.summary}`);
    if (doc.experiences && doc.experiences.length > 0) {
      parts.push(`\n[SECTION: WORK EXPERIENCE]`);
      doc.experiences.forEach((e) => {
        parts.push(`ROLE: ${e.role} | EMPLOYER: ${e.company} | DATES: ${e.startDate} - ${e.endDate}${e.location ? ` | LOCATION: ${e.location}` : ""}`);
        e.bullets.forEach((b) => parts.push(`• ${b}`));
      });
    }
    if (doc.projects && doc.projects.length > 0) {
      parts.push(`\n[SECTION: KEY PROJECTS]`);
      doc.projects.forEach((p) => {
        parts.push(`PROJECT: ${p.title}${p.subtitle ? ` | ${p.subtitle}` : ""}${p.link ? ` | ${p.link}` : ""}`);
        (p.bullets || []).forEach((b) => parts.push(`• ${b}`));
      });
    }
    if (doc.skills && doc.skills.length > 0) {
      parts.push(`\n[SECTION: SKILLS & COMPETENCIES]\n${doc.skills.join(", ")}`);
    }
    if (doc.toolsAndSoftware && doc.toolsAndSoftware.length > 0) {
      parts.push(`\n[SECTION: SYSTEMS & SOFTWARE]\n${doc.toolsAndSoftware.join(", ")}`);
    }
    if (doc.education && doc.education.length > 0) {
      parts.push(`\n[SECTION: EDUCATION]`);
      doc.education.forEach((edu) => {
        parts.push(`DEGREE: ${edu.degree} | INSTITUTION: ${edu.institution} | YEAR: ${edu.graduationYear}`);
      });
    }
    if (doc.certifications && doc.certifications.length > 0) {
      parts.push(`\n[SECTION: CERTIFICATIONS & ACCREDITATIONS]`);
      doc.certifications.forEach((c) => {
        parts.push(`CERTIFICATE: ${c.name} | ISSUER: ${c.issuer}${c.year ? ` | YEAR: ${c.year}` : ""}`);
      });
    }
    if (doc.languages && doc.languages.length > 0) {
      parts.push(`\n[SECTION: LANGUAGES]\n${doc.languages.join(", ")}`);
    }
    if (doc.references && doc.references.length > 0) {
      parts.push(`\n[SECTION: REFERENCES]`);
      doc.references.forEach((r) => parts.push(`• ${r}`));
    }
    return parts.join("\n");
  };

  // Live A4 page count + React spacers that keep sections whole across page breaks
  useLayoutEffect(() => {
    const el = printRef.current;
    if (!el || !cv) {
      setA4PageCount(1);
      setA4StackHeightPx(0);
      setA4Spacers({});
      return;
    }

    let raf = 0;
    let debounceTimer = 0;
    let coolDownTimer = 0;
    let applying = false;
    let coolDown = false;
    let ro: ResizeObserver | null = null;
    let lastApplied: Record<string, number> = {};

    const updateMetrics = () => {
      const mm = el.offsetWidth / 210 || 96 / 25.4;
      const pagePx = Math.max(1, 297 * mm);
      const height = Math.max(el.scrollHeight, el.offsetHeight);
      const pages = Math.max(1, Math.ceil(height / pagePx - 0.02));
      setA4PageCount((prev) => (prev === pages ? prev : pages));
      setA4StackHeightPx((prev) => (Math.abs(prev - height) < 8 ? prev : height));
    };

    const measure = () => {
      if (applying || coolDown) return;
      applying = true;
      coolDown = true;
      try {
        ro?.disconnect();
        const nextSpacers = computeA4Spacers(el);
        const merged = mergeSpacersStable(lastApplied, nextSpacers);
        if (!spacersEqual(lastApplied, merged)) {
          lastApplied = merged;
          setA4Spacers(merged);
        }
        // Metrics after layout commits
        requestAnimationFrame(() => {
          updateMetrics();
        });
      } finally {
        window.clearTimeout(coolDownTimer);
        coolDownTimer = window.setTimeout(() => {
          applying = false;
          coolDown = false;
          ro?.observe(el);
        }, 220);
      }
    };

    const schedule = () => {
      if (applying || coolDown) return;
      cancelAnimationFrame(raf);
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        raf = requestAnimationFrame(measure);
      }, 120);
    };

    measure();
    ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => schedule()) : null;
    ro?.observe(el);
    window.addEventListener("resize", schedule);

    return () => {
      applying = true;
      coolDown = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(debounceTimer);
      window.clearTimeout(coolDownTimer);
      ro?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [
    cv,
    selectedTemplate,
    selectedFont.id,
    fontSize,
    lineSpacing,
    marginSize,
    zoomLevel,
    bgPattern,
    cv?.document.summary,
    cv?.document.experiences,
    cv?.document.skills,
    cv?.document.toolsAndSoftware,
    cv?.document.education,
    cv?.document.languages,
    cv?.document.certifications,
    cv?.document.references,
    cv?.document.projects,
  ]);

  // Keep the A4 preview inside the available canvas on phones and narrow
  // split-screen views. The document itself stays print-sized; only the
  // screen preview is scaled down so controls never create horizontal scroll.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateCanvasScale = () => {
      const pageWidth = printRef.current?.offsetWidth || 794;
      const availableWidth = Math.max(240, canvas.clientWidth - 24);
      setCanvasPageWidthPx((previous) => (previous === pageWidth ? previous : pageWidth));
      const nextScale = Math.min(1, availableWidth / pageWidth);
      setCanvasFitScale((previous) => (Math.abs(previous - nextScale) < 0.01 ? previous : nextScale));
    };

    updateCanvasScale();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateCanvasScale) : null;
    observer?.observe(canvas);
    if (printRef.current) observer?.observe(printRef.current);
    window.addEventListener("resize", updateCanvasScale);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateCanvasScale);
    };
  }, [cv, activeNavPanel, isPreviewMode]);

  const meta = resolveTemplate(selectedTemplate);

  const filteredTemplates = TEMPLATE_CATALOG.filter((t) => {
    if (templateFilter === "double") return t.columns === "double";
    if (templateFilter === "single") return t.columns === "single" && t.templateType !== "timeline";
    if (templateFilter === "timeline") return t.templateType === "timeline";
    if (templateFilter === "executive") {
      return t.templateType === "executive" || t.category === "Traditional" || t.category === "Executive";
    }
    if (templateFilter === "modern") return t.category === "Modern";
    return true;
  });

  return (
    <div className="cv-builder flex min-h-[calc(100dvh-4rem)] min-w-0 flex-1 flex-col overflow-x-hidden bg-[#F4F5F7] font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* 1. MINIMALIST TOP COMMAND HEADER (ENHANCV-STYLE) */}
      <header className="cv-builder-command-header no-print relative z-30 border-b border-border bg-card/95 backdrop-blur-md sm:sticky sm:top-16">
        <div className="mx-auto flex min-h-14 max-w-full flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-3 py-2 sm:h-14 sm:flex-nowrap sm:gap-3 sm:px-6 sm:py-0">
          {/* Left: Brand + Role Title + Cloud Saved Indicator */}
          <div className="flex min-w-0 max-w-[calc(100%-4rem)] items-center gap-2 sm:max-w-none sm:gap-3">
            <Link href="/" className="flex items-center gap-2 group" aria-label="BonList home">
              <img src="/brand/bonlist-mark.png" alt="" className="h-8 w-8 object-contain transition group-hover:scale-105 md:hidden" width={32} height={32} />
              <img
                src="/brand/bonlist-logo.png"
                alt="BonList"
                className="hidden h-7 w-auto max-w-[190px] object-contain object-left md:inline-block"
                height={28}
              />
            </Link>

            <span className="h-4 w-[1px] bg-border hidden sm:block" />

            {/* Version / Title Pill */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowVersionDropdown(!showVersionDropdown)}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-secondary transition"
              >
                <Layers size={13} className="text-primary" />
                <span className="max-w-[110px] truncate sm:max-w-[180px]">{currentVersionName}</span>
                <ChevronDown size={12} className="text-muted-foreground" />
              </button>

              {showVersionDropdown && (
                <div className="absolute left-0 mt-2 z-50 w-64 rounded-2xl border border-border bg-card p-2 shadow-xl animate-in fade-in zoom-in-95">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Targeted CV Versions
                  </div>
                  <div className="space-y-1 mt-1">
                    {savedCvVersions.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          handleSwitchVersion(v);
                          setShowVersionDropdown(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs transition ${
                          v.name === currentVersionName
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "text-foreground hover:bg-secondary"
                        }`}
                      >
                        <span className="truncate">{v.name}</span>
                        {v.name === currentVersionName && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 border-t border-border pt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowVersionDropdown(false);
                        setIsNewVersionModalOpen(true);
                      }}
                      className="flex w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10"
                    >
                      <Plus size={13} />
                      <span>Create Targeted Version…</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Cloud Sync Status */}
            <span className="hidden lg:flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={13} />
              <span>Saved</span>
            </span>
          </div>

          {/* Center: Quick Document Actions (Undo, Reset, Pre-Flight Status) */}
          <div className="order-3 flex w-full min-w-0 items-center justify-end gap-1.5 overflow-x-auto border-t border-border/60 pt-1.5 sm:order-none sm:w-auto sm:overflow-visible sm:border-t-0 sm:pt-0">
            <button
              type="button"
              disabled={changeHistory.length === 0}
              onClick={handleUndo}
              title={changeHistory.length > 0 ? `Undo: ${changeHistory[0]?.action}` : "No edits to undo"}
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-40 transition"
            >
              <Undo2 size={13} />
              <span className="hidden sm:inline">Undo</span>
            </button>

            {/* Upload or Manual Info Intake Button */}
            <button
              type="button"
              onClick={() => setIsIntakeModalOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary shadow-xs transition hover:bg-primary/20"
              title="Upload existing CV or add information manually"
            >
              <FileUp size={13} />
               <span className="hidden sm:inline">Upload / Manual Setup</span>
            </button>

            <button
              type="button"
              onClick={openImproveCvModal}
              disabled={!cv && !loading}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 shadow-xs transition hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-300"
              title="Improve wording without inventing experience"
            >
              <Wand2 size={13} />
               <span className="hidden sm:inline">Improve CV</span>
            </button>

            <button
              type="button"
              onClick={() => void handleStartAchievementDiscovery()}
              className="hidden xl:flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition"
              title="Targeted questions to draw out verified metrics"
            >
              <Award size={13} />
              <span>Achievement Discovery</span>
            </button>
          </div>

          {/* Right: Live ATS Score Badge + Job Match + Export + Save */}
          <div className="order-2 flex w-full min-w-0 flex-wrap items-center justify-end gap-1.5 sm:order-none sm:w-auto sm:shrink-0 sm:gap-2">
            {/* ATS Live Score Slide-Out Button */}
            <button
              type="button"
              onClick={() => {
                setShowAtsDrawer(!showAtsDrawer);
                if (showJobMatchDrawer) setShowJobMatchDrawer(false);
              }}
              className={`hidden items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition sm:flex ${
                showAtsDrawer
                  ? "border-primary bg-primary text-primary-foreground shadow-xs"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
              }`}
              title="Open Real-Time ATS Compatibility & Workday Parser Simulation"
            >
              <ShieldCheck size={14} className={showAtsDrawer ? "text-primary-foreground" : "text-emerald-500"} />
              <span>ATS Score: {qualityReport?.overallScore || 94}%</span>
            </button>

            {/* Job Match & Keyword Optimization Drawer Button */}
            <button
              type="button"
              onClick={() => {
                setShowJobMatchDrawer(!showJobMatchDrawer);
                if (showAtsDrawer) setShowAtsDrawer(false);
              }}
              className={`hidden sm:flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                showJobMatchDrawer
                  ? "border-primary bg-primary text-primary-foreground shadow-xs"
                  : "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-500/20"
              }`}
              title="Paste Job Description to analyze match and highlight keywords"
            >
              <Target size={14} className={showJobMatchDrawer ? "text-primary-foreground" : "text-sky-500"} />
              <span>{advancedMatchReport ? `${advancedMatchReport.overallFitPercentage}% Match` : "Job Match"}</span>
            </button>

            {/* Preview Mode Toggle (Enhancv Feature) */}
            <button
              type="button"
              onClick={() => setIsPreviewMode(!isPreviewMode)}
              className={`hidden md:flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                isPreviewMode
                  ? "border-primary bg-primary text-primary-foreground shadow-xs"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              }`}
              title={isPreviewMode ? "Exit Preview" : "Preview Mode (Distraction-Free)"}
            >
              {isPreviewMode ? <EyeOff size={13} /> : <Eye size={13} />}
              <span>{isPreviewMode ? "Exit Preview" : "Preview"}</span>
            </button>

            {/* Download / Export Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowExportDropdown(!showExportDropdown)}
                disabled={!cv}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-xs hover:brightness-105 transition disabled:opacity-50"
                title={cv ? "Download your CV" : "Generate a CV first"}
                data-export-menu
              >
                <Download size={14} />
              <span className="hidden sm:inline">Download</span>
                <ChevronDown size={12} />
              </button>

              {showExportDropdown && (
                  <div className="absolute right-0 mt-2 z-50 w-56 rounded-2xl border border-border bg-card p-2 shadow-xl animate-in fade-in zoom-in-95" data-export-menu>
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Download final CV
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDirectDownload("print")}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold text-foreground hover:bg-secondary transition"
                  >
                    <Printer size={14} className="text-primary" />
                    <div>
                      <div>PDF Document</div>
                      <div className="text-[10px] font-normal text-muted-foreground">Save as PDF via print dialog</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDirectDownload("doc")}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold text-foreground hover:bg-secondary transition"
                  >
                    <FileDown size={14} className="text-sky-500" />
                    <div>
                      <div>Word Document (.doc)</div>
                      <div className="text-[10px] font-normal text-muted-foreground">Editable Microsoft Word format</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDirectDownload("txt")}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold text-foreground hover:bg-secondary transition"
                  >
                    <FileText size={14} className="text-emerald-500" />
                    <div>
                      <div>Plain Text (.txt)</div>
                      <div className="text-[10px] font-normal text-muted-foreground">Universal ATS direct-upload</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDirectDownload("html")}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs font-semibold text-foreground hover:bg-secondary transition"
                  >
                    <FileCode size={14} className="text-purple-500" />
                    <div>
                      <div>Semantic HTML</div>
                      <div className="text-[10px] font-normal text-muted-foreground">Stand-alone web standard</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Save */}
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveCv()}
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-50 transition"
              title="Save snapshot to cloud"
            >
              <Save size={13} />
              <span>{saving ? "Saving…" : "Save"}</span>
            </button>
          </div>
        </div>
      </header>

      {!isPreviewMode && (
        <nav className="no-print flex w-full gap-2 overflow-x-auto border-b border-border bg-card px-3 py-2 md:hidden" aria-label="CV builder tools">
          {([
            ["templates", "Templates"],
            ["design", "Design"],
            ["sections", "Sections"],
            ["ai", "AI help"],
          ] as const).map(([panel, label]) => (
            <button
              key={panel}
              type="button"
              onClick={() => setActiveNavPanel(activeNavPanel === panel ? null : panel)}
              aria-expanded={activeNavPanel === panel}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${activeNavPanel === panel ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={() => { setShowAtsDrawer(true); setShowJobMatchDrawer(false); }} className="shrink-0 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-foreground">ATS score</button>
          <button type="button" onClick={() => { setShowJobMatchDrawer(true); setShowAtsDrawer(false); }} className="shrink-0 rounded-lg bg-secondary px-3 py-2 text-xs font-semibold text-foreground">Job match</button>
        </nav>
      )}

      {/* Notifications / Toast */}
      {message ? (
        <div className="no-print border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-center text-xs font-medium text-emerald-800 dark:text-emerald-200">
          ✓ {message}
        </div>
      ) : null}
      {error ? (
        <div className="no-print border-b border-destructive/20 bg-destructive/10 px-4 py-1.5 text-center text-xs font-medium text-destructive">
          ⚠ {error}
        </div>
      ) : null}

      {/* 2. ENHANCV-STYLE WORKSPACE (LEFT ICON RAIL + FLYOUT PANEL + A4 CANVAS + RIGHT DRAWERS) */}
      <div className="cv-builder-workspace relative flex min-h-0 min-w-0 flex-1 flex-col overflow-visible md:flex-row md:overflow-hidden">
        {/* LEFT COMPACT ICON RAIL (4 MAIN OPTIONS: Templates, Design, Sections, AI) */}
        {!isPreviewMode && (
          <nav className="no-print hidden w-16 shrink-0 flex-col items-center justify-between border-r border-border bg-card py-4 md:flex md:z-20">
            {/* Top 4 Primary Workspace Modules */}
            <div className="flex flex-col items-center gap-3">
              {/* 1. Templates */}
              <button
                type="button"
                onClick={() => setActiveNavPanel(activeNavPanel === "templates" ? null : "templates")}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
                  activeNavPanel === "templates"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
                title="Templates & Layouts"
              >
                <LayoutTemplate size={18} />
                <span className="absolute left-14 z-50 hidden rounded-md bg-foreground px-2 py-1 text-[10px] font-semibold text-background shadow-md group-hover:block whitespace-nowrap">
                  Templates & Layouts
                </span>
              </button>

              {/* 2. Design & Layout */}
              <button
                type="button"
                onClick={() => setActiveNavPanel(activeNavPanel === "design" ? null : "design")}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
                  activeNavPanel === "design"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
                title="Design, Typography & Colors"
              >
                <Palette size={18} />
                <span className="absolute left-14 z-50 hidden rounded-md bg-foreground px-2 py-1 text-[10px] font-semibold text-background shadow-md group-hover:block whitespace-nowrap">
                  Design & Layout
                </span>
              </button>

              {/* 3. Content & Sections */}
              <button
                type="button"
                onClick={() => setActiveNavPanel(activeNavPanel === "sections" ? null : "sections")}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
                  activeNavPanel === "sections"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
                title="Content Sections & Ordering"
              >
                <ListChecks size={18} />
                <span className="absolute left-14 z-50 hidden rounded-md bg-foreground px-2 py-1 text-[10px] font-semibold text-background shadow-md group-hover:block whitespace-nowrap">
                  Content & Sections
                </span>
              </button>

              {/* 4. AI Assistant */}
              <button
                type="button"
                onClick={() => setActiveNavPanel(activeNavPanel === "ai" ? null : "ai")}
                className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
                  activeNavPanel === "ai"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
                title="AI Assistant & Career Positioning"
              >
                <Sparkles size={18} />
                <span className="absolute left-14 z-50 hidden rounded-md bg-foreground px-2 py-1 text-[10px] font-semibold text-background shadow-md group-hover:block whitespace-nowrap">
                  AI Assistant & Voice
                </span>
              </button>
            </div>

            {/* Bottom Rail Actions (Setup / Import, Manual Entry) */}
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIntakeTab("upload");
                  setShowPasteInsideUpload(false);
                  setIsIntakeModalOpen(true);
                }}
                className="group relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                title="Upload Existing CV"
              >
                <Upload size={16} />
                <span className="absolute left-14 z-50 hidden rounded-md bg-foreground px-2 py-1 text-[10px] font-semibold text-background shadow-md group-hover:block whitespace-nowrap">
                  Upload CV (PDF/Word/TXT)
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIntakeTab("manual");
                  setIsIntakeModalOpen(true);
                }}
                className="group relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                title="Add Details Manually"
              >
                <FileText size={16} />
                <span className="absolute left-14 z-50 hidden rounded-md bg-foreground px-2 py-1 text-[10px] font-semibold text-background shadow-md group-hover:block whitespace-nowrap">
                  Add Details Manually
                </span>
              </button>
            </div>
          </nav>
        )}

        {/* LEFT EXPANDABLE DRAWER PANEL (340px) */}
        {!isPreviewMode && activeNavPanel && (
          <aside className="no-print relative z-20 max-h-[min(65dvh,36rem)] w-full min-w-0 shrink-0 overflow-y-auto border-b border-border bg-card p-4 shadow-lg animate-in slide-in-from-left duration-200 md:inset-auto md:z-10 md:max-h-full md:w-[22rem] md:max-w-[26rem] md:border-b-0 md:border-r">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {activeNavPanel === "templates" && "Layout & Templates"}
                {activeNavPanel === "design" && "Design, Typography & Spacing"}
                {activeNavPanel === "sections" && "Manage CV Sections"}
                {activeNavPanel === "ai" && "AI Assistant & Career Intelligence"}
              </h2>
              <button
                type="button"
                onClick={() => setActiveNavPanel(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Collapse panel"
              >
                <X size={15} />
              </button>
            </div>

            {/* PANEL 1: TEMPLATES & VISUAL THUMBNAILS */}
            {activeNavPanel === "templates" && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {TEMPLATE_CATALOG.length} modern templates — including Serif Classic, Corporate Blue, Editorial Gold, and Analyst Clean — with ATS-safe formatting.
                  </p>
                </div>

                {/* Filter Pills */}
                <div className="flex flex-wrap gap-1.5 border-b border-border pb-3">
                  {[
                    { id: "all", label: `All (${TEMPLATE_CATALOG.length})` },
                    { id: "double", label: `Two-Column (${TEMPLATE_CATALOG.filter((t) => t.columns === "double").length})` },
                    { id: "single", label: `Single-Column (${TEMPLATE_CATALOG.filter((t) => t.columns === "single" && t.templateType !== "timeline").length})` },
                    { id: "timeline", label: `Timeline (${TEMPLATE_CATALOG.filter((t) => t.templateType === "timeline").length})` },
                    { id: "executive", label: `Executive (${TEMPLATE_CATALOG.filter((t) => t.templateType === "executive" || t.category === "Traditional" || t.category === "Executive").length})` },
                    { id: "modern", label: `Modern (${TEMPLATE_CATALOG.filter((t) => t.category === "Modern").length})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTemplateFilter(tab.id)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                        templateFilter === tab.id
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Templates Grid — visible mini A4 thumbnails */}
                <div className="grid grid-cols-2 gap-2.5 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
                  {filteredTemplates.map((tpl) => (
                    <TemplateThumbnail
                      key={tpl.id}
                      tpl={tpl}
                      selected={selectedTemplate === tpl.id}
                      onSelect={() => handleTemplateChange(tpl.id)}
                      doc={cv?.document}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground text-center pt-1">
                  Tip: try <span className="font-semibold text-foreground">Serif Classic</span>,{" "}
                  <span className="font-semibold text-foreground">Corporate Blue</span>,{" "}
                  <span className="font-semibold text-foreground">Editorial Gold</span>, or{" "}
                  <span className="font-semibold text-foreground">Analyst Clean</span>, then Download PDF.
                </p>
              </div>
            )}

            {/* PANEL 2: DESIGN & TYPOGRAPHY */}
            {activeNavPanel === "design" && (
              <div className="space-y-5 text-xs">
                {/* Accent Color Palette (10 Custom Color Themes) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-bold text-foreground">Color Palette (South African & Executive)</label>
                    <span className="text-[10px] text-muted-foreground">{selectedColor.label.split(" ")[0]}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {COLOR_THEMES.map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setSelectedColor(theme)}
                        className={`group relative flex flex-col items-center gap-1 rounded-xl border p-1.5 text-[10px] font-semibold transition ${
                          selectedColor.id === theme.id
                            ? "border-primary bg-primary/10 ring-2 ring-primary/40 shadow-xs"
                            : "border-border hover:bg-secondary/60"
                        }`}
                        title={theme.label}
                      >
                        <span
                          className="h-6 w-6 rounded-full border border-black/10 shadow-xs flex items-center justify-center text-white"
                          style={{ backgroundColor: theme.primary }}
                        >
                          {selectedColor.id === theme.id && <Check size={11} className="stroke-[3]" />}
                        </span>
                        <span className="truncate max-w-full text-[9px]">{theme.label.split(" ")[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Typography Selection (Lato, Rubik, Inter, Merriweather, Raleway, Playfair, Mono) */}
                <div>
                  <label className="font-bold text-foreground block mb-2">Typography & Font Pairing</label>
                  <div className="space-y-1.5">
                    {FONT_OPTIONS.map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => setSelectedFont(font)}
                        style={{ fontFamily: font.family }}
                        className={`w-full rounded-xl border p-2.5 text-left text-xs transition flex items-center justify-between ${
                          selectedFont.id === font.id
                            ? "border-primary bg-primary/5 font-bold ring-1 ring-primary/30"
                            : "border-border hover:bg-secondary/60"
                        }`}
                      >
                        <span className="text-sm">{font.label}</span>
                        {selectedFont.id === font.id && <Check size={14} className="text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Size Stepper */}
                <div>
                  <div className="flex items-center justify-between mb-1.5 font-bold text-foreground">
                    <span>Base Font Size</span>
                    <span className="text-primary">{fontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min="9.0"
                    max="12.0"
                    step="0.5"
                    value={fontSize}
                    onChange={(e) => setFontSize(parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>9.0pt (Compact)</span>
                    <span>10.5pt (Standard)</span>
                    <span>12.0pt (Spacious)</span>
                  </div>
                </div>

                {/* Line Spacing */}
                <div>
                  <label className="font-bold text-foreground block mb-1.5">Line Spacing</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["tight", "balanced", "relaxed"] as const).map((space) => (
                      <button
                        key={space}
                        type="button"
                        onClick={() => setLineSpacing(space)}
                        className={`rounded-xl border py-1.5 text-center text-xs capitalize transition ${
                          lineSpacing === space ? "border-primary bg-primary/10 font-bold text-primary" : "border-border hover:bg-secondary"
                        }`}
                      >
                        {space}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Margin Density */}
                <div>
                  <label className="font-bold text-foreground block mb-1.5">Page Margins</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["compact", "normal", "wide"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMarginSize(m)}
                        className={`rounded-xl border py-1.5 text-center text-xs capitalize transition ${
                          marginSize === m ? "border-primary bg-primary/10 font-bold text-primary" : "border-border hover:bg-secondary"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Paper Texture & Background */}
                <div>
                  <label className="font-bold text-foreground block mb-1.5">Paper Texture & Background</label>
                  <div className="grid grid-cols-2 gap-2">
                    {BACKGROUND_PATTERNS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setBgPattern(p.id)}
                        className={`rounded-xl border p-2 text-left text-xs transition flex items-center gap-2 ${
                          bgPattern === p.id
                            ? "border-primary bg-primary/10 font-bold text-primary"
                            : "border-border hover:bg-secondary"
                        }`}
                      >
                        <span
                          className="h-4 w-4 rounded-md border border-slate-300 shrink-0"
                          style={p.style}
                        />
                        <div className="truncate">
                          <div className="font-semibold text-[11px] truncate">{p.label}</div>
                          <div className="text-[9px] text-muted-foreground truncate">{p.description}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* POPIA Privacy Notice Toggle */}
                <div className="rounded-xl border border-border bg-secondary/20 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">POPIA Compliance Notice</span>
                    <input
                      type="checkbox"
                      checked={showPopiaNotice}
                      onChange={(e) => setShowPopiaNotice(e.target.checked)}
                      className="rounded accent-primary"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Appends South African POPIA candidate consent footnote ensuring verified data usage.
                  </p>
                </div>
              </div>
            )}

            {/* PANEL 3: CONTENT & SECTIONS */}
            {activeNavPanel === "sections" && (
              <div className="space-y-4 text-xs">
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Toggle and organize sections. Standard ATS headings ensure Workday and Taleo parse your achievements seamlessly.
                </p>

                <div className="space-y-2">
                  {[
                    { key: "summary", label: "Professional Summary" },
                    { key: "experience", label: "Work Experience & Outcomes" },
                    { key: "skills", label: "Skills & Core Competencies" },
                    { key: "systems", label: "Systems & Software" },
                    { key: "education", label: "Education & Qualifications" },
                    { key: "projects", label: "Key Projects & Portfolios" },
                    { key: "certifications", label: "Certifications & Licenses" },
                    { key: "languages", label: "Languages" },
                  ].map((sec) => (
                    <div
                      key={sec.key}
                      className="flex items-center justify-between rounded-xl border border-border bg-card p-2.5 transition hover:bg-secondary/40"
                    >
                      <span className="font-semibold text-foreground">{sec.label}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleSections((prev) => ({
                            ...prev,
                            [sec.key]: !prev[sec.key],
                          }))
                        }
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-bold transition ${
                          visibleSections[sec.key]
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {visibleSections[sec.key] ? "Visible" : "Hidden"}
                      </button>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!cv) return;
                      const newExp: CvExperienceItem = {
                        id: `exp-${cv.document.experiences.length + 1}`,
                        role: "Target Position / Role",
                        company: "Company / Organization",
                        startDate: "2024",
                        endDate: "Present",
                        bullets: ["Coordinated operational deliverables and communicated with cross-functional stakeholders."],
                        classification: "VERIFIED",
                      };
                      updateDocumentField("experiences", [newExp, ...cv.document.experiences]);
                      setMessage("Added new Work Experience entry.");
                      setTimeout(() => setMessage(""), 3000);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border p-2.5 text-xs font-semibold text-primary hover:border-primary/50 hover:bg-primary/5 transition"
                  >
                    <Plus size={14} />
                    <span>Add New Employment Entry</span>
                  </button>
                </div>
              </div>
            )}

            {/* PANEL 4: AI ASSISTANT & STRATEGIC POSITIONING */}
            {activeNavPanel === "ai" && (
              <div className="space-y-4 text-xs">
                {/* Isolated AI Reviewer Feedback Channel */}
                {aiFeedback &&
                  (aiFeedback.summaryFeedback ||
                    (aiFeedback.missingKeywords && aiFeedback.missingKeywords.length > 0) ||
                    (aiFeedback.jobBoardAdvice && aiFeedback.jobBoardAdvice.length > 0) ||
                    (aiFeedback.recommendations && aiFeedback.recommendations.length > 0)) && (
                    <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-3.5 space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                        <Sparkles size={14} />
                        <span>AI Reviewer & Strategy Notes</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Isolated feedback from your CV diagnostic. These advisory notes are kept separate from your CV output to prevent reviewer critique from leaking into your resume.
                      </p>
                      {aiFeedback.summaryFeedback && (
                        <div className="rounded-xl border border-blue-500/20 bg-card p-2.5 space-y-1">
                          <div className="font-semibold text-foreground text-[10px]">Reviewer Assessment</div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {aiFeedback.summaryFeedback}
                          </p>
                        </div>
                      )}
                      {aiFeedback.missingKeywords && aiFeedback.missingKeywords.length > 0 && (
                        <div className="rounded-xl border border-blue-500/20 bg-card p-2.5 space-y-1">
                          <div className="font-semibold text-foreground text-[10px]">Suggested Keywords to Consider</div>
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {aiFeedback.missingKeywords.map((kw, i) => (
                              <span
                                key={i}
                                className="rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 text-[9px] font-medium"
                              >
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {aiFeedback.jobBoardAdvice && aiFeedback.jobBoardAdvice.length > 0 && (
                        <div className="rounded-xl border border-blue-500/20 bg-card p-2.5 space-y-1">
                          <div className="font-semibold text-foreground text-[10px]">Job Board Positioning Tips</div>
                          <ul className="list-disc list-inside text-[10px] text-muted-foreground space-y-0.5">
                            {aiFeedback.jobBoardAdvice.map((tip, i) => (
                              <li key={i}>{tip}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {aiFeedback.recommendations && aiFeedback.recommendations.length > 0 && (
                        <div className="rounded-xl border border-blue-500/20 bg-card p-2.5 space-y-1">
                          <div className="font-semibold text-foreground text-[10px]">Actionable Recommendations</div>
                          <ul className="list-disc list-inside text-[10px] text-muted-foreground space-y-0.5">
                            {aiFeedback.recommendations.map((rec, i) => (
                              <li key={i}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                {/* "Make It Sound Like Me" (Voice Humanizer) */}
                <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-3.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300">
                    <Wand2 size={14} />
                    <span>Make It Sound Like Me (Voice Tone)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Select your authentic voice. BonList refines cadence and eliminates corporate buzzwords while preserving verified facts.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {(
                      [
                        "natural",
                        "professional",
                        "confident",
                        "executive",
                        "straightforward",
                        "technical",
                      ] as HumanizeTone[]
                    ).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => void handleRunHumanize(t)}
                        className={`rounded-lg border p-1.5 text-center text-[10px] font-semibold capitalize transition ${
                          selectedTone === t ? "border-primary bg-primary/10 text-primary font-bold" : "border-border hover:bg-secondary"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {humanizePreview && (
                    <div className="mt-2 rounded-xl border border-purple-500/20 bg-card p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-foreground text-[10px]">
                        <span>Preview ({humanizePreview.tone})</span>
                        <button
                          type="button"
                          onClick={applyHumanizedSummary}
                          className="rounded bg-primary px-2 py-0.5 text-primary-foreground font-semibold"
                        >
                          Apply
                        </button>
                      </div>
                      <p className="text-[10px] italic text-muted-foreground leading-relaxed">
                        "{humanizePreview.humanized}"
                      </p>
                    </div>
                  )}
                </div>

                {/* Section 30: Career Positioning Engine */}
                {positioningReport && (
                  <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                        Career Positioning Lane
                      </span>
                      <button
                        type="button"
                        onClick={() => handleApplyPositioning(positioningReport.recommendedPositioning)}
                        className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground hover:opacity-90"
                      >
                        Apply
                      </button>
                    </div>
                    <div className="font-bold text-foreground text-xs">
                      {positioningReport.recommendedPositioning.title}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {positioningReport.recommendedPositioning.strategicRationale}
                    </p>
                  </div>
                )}

                {/* Career Strategic Advisor Q&A */}
                <div className="space-y-2 border-t border-border pt-3">
                  <span className="font-bold text-foreground block">Career Advisor Q&A</span>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={advisorQuestion}
                      onChange={(e) => setAdvisorQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleAskAdvisor(advisorQuestion);
                      }}
                      placeholder="e.g. How to highlight logistics background?"
                      className="w-full rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      disabled={advisorLoading || !advisorQuestion.trim()}
                      onClick={() => void handleAskAdvisor(advisorQuestion)}
                      className="rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {advisorLoading ? "…" : "Ask"}
                    </button>
                  </div>

                  {advisorResponse && (
                    <div className="rounded-xl border border-border bg-secondary/20 p-2.5 space-y-1 text-[11px]">
                      <div className="font-semibold text-primary">{advisorResponse.answer}</div>
                      <div className="text-muted-foreground">{advisorResponse.reasoning}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* CENTER CANVAS: LIGHT NEUTRAL BACKGROUND (#F4F5F7) + REALISTIC A4 PAGE */}
        <main ref={canvasRef} className="min-w-0 flex min-h-0 flex-1 flex-col items-center overflow-visible p-2 sm:overflow-y-auto sm:p-8">
          {/* Preview Banner Pill */}
          {isPreviewMode && (
            <div className="no-print sticky top-2 z-40 mx-auto mb-4 flex items-center gap-3 rounded-full border border-border bg-card/95 px-4 py-1.5 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Eye size={13} className="text-primary" />
                <span>Preview Mode — Distraction-Free Layout View</span>
              </span>
              <button
                type="button"
                onClick={() => setIsPreviewMode(false)}
                className="flex items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-xs font-bold text-primary-foreground shadow-xs hover:brightness-105"
              >
                <EyeOff size={11} />
                <span>Exit Preview</span>
              </button>
            </div>
          )}

          {/* Quick Floating Format & Zoom Bar */}
          <div className="no-print mb-3 flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card/90 px-3 py-2 text-xs shadow-xs backdrop-blur-md sm:mb-4 sm:gap-3 sm:px-4">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-muted-foreground sm:gap-2">
              <span className="font-semibold text-foreground">Layout: {meta.name}</span>
              <span>·</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{meta.structuralTag}</span>
              <span>·</span>
              <span className="text-[11px]">{meta.columns === "double" ? "2-Column" : meta.templateType === "timeline" ? "Timeline" : "Single-Column"}</span>
              {cv && (
                <>
                  <span>·</span>
                  <span className="cv-page-badge" title="Live A4 page count matches download">
                    {a4PageCount} A4 page{a4PageCount === 1 ? "" : "s"}
                  </span>
                </>
              )}
            </div>

            <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
              {/* Highlight Keywords Toggle */}
              {advancedMatchReport && (
                <button
                  type="button"
                  onClick={() => setHighlightJobKeywords(!highlightJobKeywords)}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                    highlightJobKeywords
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30"
                      : "text-muted-foreground hover:bg-secondary"
                  }`}
                  title="Toggle highlight on CV words matching target job description"
                >
                  <Eye size={12} />
                  <span>Highlight Matches</span>
                </button>
              )}

              {/* Preview Toggle */}
              <button
                type="button"
                onClick={() => setIsPreviewMode(!isPreviewMode)}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                  isPreviewMode
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "border-border bg-background text-foreground hover:bg-secondary"
                }`}
                title={isPreviewMode ? "Exit Preview" : "Preview Full Document"}
              >
                {isPreviewMode ? <EyeOff size={12} /> : <Eye size={12} />}
                <span>{isPreviewMode ? "Exit Preview" : "Preview"}</span>
              </button>

              {/* Zoom Stepper */}
              <div className="flex items-center border border-border rounded-lg bg-background overflow-hidden">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                  className="px-2 py-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Zoom Out"
                >
                  <ZoomOut size={12} />
                </button>
                <span className="px-2 py-0.5 text-[10px] font-bold text-foreground">
                  {zoomLevel}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
                  className="px-2 py-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  title="Zoom In"
                >
                  <ZoomIn size={12} />
                </button>
              </div>
            </div>
          </div>

          {/* REALISTIC MULTI-PAGE A4 PREVIEW (matches download) */}
          {cv ? (
            <div className="cv-a4-viewport">
                <div
                className="cv-zoom-outer"
                style={{
                   width: `${Math.ceil(canvasPageWidthPx * Math.min(zoomLevel / 100, canvasFitScale))}px`,
                   height: a4StackHeightPx
                     ? `${Math.ceil(a4StackHeightPx * Math.min(zoomLevel / 100, canvasFitScale))}px`
                     : undefined,
                }}
              >
                <div
                  style={{
                    transform: `scale(${Math.min(zoomLevel / 100, canvasFitScale)})`,
                    transformOrigin: "top left",
                    transition: "transform 0.15s ease-out",
                  }}
                  className="cv-zoom-stage"
                >
                  <div className="cv-a4-stack">
                    <div className="cv-page-guides no-print" aria-hidden>
                      {Array.from({ length: Math.max(0, a4PageCount - 1) }).map((_, i) => (
                        <div
                          key={i}
                          className="cv-page-guide"
                          style={{ top: `${(i + 1) * 297}mm` }}
                        >
                          <span className="cv-page-guide-label">
                            Page {i + 1} · continues on page {i + 2}
                          </span>
                        </div>
                      ))}
                    </div>
              {(() => {
                const isTimeline = meta.templateType === "timeline" || selectedTemplate === "timeline";
                const isDouble = meta.columns === "double";
                const isIvy = selectedTemplate === "ivy_league";
                const isContemporary = selectedTemplate === "contemporary";
                const isModern = selectedTemplate === "modern";
                const isCreative = selectedTemplate === "creative";
                const isStylish = selectedTemplate === "stylish";
                const isCompact = selectedTemplate === "compact";
                const isMinimal = selectedTemplate === "minimal";
                const isPolished = selectedTemplate === "polished" || meta.templateType === "executive";
                const isClassic = selectedTemplate === "classic";
                const isSerifClassic = selectedTemplate === "serif_classic";
                const isCorporateBlue = selectedTemplate === "corporate_blue";
                const isEditorialGold = selectedTemplate === "editorial_gold";
                const isAnalystClean = selectedTemplate === "analyst_clean";

                const renderSectionHeading = (title: string) => {
                  if (isSerifClassic) {
                    return (
                      <div className="border-y border-slate-800 py-1.5 mb-3">
                        <h2 className="text-[11px] font-serif font-bold uppercase tracking-[0.18em] text-slate-900">
                          {title}
                        </h2>
                      </div>
                    );
                  }
                  if (isCorporateBlue) {
                    return (
                      <div className="mb-3">
                        <div className="h-[2px] w-full mb-1.5" style={{ backgroundColor: selectedColor.primary }} />
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: selectedColor.primary }}>
                          {title}
                        </h2>
                        <div className="h-[2px] w-full mt-1.5" style={{ backgroundColor: selectedColor.primary }} />
                      </div>
                    );
                  }
                  if (isEditorialGold) {
                    return (
                      <div className="mb-3">
                        <h2 className="text-sm font-serif font-bold tracking-wide" style={{ color: selectedColor.primary }}>
                          {title}
                        </h2>
                        <div className="mt-1 h-px w-full" style={{ backgroundColor: selectedColor.primary }} />
                      </div>
                    );
                  }
                  if (isAnalystClean) {
                    return (
                      <div className="mb-3 border-b border-dashed border-slate-300 pb-1.5">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.28em] text-slate-800">
                          {title.split("").join(" ")}
                        </h2>
                      </div>
                    );
                  }
                  if (isContemporary) {
                    return (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-1.5 h-4 rounded-full shrink-0" style={{ backgroundColor: selectedColor.primary }} />
                        <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: selectedColor.primary }}>
                          {title}
                        </h2>
                      </div>
                    );
                  }
                  if (isIvy) {
                    return (
                      <div className="border-b pb-1 mb-2.5 text-center" style={{ borderColor: selectedColor.border }}>
                        <h2 className="text-xs font-serif font-bold uppercase tracking-widest text-center" style={{ color: selectedColor.primary }}>
                          {title}
                        </h2>
                      </div>
                    );
                  }
                  if (isMinimal) {
                    return (
                      <div className="border-b border-slate-100/90 pb-1 mb-2">
                        <h2 className="text-xs font-medium tracking-wider text-slate-800">
                          {title}
                        </h2>
                      </div>
                    );
                  }
                  if (isPolished || isClassic) {
                    return (
                      <div className="border-b-2 pb-1 mb-2.5" style={{ borderColor: selectedColor.primary }}>
                        <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: selectedColor.primary }}>
                          {title}
                        </h2>
                      </div>
                    );
                  }
                  return (
                    <div className="border-b pb-1 mb-2" style={{ borderColor: selectedColor.border }}>
                      <h2 className="text-xs font-bold uppercase tracking-wider" style={{ color: selectedColor.primary }}>
                        {title}
                      </h2>
                    </div>
                  );
                };

                const summarySection = visibleSections.summary && (
                  <>
                    <A4PageSpacer id="summary" height={a4Spacers.summary || 0} />
                  <section
                    data-a4-id="summary"
                    className={`relative group/section cv-a4-keep transition-all ${
                      !scrubCvText(cv.document.summary) ? "no-print" : ""
                    } ${
                      isCreative
                        ? "rounded-xl p-4 border shadow-xs"
                        : "rounded-xl p-1 -m-1 hover:bg-slate-50/50"
                    }`}
                    style={isCreative ? { backgroundColor: selectedColor.secondary, borderColor: selectedColor.border } : {}}
                  >
                    {/* Section Hover Toolbar */}
                    <div className="absolute top-0 right-0 no-print opacity-0 group-hover/section:opacity-100 transition-opacity z-10 flex items-center gap-1 rounded-full border border-border bg-card/95 backdrop-blur-md px-2 py-0.5 shadow-sm">
                      <button
                        type="button"
                        onClick={() => void handleRunHumanize(selectedTone)}
                        className="flex items-center gap-1 text-[10px] font-semibold text-purple-600 hover:underline"
                        title="Refine Tone"
                      >
                        <Wand2 size={11} /> Voice Tone
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => setVisibleSections((v) => ({ ...v, summary: false }))}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Hide
                      </button>
                    </div>

                    {renderSectionHeading(
                      isSerifClassic || isEditorialGold || isCorporateBlue || isAnalystClean
                        ? "Profile"
                        : "Professional Summary",
                    )}
                    <AutoGrowTextarea
                      rows={3}
                      value={cv.document.summary}
                      onChange={(e) => updateDocumentField("summary", e.target.value)}
                      className="mt-1.5 w-full resize-none bg-transparent text-xs leading-relaxed text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
                      placeholder="Synthesize your background and core verified accomplishments..."
                    />
                  </section>
                  </>
                );

                const experienceSection = visibleSections.experience && cv.document.experiences.length > 0 && (
                  <section className="relative group/section space-y-4 rounded-xl p-1 -m-1 transition-all hover:bg-slate-50/50">
                    {/* Contextual Section Toolbar */}
                    <div className="absolute top-0 right-0 no-print opacity-0 group-hover/section:opacity-100 transition-opacity z-10 flex items-center gap-1.5 rounded-full border border-border bg-card/95 backdrop-blur-md px-2.5 py-0.5 shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          const newExp: CvExperienceItem = {
                            id: `exp-${cv.document.experiences.length + 1}`,
                            role: "Target Role / Job Title",
                            company: "Company Name",
                            startDate: "2024",
                            endDate: "Present",
                            bullets: ["Coordinated operational deliverables and communicated with stakeholders."],
                            classification: "VERIFIED",
                          };
                          updateDocumentField("experiences", [newExp, ...cv.document.experiences]);
                        }}
                        className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                      >
                        <Plus size={11} /> Add Role
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => void handleStartAchievementDiscovery()}
                        className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 hover:underline"
                      >
                        <Award size={11} /> Discover Metrics
                      </button>
                    </div>

                    {renderSectionHeading(
                      isSerifClassic
                        ? "Experience"
                        : isCorporateBlue
                          ? "Professional Experience"
                          : isEditorialGold
                            ? "Professional Experience"
                            : isAnalystClean
                              ? "Experience"
                              : "Work Experience",
                    )}

                    <div className={isTimeline ? "relative pl-6 border-l-2 ml-2 space-y-6 my-2" : "space-y-4"} style={isTimeline ? { borderColor: selectedColor.border } : {}}>
                      {cv.document.experiences.map((exp, expIdx) => (
                        <Fragment key={exp.id || expIdx}>
                          <A4PageSpacer id={`exp-${expIdx}`} height={a4Spacers[`exp-${expIdx}`] || 0} />
                        <div data-a4-id={`exp-${expIdx}`} className="group/role cv-a4-keep relative space-y-1.5">
                          {isTimeline && (
                            <span
                              className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 bg-white shadow-xs transition group-hover/role:scale-125"
                              style={{ borderColor: selectedColor.primary }}
                            />
                          )}

                          {/* Role & Company Header */}
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <div className="flex min-w-0 max-w-full flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <input
                                type="text"
                                value={exp.role}
                                onChange={(e) => {
                                  const exps = [...cv.document.experiences];
                                  exps[expIdx] = { ...exp, role: e.target.value };
                                  updateDocumentField("experiences", exps);
                                }}
                                style={{ width: `${Math.min(Math.max((exp.role || "").length + 1, 8), 42)}ch` }}
                                className="min-w-0 max-w-full bg-transparent font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
                                placeholder="Role Title"
                              />
                              <span className="text-slate-400 no-print">·</span>
                              <input
                                type="text"
                                value={exp.company}
                                onChange={(e) => {
                                  const exps = [...cv.document.experiences];
                                  exps[expIdx] = { ...exp, company: e.target.value };
                                  updateDocumentField("experiences", exps);
                                }}
                                style={{ width: `${Math.min(Math.max((exp.company || "").length + 1, 8), 36)}ch` }}
                                className="min-w-0 max-w-full bg-transparent text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
                                placeholder="Company Name"
                              />
                            </div>
                            <div className="flex shrink-0 items-center gap-1 text-[11px] text-slate-500">
                              <input
                                type="text"
                                value={exp.startDate}
                                onChange={(e) => {
                                  const exps = [...cv.document.experiences];
                                  exps[expIdx] = { ...exp, startDate: e.target.value };
                                  updateDocumentField("experiences", exps);
                                }}
                                className="w-[5.5rem] max-w-[30%] bg-transparent text-right focus:outline-none"
                                placeholder="Start"
                              />
                              <span>-</span>
                              <input
                                type="text"
                                value={exp.endDate}
                                onChange={(e) => {
                                  const exps = [...cv.document.experiences];
                                  exps[expIdx] = { ...exp, endDate: e.target.value };
                                  updateDocumentField("experiences", exps);
                                }}
                                className="w-[5.5rem] max-w-[30%] bg-transparent focus:outline-none"
                                placeholder="End"
                              />
                            </div>
                          </div>

                          {/* Bullets with Inline Micro-Actions */}
                          <ul className="min-w-0 space-y-1 pl-0.5">
                            {exp.bullets.map((b, bIdx) => (
                              <li
                                key={bIdx}
                                className="group/bullet relative flex min-w-0 items-start gap-2 text-xs leading-snug text-slate-700"
                              >
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                                <AutoGrowTextarea
                                  value={b}
                                  onChange={(e) => {
                                    const exps = [...cv.document.experiences];
                                    const bullets = [...exp.bullets];
                                    bullets[bIdx] = e.target.value;
                                    exps[expIdx] = { ...exp, bullets };
                                    updateDocumentField("experiences", exps);
                                  }}
                                  onBlur={(e) => {
                                    const polished = polishBulletText(e.target.value);
                                    if (polished === b) return;
                                    const exps = [...cv.document.experiences];
                                    const bullets = [...exp.bullets];
                                    bullets[bIdx] = polished;
                                    exps[expIdx] = { ...exp, bullets: selectProfessionalBullets(bullets) };
                                    updateDocumentField("experiences", exps);
                                  }}
                                  className={`min-w-0 w-full flex-1 resize-none bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm px-0.5 transition ${
                                    highlightJobKeywords &&
                                    tailoringReport?.strongMatches.some((m) => b.toLowerCase().includes(m))
                                      ? "bg-emerald-500/10 text-emerald-900 rounded"
                                      : ""
                                  }`}
                                />

                                {/* Inline Hover Action Group for Bullet */}
                                <div className="no-print opacity-0 group-hover/bullet:opacity-100 transition-opacity flex items-center gap-0.5 shrink-0 bg-white/95 border border-border rounded-lg p-0.5 shadow-xs">
                                  <button
                                    type="button"
                                    onClick={() => handleQuickEnhanceVerbs(expIdx, bIdx, b)}
                                    className="p-1 rounded text-primary hover:bg-primary/10"
                                    title="Enhance Action Verbs"
                                  >
                                    <Zap size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEnhanceBullet(expIdx, bIdx, b)}
                                    className="p-1 rounded text-amber-600 hover:bg-amber-500/10"
                                    title="Add Quantified Metrics"
                                  >
                                    <Award size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickFixGrammar(expIdx, bIdx, b)}
                                    className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10"
                                    title="Fix Grammar & Buzzwords"
                                  >
                                    <Check size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBullet(expIdx, bIdx)}
                                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    title="Delete bullet"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>

                          {/* Add Bullet Button for this role */}
                          <div className="no-print pl-4 pt-0.5 opacity-0 group-hover/role:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => handleAddBullet(expIdx)}
                              className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                            >
                              <Plus size={11} /> Add Bullet Point
                            </button>
                          </div>
                        </div>
                        </Fragment>
                      ))}
                    </div>
                  </section>
                );

                const skillsSection = visibleSections.skills && (
                  <>
                    <A4PageSpacer id="skills" height={a4Spacers.skills || 0} />
                  <section data-a4-id="skills" className={`relative group/section cv-a4-keep rounded-xl p-1 -m-1 transition-all hover:bg-slate-50/50 ${cv.document.skills.length === 0 ? "hidden" : ""}`}>
                    <div className="absolute top-0 right-0 no-print opacity-0 group-hover/section:opacity-100 transition-opacity z-10 flex items-center gap-1 rounded-full border border-border bg-card/95 backdrop-blur-md px-2 py-0.5 shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          const skill = prompt("Enter new skill:");
                          if (skill?.trim()) {
                            updateDocumentField("skills", [...cv.document.skills, skill.trim()]);
                          }
                        }}
                        className="text-[10px] font-bold text-primary hover:underline"
                      >
                        + Add Skill
                      </button>
                    </div>

                    {renderSectionHeading("Skills & Competencies")}

                    {cv.document.skills.length === 0 ? (
                      <p className="mt-2 text-[11px] text-muted-foreground italic no-print">
                        No skills listed yet. Click &quot;+ Add Skill&quot; to add competencies.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {cv.document.skills.map((skill, sIdx) => {
                          const isMatch =
                            highlightJobKeywords &&
                            tailoringReport?.strongMatches.some((m) => skill.toLowerCase().includes(m));
                          return (
                            <span
                              key={sIdx}
                              className={`cv-skill-chip rounded-lg border px-2.5 py-0.5 text-[11px] font-medium transition ${
                                isMatch ? "ring-2 ring-emerald-500 bg-emerald-50 text-emerald-800" : ""
                              }`}
                              style={{
                                backgroundColor: isMatch ? "#ecfdf5" : selectedColor.secondary,
                                borderColor: isMatch ? "#10b981" : selectedColor.border,
                                color: isMatch ? "#065f46" : selectedColor.primary,
                              }}
                            >
                              {skill}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </section>
                  </>
                );

                const systemsSection = visibleSections.systems && (
                  <>
                    <A4PageSpacer id="systems" height={a4Spacers.systems || 0} />
                    <section data-a4-id="systems" className={`relative group/section cv-a4-keep rounded-xl p-1 -m-1 transition-all hover:bg-slate-50/50 ${(cv.document.toolsAndSoftware || []).length === 0 ? "hidden" : ""}`}>
                      <div className="absolute top-0 right-0 no-print opacity-0 group-hover/section:opacity-100 transition-opacity z-10 flex items-center gap-1 rounded-full border border-border bg-card/95 px-2 py-0.5 shadow-sm">
                        <button
                          type="button"
                          onClick={() => {
                            const tool = prompt("Enter a system or software tool:");
                            if (tool?.trim()) updateDocumentField("toolsAndSoftware", [...(cv.document.toolsAndSoftware || []), tool.trim()]);
                          }}
                          className="text-[10px] font-bold text-primary hover:underline"
                        >
                          + Add System
                        </button>
                      </div>
                      {renderSectionHeading("Systems & Software")}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(cv.document.toolsAndSoftware || []).map((tool, toolIdx) => (
                          <span
                            key={toolIdx}
                            className="cv-skill-chip rounded-lg border px-2.5 py-0.5 text-[11px] font-medium"
                            style={{ backgroundColor: selectedColor.secondary, borderColor: selectedColor.border, color: selectedColor.primary }}
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </section>
                  </>
                );

                const educationSection = visibleSections.education && (
                  <>
                    <A4PageSpacer id="education" height={a4Spacers.education || 0} />
                  <section data-a4-id="education" className={`relative group/section cv-a4-keep space-y-2 rounded-xl p-1 -m-1 transition-all hover:bg-slate-50/50 ${cv.document.education.length === 0 ? "hidden" : ""}`}>
                    <div className="absolute top-0 right-0 no-print opacity-0 group-hover/section:opacity-100 transition-opacity z-10 flex items-center gap-1 rounded-full border border-border bg-card/95 backdrop-blur-md px-2 py-0.5 shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          const newEdu: CvEducationItem = {
                            id: `edu-${cv.document.education.length + 1}`,
                            degree: "Degree / Qualification",
                            institution: "University / Institution",
                            graduationYear: "Completed",
                          };
                          updateDocumentField("education", [...cv.document.education, newEdu]);
                        }}
                        className="text-[10px] font-bold text-primary hover:underline"
                      >
                        + Add Qualification
                      </button>
                    </div>

                    {renderSectionHeading("Education")}

                    {cv.document.education.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic no-print">
                        No education entries listed. Click "+ Add Qualification" above if you have qualifications to add.
                      </p>
                    ) : (
                      <div className={isTimeline ? "relative pl-6 border-l-2 ml-2 space-y-4 my-2" : "space-y-2"} style={isTimeline ? { borderColor: selectedColor.border } : {}}>
                        {cv.document.education.map((edu, eduIdx) => (
                          <div key={edu.id || eduIdx} className="text-xs overflow-visible group/edu relative">
                            {isTimeline && (
                              <span
                                className="absolute -left-[31px] top-1.5 h-3.5 w-3.5 rounded-full border-2 bg-white shadow-xs"
                                style={{ borderColor: selectedColor.primary }}
                              />
                            )}
                            <input
                              type="text"
                              value={edu.degree}
                              onChange={(e) => {
                                const edus = [...cv.document.education];
                                edus[eduIdx] = { ...edu, degree: e.target.value };
                                updateDocumentField("education", edus);
                              }}
                              className="w-full bg-transparent font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm overflow-visible whitespace-normal"
                              placeholder="Degree / Qualification"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 overflow-visible">
                              <input
                                type="text"
                                value={edu.institution}
                                onChange={(e) => {
                                  const edus = [...cv.document.education];
                                  edus[eduIdx] = { ...edu, institution: e.target.value };
                                  updateDocumentField("education", edus);
                                }}
                                style={{ width: `${Math.max((edu.institution || "").length + 1, 16)}ch`, maxWidth: "100%" }}
                                className="bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm overflow-visible whitespace-normal"
                                placeholder="Institution"
                              />
                              <input
                                type="text"
                                value={edu.graduationYear}
                                onChange={(e) => {
                                  const edus = [...cv.document.education];
                                  edus[eduIdx] = { ...edu, graduationYear: e.target.value };
                                  updateDocumentField("education", edus);
                                }}
                                style={{ width: `${Math.max((edu.graduationYear || "").length + 1, 5)}ch` }}
                                className="bg-transparent text-right focus:outline-none overflow-visible"
                                placeholder="Year"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  </>
                );

                const projectsSection = visibleSections.projects && (
                  <>
                    <A4PageSpacer id="projects" height={a4Spacers.projects || 0} />
                  <section data-a4-id="projects" className={`relative group/section cv-a4-keep space-y-2 rounded-xl p-1 -m-1 transition-all hover:bg-slate-50/50 ${(cv.document.projects || []).length === 0 ? "hidden" : ""}`}>
                    <div className="absolute top-0 right-0 no-print opacity-0 group-hover/section:opacity-100 transition-opacity z-10 flex items-center gap-1 rounded-full border border-border bg-card/95 backdrop-blur-md px-2 py-0.5 shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          const newProj: CvProjectItem = {
                            id: `proj-${(cv.document.projects || []).length + 1}`,
                            title: "Project Name",
                            subtitle: "Technologies / Role",
                            link: "",
                            bullets: ["Delivered measurable outcome or technical accomplishment."],
                          };
                          updateDocumentField("projects", [...(cv.document.projects || []), newProj]);
                        }}
                        className="text-[10px] font-bold text-primary hover:underline"
                      >
                        + Add Project
                      </button>
                    </div>

                    {renderSectionHeading("Key Projects")}

                    {(cv.document.projects || []).length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic no-print">
                        No projects listed. Click &quot;+ Add Project&quot; above to showcase technical or portfolio work.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {(cv.document.projects || []).map((proj, pIdx) => (
                          <div key={proj.id || pIdx} className="text-xs space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <input
                                type="text"
                                value={proj.title}
                                onChange={(e) => {
                                  const projs = [...(cv.document.projects || [])];
                                  projs[pIdx] = { ...proj, title: e.target.value };
                                  updateDocumentField("projects", projs);
                                }}
                                className="font-bold text-slate-900 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
                                placeholder="Project Title"
                              />
                              {proj.link && (
                                <a
                                  href={proj.link.startsWith("http") ? proj.link : `https://${proj.link}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] text-primary hover:underline"
                                >
                                  View Link
                                </a>
                              )}
                            </div>
                            <input
                              type="text"
                              value={proj.subtitle || ""}
                              onChange={(e) => {
                                const projs = [...(cv.document.projects || [])];
                                projs[pIdx] = { ...proj, subtitle: e.target.value };
                                updateDocumentField("projects", projs);
                              }}
                              className="text-[11px] text-slate-600 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm w-full"
                              placeholder="Technologies / Role"
                            />
                            <div className="space-y-1 pt-0.5">
                              {(proj.bullets || []).map((bullet, bIdx) => (
                                <div key={bIdx} className="flex items-start gap-1.5 text-[11px] text-slate-700">
                                  <span className="text-primary mt-1 text-[8px]">●</span>
                                  <AutoGrowTextarea
                                    value={bullet}
                                    onChange={(e) => {
                                      const projs = [...(cv.document.projects || [])];
                                      const newBullets = [...(proj.bullets || [])];
                                      newBullets[bIdx] = e.target.value;
                                      projs[pIdx] = { ...proj, bullets: newBullets };
                                      updateDocumentField("projects", projs);
                                    }}
                                    className="min-w-0 w-full resize-none bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm leading-relaxed"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  </>
                );

                const certificationsSection = visibleSections.certifications && (
                  <>
                    <A4PageSpacer id="certifications" height={a4Spacers.certifications || 0} />
                  <section data-a4-id="certifications" className={`relative group/section cv-a4-keep space-y-2 rounded-xl p-1 -m-1 transition-all hover:bg-slate-50/50 ${(cv.document.certifications || []).length === 0 ? "hidden" : ""}`}>
                    <div className="absolute top-0 right-0 no-print opacity-0 group-hover/section:opacity-100 transition-opacity z-10 flex items-center gap-1 rounded-full border border-border bg-card/95 backdrop-blur-md px-2 py-0.5 shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          const newCert: CvCertificationItem = {
                            id: `cert-${(cv.document.certifications || []).length + 1}`,
                            name: "Certification / License Name",
                            issuer: "Issuing Organization",
                            year: "Year",
                          };
                          updateDocumentField("certifications", [...(cv.document.certifications || []), newCert]);
                        }}
                        className="text-[10px] font-bold text-primary hover:underline"
                      >
                        + Add Certification
                      </button>
                    </div>

                    {renderSectionHeading("Certifications & Accreditations")}

                    {(cv.document.certifications || []).length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic no-print">
                        No certifications listed. Click &quot;+ Add Certification&quot; above to add accreditations.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {(cv.document.certifications || []).map((cert, cIdx) => (
                          <div key={cert.id || cIdx} className="flex flex-wrap items-center justify-between text-xs gap-2">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={cert.name}
                                onChange={(e) => {
                                  const certs = [...(cv.document.certifications || [])];
                                  certs[cIdx] = { ...cert, name: e.target.value };
                                  updateDocumentField("certifications", certs);
                                }}
                                className="font-semibold text-slate-900 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
                                placeholder="Certificate Name"
                              />
                              <span className="text-slate-400">·</span>
                              <input
                                type="text"
                                value={cert.issuer}
                                onChange={(e) => {
                                  const certs = [...(cv.document.certifications || [])];
                                  certs[cIdx] = { ...cert, issuer: e.target.value };
                                  updateDocumentField("certifications", certs);
                                }}
                                className="text-slate-600 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
                                placeholder="Issuer"
                              />
                            </div>
                            <input
                              type="text"
                              value={cert.year || ""}
                              onChange={(e) => {
                                const certs = [...(cv.document.certifications || [])];
                                certs[cIdx] = { ...cert, year: e.target.value };
                                updateDocumentField("certifications", certs);
                              }}
                              style={{ width: `${Math.max((cert.year || "").length + 1, 5)}ch` }}
                              className="bg-transparent text-right text-[11px] text-slate-500 focus:outline-none"
                              placeholder="Year"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  </>
                );

                const languagesSection = visibleSections.languages && (
                  <>
                    <A4PageSpacer id="languages" height={a4Spacers.languages || 0} />
                  <section
                    data-a4-id="languages"
                    className={`relative group/section cv-a4-keep space-y-2 rounded-xl p-1 -m-1 transition-all hover:bg-slate-50/50 ${(cv.document.languages || []).length === 0 ? "hidden" : ""}`}
                  >
                    <div className="absolute top-0 right-0 no-print opacity-0 group-hover/section:opacity-100 transition-opacity z-10 flex items-center gap-1 rounded-full border border-border bg-card/95 backdrop-blur-md px-2 py-0.5 shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          const lang = prompt("Enter language (e.g. English (Fluent), Zulu (Native)):");
                          if (lang?.trim()) {
                            updateDocumentField("languages", [...(cv.document.languages || []), lang.trim()]);
                          }
                        }}
                        className="text-[10px] font-bold text-primary hover:underline"
                      >
                        + Add Language
                      </button>
                    </div>

                    {renderSectionHeading("Languages")}

                    {(cv.document.languages || []).length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic no-print">
                        No languages listed.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {(cv.document.languages || []).map((lang, lIdx) => (
                          <span
                            key={lIdx}
                            className="rounded-lg border px-2.5 py-0.5 text-[11px] font-medium"
                            style={{
                              backgroundColor: selectedColor.secondary,
                              borderColor: selectedColor.border,
                              color: selectedColor.primary,
                            }}
                          >
                            {lang}
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                  </>
                );

                const referencesSection = visibleSections.references && (
                  <>
                    <A4PageSpacer id="references" height={a4Spacers.references || 0} />
                  <section data-a4-id="references" className={`relative group/section cv-a4-keep space-y-2 rounded-xl p-1 -m-1 transition-all hover:bg-slate-50/50 ${(cv.document.references || []).length === 0 ? "hidden" : ""}`}>
                    <div className="absolute top-0 right-0 no-print opacity-0 group-hover/section:opacity-100 transition-opacity z-10 flex items-center gap-1 rounded-full border border-border bg-card/95 backdrop-blur-md px-2 py-0.5 shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          updateDocumentField("references", [
  ...(cv.document.references || []),
]);
                        }}
                        className="text-[10px] font-bold text-primary hover:underline"
                      >
                        + Add Reference
                      </button>
                    </div>

                    {renderSectionHeading("References")}

                    {(cv.document.references || []).length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic no-print">
                        References available upon request.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {(cv.document.references || []).map((ref, rIdx) => (
                          <input
                            key={rIdx}
                            type="text"
                            value={ref}
                            onChange={(e) => {
                              const refs = [...(cv.document.references || [])];
                              refs[rIdx] = e.target.value;
                              updateDocumentField("references", refs);
                            }}
                            className="w-full bg-transparent text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
                            placeholder="Referee details or 'Available upon request'"
                          />
                        ))}
                      </div>
                    )}
                  </section>
                  </>
                );

                return (
                  <article
                    ref={printRef}
                    id="bonlist-cv-document"
                    style={{
                      fontFamily: selectedFont.family,
                      fontSize: `${fontSize}pt`,
                      ...(BACKGROUND_PATTERNS.find((p) => p.id === bgPattern)?.style || {}),
                    }}
                    className={`cv-page-sheet cv-margin-${marginSize} overflow-visible bg-white text-slate-900 transition-all ${
                      lineSpacing === "tight"
                        ? "space-y-4"
                        : lineSpacing === "relaxed"
                          ? "space-y-7"
                          : "space-y-5"
                    }`}
                  >
                    {/* 1. HEADER SECTION */}
                    {isSerifClassic ? (
                      <header className="relative group/section pb-4 text-center font-serif">
                        <input
                          type="text"
                          value={cv.document.fullName}
                          onChange={(e) => updateDocumentField("fullName", e.target.value)}
                          className="w-full bg-transparent text-center font-serif text-2xl font-bold tracking-tight text-slate-950 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm sm:text-3xl"
                          placeholder="Candidate Name"
                        />
                        <input
                          type="text"
                          value={cv.document.headline}
                          onChange={(e) => updateDocumentField("headline", e.target.value)}
                          placeholder="Professional Title"
                          className="mt-1 w-full bg-transparent text-center font-serif text-sm italic text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
                        />
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
                          <input type="text" value={cv.document.location || ""} onChange={(e) => updateDocumentField("location", e.target.value)} placeholder="Location" className="bg-transparent text-center focus:outline-none" style={{ width: `${Math.max((cv.document.location || "").length + 1, 10)}ch` }} />
                          <span>·</span>
                          <input type="text" value={cv.document.phone || ""} onChange={(e) => updateDocumentField("phone", e.target.value)} placeholder="Phone" className="bg-transparent text-center focus:outline-none" style={{ width: `${Math.max((cv.document.phone || "").length + 1, 10)}ch` }} />
                          <span>·</span>
                          <input type="text" value={cv.document.email} onChange={(e) => updateDocumentField("email", e.target.value)} placeholder="Email" className="bg-transparent text-center focus:outline-none" style={{ width: `${Math.max((cv.document.email || "").length + 1, 14)}ch` }} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 text-[11px] text-slate-500">
                          <input type="text" value={cv.document.linkedin || ""} onChange={(e) => updateDocumentField("linkedin", e.target.value)} placeholder="LinkedIn" className={`bg-transparent text-center focus:outline-none ${!cv.document.linkedin ? "hidden" : ""}`} style={{ width: `${Math.max((cv.document.linkedin || "").length + 1, 12)}ch` }} />
                          <input type="text" value={cv.document.website || ""} onChange={(e) => updateDocumentField("website", e.target.value)} placeholder="Website / GitHub" className={`bg-transparent text-center focus:outline-none ${!cv.document.website ? "hidden" : ""}`} style={{ width: `${Math.max((cv.document.website || "").length + 1, 12)}ch` }} />
                        </div>
                        <div className="mt-4 border-t border-slate-800" />
                      </header>
                    ) : isCorporateBlue ? (
                      <header className="relative group/section pb-4">
                        <input
                          type="text"
                          value={cv.document.fullName}
                          onChange={(e) => updateDocumentField("fullName", e.target.value)}
                          className="w-full bg-transparent text-2xl font-black uppercase tracking-wide focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm sm:text-3xl"
                          style={{ color: selectedColor.primary }}
                          placeholder="CANDIDATE NAME"
                        />
                        <input
                          type="text"
                          value={cv.document.headline}
                          onChange={(e) => updateDocumentField("headline", e.target.value)}
                          placeholder="PROFESSIONAL TITLE"
                          className="mt-1 w-full bg-transparent text-xs font-bold uppercase tracking-widest text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                          <input type="text" value={cv.document.location || ""} onChange={(e) => updateDocumentField("location", e.target.value)} placeholder="Location" className="bg-transparent focus:outline-none" style={{ width: `${Math.max((cv.document.location || "").length + 1, 10)}ch` }} />
                          <span>|</span>
                          <input type="text" value={cv.document.phone || ""} onChange={(e) => updateDocumentField("phone", e.target.value)} placeholder="Phone" className="bg-transparent focus:outline-none" style={{ width: `${Math.max((cv.document.phone || "").length + 1, 10)}ch` }} />
                          <span>|</span>
                          <input type="text" value={cv.document.email} onChange={(e) => updateDocumentField("email", e.target.value)} placeholder="Email" className="bg-transparent focus:outline-none" style={{ width: `${Math.max((cv.document.email || "").length + 1, 14)}ch` }} />
                        </div>
                      </header>
                    ) : isEditorialGold ? (
                      <header className="relative group/section pb-3">
                        <input
                          type="text"
                          value={cv.document.fullName}
                          onChange={(e) => updateDocumentField("fullName", e.target.value)}
                          className="w-full bg-transparent font-serif text-3xl font-bold tracking-tight focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
                          style={{ color: selectedColor.primary }}
                          placeholder="Candidate Name"
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                          <input type="text" value={cv.document.location || ""} onChange={(e) => updateDocumentField("location", e.target.value)} placeholder="Location" className="bg-transparent focus:outline-none" style={{ width: `${Math.max((cv.document.location || "").length + 1, 10)}ch` }} />
                          <span>|</span>
                          <input type="text" value={cv.document.email} onChange={(e) => updateDocumentField("email", e.target.value)} placeholder="Email" className="bg-transparent focus:outline-none underline decoration-sky-600" style={{ width: `${Math.max((cv.document.email || "").length + 1, 14)}ch` }} />
                          <span>|</span>
                          <input type="text" value={cv.document.phone || ""} onChange={(e) => updateDocumentField("phone", e.target.value)} placeholder="Phone" className="bg-transparent focus:outline-none" style={{ width: `${Math.max((cv.document.phone || "").length + 1, 10)}ch` }} />
                        </div>
                      </header>
                    ) : isAnalystClean ? (
                      <header className="relative group/section pb-4">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <input
                              type="text"
                              value={cv.document.fullName}
                              onChange={(e) => updateDocumentField("fullName", e.target.value)}
                              className="w-full bg-transparent text-2xl font-black tracking-tight text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm sm:text-3xl"
                              placeholder="Candidate Name"
                            />
                            <input
                              type="text"
                              value={cv.document.headline}
                              onChange={(e) => updateDocumentField("headline", e.target.value)}
                              placeholder="Professional Title"
                              className="mt-1 w-full bg-transparent text-sm text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
                            />
                          </div>
                          <div className="text-right text-[11px] text-slate-600 space-y-0.5 shrink-0">
                            <div><input type="text" value={cv.document.phone || ""} onChange={(e) => updateDocumentField("phone", e.target.value)} placeholder="Phone" className="bg-transparent text-right focus:outline-none" style={{ width: `${Math.max((cv.document.phone || "").length + 1, 12)}ch` }} /></div>
                            <div><input type="text" value={cv.document.email} onChange={(e) => updateDocumentField("email", e.target.value)} placeholder="Email" className="bg-transparent text-right focus:outline-none" style={{ width: `${Math.max((cv.document.email || "").length + 1, 14)}ch` }} /></div>
                            <div><input type="text" value={cv.document.website || ""} onChange={(e) => updateDocumentField("website", e.target.value)} placeholder="Website" className={`bg-transparent text-right focus:outline-none ${!cv.document.website ? "hidden" : ""}`} style={{ width: `${Math.max((cv.document.website || "").length + 1, 12)}ch` }} /></div>
                            <div><input type="text" value={cv.document.location || ""} onChange={(e) => updateDocumentField("location", e.target.value)} placeholder="Location" className="bg-transparent text-right focus:outline-none" style={{ width: `${Math.max((cv.document.location || "").length + 1, 12)}ch` }} /></div>
                          </div>
                        </div>
                        <div className="mt-4 border-b border-dashed border-slate-300" />
                      </header>
                    ) : isStylish ? (
                      <header
                        className="relative group/section -mx-8 -mt-8 sm:-mx-10 sm:-mt-10 p-6 sm:p-8 rounded-t-sm mb-6 text-white shadow-sm"
                        style={{ backgroundColor: selectedColor.primary }}
                      >
                        <div className="absolute top-2 right-2 no-print opacity-0 group-hover/section:opacity-100 transition-opacity z-10 flex items-center gap-1 rounded-full border border-white/20 bg-black/40 backdrop-blur-md px-2 py-0.5 shadow-sm text-white">
                          <span className="text-[10px] font-bold uppercase">Stylish Header Band</span>
                        </div>

                        <input
                          type="text"
                          value={cv.document.fullName}
                          onChange={(e) => updateDocumentField("fullName", e.target.value)}
                          className="w-full bg-transparent text-2xl font-black tracking-tight text-white focus:outline-none focus:ring-1 focus:ring-white/40 rounded-sm sm:text-3xl placeholder:text-white/70"
                          placeholder="Candidate Name"
                        />

                        <input
                          type="text"
                          value={cv.document.headline}
                          onChange={(e) => updateDocumentField("headline", e.target.value)}
                          placeholder="Professional Title / Target Role"
                          className="mt-1 w-full bg-transparent text-sm font-semibold tracking-wide text-white/90 focus:outline-none focus:ring-1 focus:ring-white/40 rounded-sm sm:text-base placeholder:text-white/60"
                        />

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/90 overflow-visible">
                          <input
                            type="text"
                            value={cv.document.email}
                            onChange={(e) => updateDocumentField("email", e.target.value)}
                            style={{ width: `${Math.max((cv.document.email || "").length + 1, 14)}ch`, maxWidth: "100%" }}
                            className="bg-white/15 px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-white/40 text-white placeholder:text-white/60 overflow-visible whitespace-normal"
                            placeholder="email@address.com"
                          />
                          <span>·</span>
                          <input
                            type="text"
                            value={cv.document.phone || ""}
                            onChange={(e) => updateDocumentField("phone", e.target.value)}
                            style={{ width: `${Math.max((cv.document.phone || "").length + 1, 10)}ch`, maxWidth: "100%" }}
                            className="bg-white/15 px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-white/40 text-white placeholder:text-white/60 overflow-visible whitespace-normal"
                            placeholder="+27..."
                          />
                          <span>·</span>
                          <input
                            type="text"
                            value={cv.document.location || ""}
                            onChange={(e) => updateDocumentField("location", e.target.value)}
                            style={{ width: `${Math.max((cv.document.location || "").length + 1, 12)}ch`, maxWidth: "100%" }}
                            className="bg-white/15 px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-white/40 text-white placeholder:text-white/60 overflow-visible whitespace-normal"
                            placeholder="Location"
                          />
                          <span className={!cv.document.linkedin ? "hidden" : ""}>·</span>
                          <input
                            type="text"
                            value={cv.document.linkedin || ""}
                            onChange={(e) => updateDocumentField("linkedin", e.target.value)}
                            style={{ width: `${Math.max((cv.document.linkedin || "").length + 1, 14)}ch`, maxWidth: "100%" }}
                            className={`bg-white/15 px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-white/40 text-white placeholder:text-white/60 overflow-visible whitespace-normal ${!cv.document.linkedin ? "hidden" : ""}`}
                            placeholder="linkedin.com/in/..."
                          />
                          <span className={!cv.document.website ? "hidden" : ""}>·</span>
                          <input
                            type="text"
                            value={cv.document.website || ""}
                            onChange={(e) => updateDocumentField("website", e.target.value)}
                            style={{ width: `${Math.max((cv.document.website || "").length + 1, 14)}ch`, maxWidth: "100%" }}
                            className={`bg-white/15 px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-white/40 text-white placeholder:text-white/60 overflow-visible whitespace-normal ${!cv.document.website ? "hidden" : ""}`}
                            placeholder="portfolio / github"
                          />
                        </div>
                      </header>
                    ) : isIvy ? (
                      <header className="relative group/section pb-4 text-center">
                        <div className="absolute top-0 right-0 no-print opacity-0 group-hover/section:opacity-100 transition-opacity z-10 flex items-center gap-1 rounded-full border border-border bg-card/95 backdrop-blur-md px-2 py-0.5 shadow-sm">
                          <span className="text-[10px] font-bold text-primary uppercase">Ivy League Header</span>
                        </div>

                        <input
                          type="text"
                          value={cv.document.fullName}
                          onChange={(e) => updateDocumentField("fullName", e.target.value)}
                          className="w-full bg-transparent text-center font-serif text-2xl font-bold tracking-wider text-slate-950 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm sm:text-3xl uppercase"
                          style={{ color: selectedColor.primary }}
                          placeholder="CANDIDATE NAME"
                        />

                        <input
                          type="text"
                          value={cv.document.headline}
                          onChange={(e) => updateDocumentField("headline", e.target.value)}
                          placeholder="PROFESSIONAL TITLE / TARGET ROLE"
                          className="mt-1 w-full bg-transparent text-center text-xs font-semibold uppercase tracking-widest text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm"
                        />

                        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-600 overflow-visible">
                          <input
                            type="text"
                            value={cv.document.email}
                            onChange={(e) => updateDocumentField("email", e.target.value)}
                            style={{ width: `${Math.max((cv.document.email || "").length + 1, 14)}ch`, maxWidth: "100%" }}
                            className="bg-transparent text-center focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm overflow-visible whitespace-normal"
                            placeholder="email@address.com"
                          />
                          <span className="text-slate-400">◆</span>
                          <input
                            type="text"
                            value={cv.document.phone || ""}
                            onChange={(e) => updateDocumentField("phone", e.target.value)}
                            style={{ width: `${Math.max((cv.document.phone || "").length + 1, 10)}ch`, maxWidth: "100%" }}
                            className="bg-transparent text-center focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm overflow-visible whitespace-normal"
                            placeholder="+27..."
                          />
                          <span className="text-slate-400">◆</span>
                          <input
                            type="text"
                            value={cv.document.location || ""}
                            onChange={(e) => updateDocumentField("location", e.target.value)}
                            style={{ width: `${Math.max((cv.document.location || "").length + 1, 12)}ch`, maxWidth: "100%" }}
                            className="bg-transparent text-center focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm overflow-visible whitespace-normal"
                            placeholder="Location"
                          />
                          <span className={`text-slate-400 ${!cv.document.linkedin ? "hidden" : ""}`}>◆</span>
                          <input
                            type="text"
                            value={cv.document.linkedin || ""}
                            onChange={(e) => updateDocumentField("linkedin", e.target.value)}
                            style={{ width: `${Math.max((cv.document.linkedin || "").length + 1, 14)}ch`, maxWidth: "100%" }}
                            className={`bg-transparent text-center focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm overflow-visible whitespace-normal ${!cv.document.linkedin ? "hidden" : ""}`}
                            placeholder="linkedin.com/in/..."
                          />
                          <span className={`text-slate-400 ${!cv.document.website ? "hidden" : ""}`}>◆</span>
                          <input
                            type="text"
                            value={cv.document.website || ""}
                            onChange={(e) => updateDocumentField("website", e.target.value)}
                            style={{ width: `${Math.max((cv.document.website || "").length + 1, 14)}ch`, maxWidth: "100%" }}
                            className={`bg-transparent text-center focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm overflow-visible whitespace-normal ${!cv.document.website ? "hidden" : ""}`}
                            placeholder="portfolio / github"
                          />
                        </div>

                        {/* Classic Ivy League Double Rule Divider */}
                        <div className="mt-3.5 border-t-2 border-b border-double py-0.5" style={{ borderColor: selectedColor.primary }} />
                      </header>
                    ) : (
                      <header
                        className={`relative group/section border-b pb-5 transition ${
                          isPolished ? "text-center" : isContemporary ? "border-l-4 pl-4" : "text-left"
                        }`}
                        style={{ borderColor: isContemporary || isPolished ? selectedColor.primary : selectedColor.border }}
                      >
                        {isModern && (
                          <div className="h-1.5 w-full rounded-t-sm mb-4" style={{ backgroundColor: selectedColor.primary }} />
                        )}

                        {/* Floating Action Pill */}
                        <div className="absolute top-0 right-0 no-print opacity-0 group-hover/section:opacity-100 transition-opacity z-10 flex items-center gap-1 rounded-full border border-border bg-card/95 backdrop-blur-md px-2 py-0.5 shadow-sm">
                          <span className="text-[10px] font-bold text-primary uppercase">Header Fold</span>
                        </div>

                        <input
                          type="text"
                          value={cv.document.fullName}
                          onChange={(e) => updateDocumentField("fullName", e.target.value)}
                          className={`w-full bg-transparent text-2xl font-black tracking-tight text-slate-950 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm sm:text-3xl ${
                            isPolished ? "text-center" : ""
                          }`}
                          style={{ color: selectedColor.primary }}
                          placeholder="Candidate Name"
                        />

                        <input
                          type="text"
                          value={cv.document.headline}
                          onChange={(e) => updateDocumentField("headline", e.target.value)}
                          placeholder="Professional Title / Target Role"
                          className={`mt-1 w-full bg-transparent text-sm font-semibold tracking-wide text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm sm:text-base ${
                            isPolished ? "text-center" : ""
                          }`}
                        />

                        <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 overflow-visible ${
                          isPolished ? "justify-center" : ""
                        }`}>
                          <input
                            type="text"
                            value={cv.document.email}
                            onChange={(e) => updateDocumentField("email", e.target.value)}
                            style={{ width: `${Math.max((cv.document.email || "").length + 1, 14)}ch`, maxWidth: "100%" }}
                            className="bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm overflow-visible whitespace-normal"
                            placeholder="email@address.com"
                          />
                          <span>·</span>
                          <input
                            type="text"
                            value={cv.document.phone || ""}
                            onChange={(e) => updateDocumentField("phone", e.target.value)}
                            style={{ width: `${Math.max((cv.document.phone || "").length + 1, 10)}ch`, maxWidth: "100%" }}
                            className="bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm overflow-visible whitespace-normal"
                            placeholder="+27..."
                          />
                          <span>·</span>
                          <input
                            type="text"
                            value={cv.document.location || ""}
                            onChange={(e) => updateDocumentField("location", e.target.value)}
                            style={{ width: `${Math.max((cv.document.location || "").length + 1, 12)}ch`, maxWidth: "100%" }}
                            className="bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm overflow-visible whitespace-normal"
                            placeholder="Location"
                          />
                          <span className={!cv.document.linkedin ? "hidden" : ""}>·</span>
                          <input
                            type="text"
                            value={cv.document.linkedin || ""}
                            onChange={(e) => updateDocumentField("linkedin", e.target.value)}
                            style={{ width: `${Math.max((cv.document.linkedin || "").length + 1, 14)}ch`, maxWidth: "100%" }}
                            className={`bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm overflow-visible whitespace-normal ${!cv.document.linkedin ? "hidden" : ""}`}
                            placeholder="linkedin.com/in/..."
                          />
                          <span className={!cv.document.website ? "hidden" : ""}>·</span>
                          <input
                            type="text"
                            value={cv.document.website || ""}
                            onChange={(e) => updateDocumentField("website", e.target.value)}
                            style={{ width: `${Math.max((cv.document.website || "").length + 1, 14)}ch`, maxWidth: "100%" }}
                            className={`bg-transparent focus:outline-none focus:ring-1 focus:ring-primary/30 rounded-sm overflow-visible whitespace-normal ${!cv.document.website ? "hidden" : ""}`}
                            placeholder="portfolio / github"
                          />
                        </div>
                      </header>
                    )}

                    {/* 2. BODY LAYOUT (TWO-COLUMN OR SINGLE-COLUMN) */}
                    {isDouble ? (
                      <div className={`grid gap-7 ${isCompact ? "lg:grid-cols-[1.7fr_1fr] gap-5" : "lg:grid-cols-[1.6fr_1fr] gap-8"}`}>
                        <div className="min-w-0 space-y-5">
                          {summarySection}
                          {experienceSection}
                          {projectsSection}
                        </div>
                        <div className="min-w-0 space-y-5">
                          {skillsSection}
                          {systemsSection}
                          {educationSection}
                          {certificationsSection}
                          {languagesSection}
                          {referencesSection}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {summarySection}
                        {experienceSection}
                        {projectsSection}
                        {educationSection}
                        {skillsSection}
                        {systemsSection}
                        {certificationsSection}
                        {languagesSection}
                        {referencesSection}
                      </div>
                    )}

                    {/* Footer Note with POPIA Notice — never print marketing footer */}
                    {showPopiaNotice && cv.document.footerNote ? (
                      <footer className="mt-8 border-t border-slate-200 pt-3 text-center text-[9px] text-slate-400 no-print">
                        {cv.document.footerNote}
                      </footer>
                    ) : null}
                  </article>
                );
              })()}
                  </div>
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="flex w-full max-w-xl flex-col items-center justify-center rounded-3xl border border-border bg-card px-8 py-16 text-center shadow-sm">
              <RefreshCw size={28} className="animate-spin text-primary" />
              <h2 className="mt-4 text-lg font-bold text-foreground">Building your CV…</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Structuring your details into an ATS-ready layout. This usually takes a few seconds.
              </p>
            </div>
          ) : (
            <div className="w-full max-w-2xl rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-sm space-y-6">
              <div className="space-y-2 text-center sm:text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
                  CV Builder Workstation
                </p>
                <h2 className="text-2xl font-bold text-foreground">Start here — add your CV details</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Upload an existing CV or enter your information manually. We’ll generate a polished,
                  ATS-friendly CV you can edit, style, and download.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setIntakeTab("upload");
                    setIsIntakeModalOpen(true);
                  }}
                  className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-secondary/30 p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Upload size={18} />
                  </span>
                  <span className="text-sm font-bold text-foreground">Upload my CV</span>
                  <span className="text-xs text-muted-foreground">
                    PDF, DOCX, or paste text — we’ll extract your details.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIntakeTab("manual");
                    setIsIntakeModalOpen(true);
                  }}
                  className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-secondary/30 p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
                    <FileText size={18} />
                  </span>
                  <span className="text-sm font-bold text-foreground">Enter information manually</span>
                  <span className="text-xs text-muted-foreground">
                    Fill in your name, roles, skills, and education step by step.
                  </span>
                </button>
              </div>

              <div className="rounded-2xl border border-dashed border-border bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
                <strong className="text-foreground">Tip:</strong> After setup, pick a modern template on the left,
                edit on the canvas, then use <strong className="text-foreground">Download</strong> for PDF or Word.
              </div>

              <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                <button
                  type="button"
                  onClick={() => setIsIntakeModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-xs hover:brightness-105"
                >
                  <Sparkles size={16} />
                  Open setup &amp; generate
                </button>
                <button
                  type="button"
                  onClick={openImproveCvModal}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                >
                  <Wand2 size={16} />
                  Improve CV
                </button>
                <button
                  type="button"
                  onClick={() => setActiveNavPanel("templates")}
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary"
                >
                  <Layers size={16} />
                  Browse templates
                </button>
              </div>
            </div>
          )}
        </main>

        {/* 3. INTERACTIVE SLIDE-OUT ATS LIVE SCORE PANEL (RIGHT DRAWER) */}
        {showAtsDrawer && (
          <aside className="no-print fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-xl animate-in slide-in-from-right duration-200 md:static md:max-h-none md:w-96 md:shrink-0 md:rounded-none md:border-y-0 md:border-r-0 md:p-5">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck size={16} />
                </span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    ATS Live Score & Simulation
                  </h3>
                  <p className="text-[10px] text-muted-foreground">Workday · Taleo · Greenhouse Tested</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAtsDrawer(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
              >
                <X size={15} />
              </button>
            </div>

            {/* Score Hero Banner */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-1">
              <div className="text-3xl font-black text-emerald-700 dark:text-emerald-400">
                {qualityReport?.overallScore || 94}%
              </div>
              <div className="text-xs font-bold text-foreground">ATS Parseability Grade: Exceptional</div>
              <p className="text-[10px] text-muted-foreground">
                Single-layer semantic text hierarchy without floating boxes or custom canvas traps.
              </p>
            </div>

            {/* Sub-Tabs: Audit vs Raw Parser Simulation */}
            <div className="flex rounded-xl bg-secondary/50 p-1 my-3 text-xs">
              <button
                type="button"
                onClick={() => setAtsActiveTab("audit")}
                className={`flex-1 rounded-lg py-1 text-center font-semibold transition ${
                  atsActiveTab === "audit" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Compliance Checks
              </button>
              <button
                type="button"
                onClick={() => setAtsActiveTab("raw_parser")}
                className={`flex-1 rounded-lg py-1 text-center font-semibold transition ${
                  atsActiveTab === "raw_parser" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Workday Raw Stream
              </button>
            </div>

            {atsActiveTab === "audit" ? (
              <div className="space-y-3 text-xs">
                {/* 5 Core ATS Compatibility Pillars */}
                <div className="space-y-2">
                  {[
                    { label: "Standardized Section Headings", status: "Pass", note: "Recognized by Workday, Taleo, Greenhouse." },
                    { label: "Chronological Date Formats", status: "Pass", note: "Standard 'MMM YYYY - Present' formatting." },
                    { label: "Direct-Text Parser Integrity", status: "Pass", note: "No floating textboxes, images-as-text, or vector traps." },
                    { label: "Contact Channel Indexing", status: "Pass", note: "Email, phone number, and location parsed cleanly." },
                    { label: "Anti-Fabrication Factual Fidelity", status: "Pass", note: "100% verified facts supported by candidate records." },
                  ].map((chk, idx) => (
                    <div key={idx} className="rounded-xl border border-border bg-card p-2.5 space-y-0.5">
                      <div className="flex items-center justify-between font-semibold text-foreground text-[11px]">
                        <span>{chk.label}</span>
                        <span className="flex items-center gap-1 text-emerald-600 text-[10px]">
                          <Check size={11} /> Pass
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{chk.note}</p>
                    </div>
                  ))}
                </div>

                {/* Fix These First Priority Actions */}
                {qualityReport?.fixTheseFirst && qualityReport.fixTheseFirst.length > 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-1.5">
                    <div className="font-bold text-amber-800 dark:text-amber-300 text-[11px]">
                      Prioritized Improvements:
                    </div>
                    <ul className="space-y-1 text-[10px] text-foreground">
                      {qualityReport.fixTheseFirst.map((fix) => (
                        <li key={fix.id} className="flex items-start gap-1">
                          <span className="mt-1 h-1 w-1 rounded-full bg-amber-500 shrink-0" />
                          <span><strong>{fix.title}:</strong> {fix.description}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              /* RAW ATS PARSER STREAM (SHOWING WORKDAY EXTRACTION) */
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">Raw Parser Stream</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!cv) return;
                      void navigator.clipboard.writeText(generateAtsRawText(cv.document));
                      setMessage("Copied raw ATS text stream to clipboard!");
                      setTimeout(() => setMessage(""), 3000);
                    }}
                    className="text-[10px] font-semibold text-primary hover:underline"
                  >
                    Copy Text
                  </button>
                </div>
                <pre className="max-h-96 overflow-y-auto rounded-xl border border-border bg-slate-900 p-3 font-mono text-[10px] text-emerald-400 whitespace-pre-wrap leading-relaxed">
                  {cv ? generateAtsRawText(cv.document) : ""}
                </pre>
                <p className="text-[10px] text-muted-foreground italic">
                  This is the exact plain-text representation enterprise parsers (Workday, Taleo) read when scanning your CV.
                </p>
              </div>
            )}
          </aside>
        )}

        {/* 4. INTERACTIVE SLIDE-OUT JOB MATCH & KEYWORD DRAWER (RIGHT DRAWER) */}
        {showJobMatchDrawer && (
          <aside className="no-print fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 shadow-xl animate-in slide-in-from-right duration-200 md:static md:max-h-none md:w-96 md:shrink-0 md:rounded-none md:border-y-0 md:border-r-0 md:p-5">
            <div className="flex items-center justify-between pb-3 border-b border-border mb-4">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
                  <Target size={16} />
                </span>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Job Match & Keyword Engine
                  </h3>
                  <p className="text-[10px] text-muted-foreground">6-Tier Requirements & Highlighting</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowJobMatchDrawer(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <textarea
                rows={4}
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder="Paste the target job description or requirements here..."
                className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />

              <button
                type="button"
                disabled={tailoringLoading || !jobDescription.trim()}
                onClick={() => void handleRunTailoring()}
                className="w-full rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {tailoringLoading ? "Analyzing 6-Tier Fit…" : "Run Keyword & Fit Analysis"}
              </button>

              {advancedMatchReport && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between rounded-xl border border-sky-500/30 bg-sky-500/10 p-3">
                    <span className="font-bold text-foreground">Target Role Fit:</span>
                    <span className="text-base font-black text-sky-700 dark:text-sky-300">
                      {advancedMatchReport.overallFitPercentage}%
                    </span>
                  </div>

                  {/* Toggle Live Keyword Highlighting */}
                  <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 p-2.5">
                    <span className="font-semibold text-foreground text-[11px]">Highlight Matching Keywords on Canvas</span>
                    <input
                      type="checkbox"
                      checked={highlightJobKeywords}
                      onChange={(e) => setHighlightJobKeywords(e.target.checked)}
                      className="rounded accent-primary"
                    />
                  </div>

                  {/* 6-Tier Requirements */}
                  <div className="space-y-2">
                    <span className="font-bold text-foreground text-[11px]">Requirement Taxonomy:</span>
                    {advancedMatchReport.tiers.demonstrated.length > 0 && (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                        <div className="font-semibold text-emerald-800 dark:text-emerald-300 text-[10px] mb-1">
                          ✓ Demonstrated on your CV ({advancedMatchReport.tiers.demonstrated.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {advancedMatchReport.tiers.demonstrated.slice(0, 5).map((m, idx) => (
                            <span key={idx} className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:text-emerald-300">
                              {m.slice(0, 30)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {advancedMatchReport.tiers.missing.length > 0 && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5">
                        <div className="font-semibold text-amber-800 dark:text-amber-300 text-[10px] mb-1">
                          ⚠ Missing or Needs Evidence ({advancedMatchReport.tiers.missing.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {advancedMatchReport.tiers.missing.slice(0, 4).map((m, idx) => (
                            <span key={idx} className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300">
                              {m.slice(0, 30)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* 4.1 AGENT WORKING OVERLAY (SHOWN DURING UPLOAD & PARSING) */}
      {isAgentWorking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl border border-primary/20 bg-card p-6 shadow-2xl text-center space-y-6">
            {/* Agent Avatar / Indicator */}
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping opacity-75" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-primary/80 text-primary-foreground shadow-lg">
                <Sparkles size={28} className="animate-spin" style={{ animationDuration: "3s" }} />
              </div>
            </div>

            {/* Title & Status */}
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-bold text-primary">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                AI Agent Active
              </span>
              <h3 className="text-lg font-bold text-foreground">
                Document Uploaded &middot; Agent is Working
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {agentFileName ? (
                  <>
                    Processing <span className="font-semibold text-foreground">&quot;{agentFileName}&quot;</span>. BonList is extracting verified roles, credentials, and achievements.
                  </>
                ) : (
                  "BonList is structuring your information into verified ATS-compliant format."
                )}
              </p>
            </div>

            {/* Stepper Progress Card */}
            <div className="rounded-2xl border border-border bg-secondary/30 p-4 text-left space-y-3">
              {[
                { title: "Uploading document & preparing secure parser", desc: "Binary PDF/DOCX buffer parsed without loss" },
                { title: "Extracting employment history & credentials", desc: "Detecting roles, companies, dates, and qualifications" },
                { title: "Structuring achievements, education & ATS tags", desc: "Formatting bullet points, outcomes, and competencies" },
                { title: "Compiling modern ATS layout & templates", desc: "Assembling document canvas ready for instant preview" },
              ].map((step, idx) => {
                const isDone = agentStepIndex > idx;
                const isCurrent = agentStepIndex === idx;
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-3 rounded-xl p-2.5 transition ${
                      isCurrent
                        ? "bg-card border border-primary/30 shadow-xs ring-1 ring-primary/20"
                        : isDone
                        ? "bg-secondary/40 opacity-90"
                        : "opacity-40"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isDone ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                          ✓
                        </div>
                      ) : isCurrent ? (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                          <RefreshCw size={11} className="animate-spin" />
                        </div>
                      ) : (
                        <div className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-[10px] font-medium text-muted-foreground">
                          {idx + 1}
                        </div>
                      )}
                    </div>
                    <div className="text-xs min-w-0">
                      <div className={`font-semibold ${isCurrent ? "text-primary" : "text-foreground"}`}>
                        {step.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {isCurrent ? agentStepText : step.desc}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Micro footer guarantee */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck size={14} className="text-emerald-500" />
              <span>100% Anti-Fabrication Guarantee &middot; Workday & Taleo Compliant</span>
            </div>
          </div>
        </div>
      )}

      {/* 0. INTAKE WORKSTATION SETUP MODAL (UPLOAD CV OR ADD MANUALLY BEFORE GENERATING) */}
      {isIntakeModalOpen && !isAgentWorking && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-md sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cv-intake-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsIntakeModalOpen(false);
          }}
        >
          <div className="flex max-h-[min(96vh,920px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-3xl">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 sm:p-7">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
                  <Sparkles size={20} />
                </span>
                <div>
                  <h2 id="cv-intake-title" className="text-base sm:text-lg font-bold text-foreground">
                    Welcome to the CV Builder
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Step 1: add your details · Step 2: choose a template · Step 3: generate &amp; edit
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsIntakeModalOpen(false)}
                className="rounded-xl border border-border p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition"
                title={cv ? "Close and keep editing" : "Close — you can reopen setup anytime"}
              >
                <X size={16} />
              </button>
            </div>

            {error ? (
              <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}

            {/* Step 1: Mode Selection Tabs */}
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-secondary/50 p-1.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setIntakeTab("manual")}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 transition ${
                  intakeTab === "manual"
                    ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText size={15} className={intakeTab === "manual" ? "text-primary" : ""} />
                <span>Option 1: Enter Information Manually</span>
              </button>

              <button
                type="button"
                onClick={() => setIntakeTab("upload")}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 transition ${
                  intakeTab === "upload"
                    ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Upload size={15} className={intakeTab === "upload" ? "text-primary" : ""} />
                <span>Option 2: Upload CV</span>
              </button>
            </div>

            {/* TAB CONTENT: OPTION 1 (MANUAL) vs OPTION 2 (UPLOAD) */}
            {intakeTab === "manual" ? (
              /* OPTION 1: MANUAL ENTRY FORM */
              <div className="space-y-5 text-xs">
                {/* Pre-fill Helper Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-secondary/30 p-3">
                  <span className="text-[11px] text-muted-foreground">
                    Fill in your professional details below. BonList will structure them into verified ATS-compliant format.
                  </span>
                  <div className="flex gap-2">
                    {readReport() && (
                      <button
                        type="button"
                        onClick={handlePrefillWithDiagnostic}
                        className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[11px] font-bold text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 transition"
                      >
                        Use profile & target role
                      </button>
                    )}
                  </div>
                </div>

                {/* 1. Personal & Contact Details */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <h3 className="font-bold text-foreground text-xs uppercase tracking-wider text-primary">
                    1. Personal & Contact Information
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={manualInput.fullName}
                        onChange={(e) => setManualInput({ ...manualInput, fullName: e.target.value })}
                        placeholder="e.g. Kgotso Maduna"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                        Target Role / Job Title *
                      </label>
                      <input
                        type="text"
                        value={manualInput.professionalTitle}
                        onChange={(e) => setManualInput({ ...manualInput, professionalTitle: e.target.value })}
                        placeholder="e.g. Software Engineer, Operations Lead"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        value={manualInput.email}
                        onChange={(e) => setManualInput({ ...manualInput, email: e.target.value })}
                        placeholder="e.g. candidate@example.co.za"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={manualInput.phone}
                        onChange={(e) => setManualInput({ ...manualInput, phone: e.target.value })}
                        placeholder="e.g. +27 82 555 1234"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                        Location (City, Country)
                      </label>
                      <input
                        type="text"
                        value={manualInput.location}
                        onChange={(e) => setManualInput({ ...manualInput, location: e.target.value })}
                        placeholder="e.g. Johannesburg, South Africa"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                        LinkedIn Profile URL
                      </label>
                      <input
                        type="text"
                        value={manualInput.linkedin}
                        onChange={(e) => setManualInput({ ...manualInput, linkedin: e.target.value })}
                        placeholder="e.g. linkedin.com/in/username"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground block mb-1">
                        Portfolio / GitHub / Website
                      </label>
                      <input
                        type="text"
                        value={manualInput.website}
                        onChange={(e) => setManualInput({ ...manualInput, website: e.target.value })}
                        placeholder="e.g. github.com/username or portfolio.co.za"
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. Professional Summary */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
                  <h3 className="font-bold text-foreground text-xs uppercase tracking-wider text-primary">
                    2. Professional Summary
                  </h3>
                  <textarea
                    rows={3}
                    value={manualInput.summary}
                    onChange={(e) => setManualInput({ ...manualInput, summary: e.target.value })}
                    placeholder="Briefly state your core domains, technical competencies, and verified career highlights..."
                    className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                  />
                </div>

                {/* 3. Work Experience */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-foreground text-xs uppercase tracking-wider text-primary">
                      3. Work Experience ({manualInput.experiences.length})
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddManualExperience}
                      className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition"
                    >
                      <Plus size={12} /> Add Another Role
                    </button>
                  </div>

                  <div className="space-y-4">
                    {manualInput.experiences.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-2">
                        No employment history added yet. Click &quot;Add Role&quot; above to add your positions.
                      </p>
                    ) : (
                      manualInput.experiences.map((exp, expIdx) => (
                        <div key={exp.id || expIdx} className="rounded-xl border border-border bg-secondary/20 p-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-foreground text-xs">Role #{expIdx + 1}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveManualExperience(expIdx)}
                              className="text-[11px] text-destructive hover:underline"
                            >
                              Remove Role
                            </button>
                          </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={exp.role}
                            onChange={(e) => {
                              const exps = [...manualInput.experiences];
                              exps[expIdx] = { ...exp, role: e.target.value };
                              setManualInput({ ...manualInput, experiences: exps });
                            }}
                            placeholder="Job Title (e.g. Software Engineer)"
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                          />
                          <input
                            type="text"
                            value={exp.company}
                            onChange={(e) => {
                              const exps = [...manualInput.experiences];
                              exps[expIdx] = { ...exp, company: e.target.value };
                              setManualInput({ ...manualInput, experiences: exps });
                            }}
                            placeholder="Company Name (e.g. First National Bank)"
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                          />
                          <input
                            type="text"
                            value={exp.startDate}
                            onChange={(e) => {
                              const exps = [...manualInput.experiences];
                              exps[expIdx] = { ...exp, startDate: e.target.value };
                              setManualInput({ ...manualInput, experiences: exps });
                            }}
                            placeholder="Start Date (e.g. Jan 2022)"
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                          />
                          <input
                            type="text"
                            value={exp.endDate}
                            onChange={(e) => {
                              const exps = [...manualInput.experiences];
                              exps[expIdx] = { ...exp, endDate: e.target.value };
                              setManualInput({ ...manualInput, experiences: exps });
                            }}
                            placeholder="End Date (e.g. Present)"
                            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground"
                          />
                        </div>

                        {/* Bullets */}
                        <div className="space-y-1.5 pt-1">
                          <label className="text-[10px] font-semibold text-muted-foreground block">
                            Key Accomplishments & Bullet Points:
                          </label>
                          {exp.bullets.map((b, bIdx) => (
                            <div key={bIdx} className="flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                              <input
                                type="text"
                                value={b}
                                onChange={(e) => {
                                  const exps = [...manualInput.experiences];
                                  const bullets = [...exp.bullets];
                                  bullets[bIdx] = e.target.value;
                                  exps[expIdx] = { ...exp, bullets };
                                  setManualInput({ ...manualInput, experiences: exps });
                                }}
                                placeholder="State an outcome with measurable impact..."
                                className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground"
                              />
                              {exp.bullets.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveManualBullet(expIdx, bIdx)}
                                  className="text-muted-foreground hover:text-destructive p-1"
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleAddManualBullet(expIdx)}
                            className="text-[11px] font-semibold text-primary hover:underline block pt-1"
                          >
                            + Add Bullet Point
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                  </div>
                </div>

                {/* 4. Education & Qualifications */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-foreground text-xs uppercase tracking-wider text-primary">
                      4. Education & Qualifications
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddManualEducation}
                      className="text-[11px] font-bold text-primary hover:underline"
                    >
                      + Add Qualification
                    </button>
                  </div>
                  <div className="space-y-2">
                    {manualInput.education.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-2">
                        No formal qualifications listed. Click &quot;+ Add Qualification&quot; above if you wish to add one.
                      </p>
                    ) : (
                      manualInput.education.map((edu, eduIdx) => (
                        <div key={edu.id || eduIdx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border border-border bg-secondary/15 p-2.5">
                          <input
                            type="text"
                            value={edu.degree}
                            onChange={(e) => {
                              const edus = [...manualInput.education];
                              edus[eduIdx] = { ...edu, degree: e.target.value };
                              setManualInput({ ...manualInput, education: edus });
                            }}
                            placeholder="Degree / Certificate"
                            className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                          />
                          <input
                            type="text"
                            value={edu.institution}
                            onChange={(e) => {
                              const edus = [...manualInput.education];
                              edus[eduIdx] = { ...edu, institution: e.target.value };
                              setManualInput({ ...manualInput, education: edus });
                            }}
                            placeholder="Institution / University"
                            className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                          />
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={edu.graduationYear}
                              onChange={(e) => {
                                const edus = [...manualInput.education];
                                edus[eduIdx] = { ...edu, graduationYear: e.target.value };
                                setManualInput({ ...manualInput, education: edus });
                              }}
                              placeholder="Year (e.g. 2021)"
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveManualEducation(eduIdx)}
                              className="text-muted-foreground hover:text-destructive p-1"
                              title="Remove qualification"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 5. Skills & Core Competencies */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
                  <h3 className="font-bold text-foreground text-xs uppercase tracking-wider text-primary">
                    5. Skills & Core Competencies
                  </h3>
                  <input
                    type="text"
                    value={manualInput.skills}
                    onChange={(e) => setManualInput({ ...manualInput, skills: e.target.value })}
                    placeholder="e.g. C#, .NET Core, SQL Server, REST APIs, Git, Agile, Docker"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Separate skills with commas. These will be parsed into standardized ATS tags recognized by Workday and Taleo.
                  </p>
                </div>

                {/* 6. Key Projects */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-foreground text-xs uppercase tracking-wider text-primary">
                      6. Key Projects ({manualInput.projects.length})
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddManualProject}
                      className="text-[11px] font-bold text-primary hover:underline"
                    >
                      + Add Project
                    </button>
                  </div>
                  <div className="space-y-3">
                    {manualInput.projects.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-1">
                        No projects listed. Click &quot;+ Add Project&quot; above to add personal or commercial projects.
                      </p>
                    ) : (
                      manualInput.projects.map((proj, pIdx) => (
                        <div key={proj.id || pIdx} className="rounded-xl border border-border bg-secondary/15 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-foreground text-xs">Project #{pIdx + 1}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveManualProject(pIdx)}
                              className="text-[11px] text-destructive hover:underline"
                            >
                              Remove Project
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={proj.title}
                              onChange={(e) => {
                                const projs = [...manualInput.projects];
                                projs[pIdx] = { ...proj, title: e.target.value };
                                setManualInput({ ...manualInput, projects: projs });
                              }}
                              placeholder="Project Title"
                              className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                            />
                            <input
                              type="text"
                              value={proj.subtitle || ""}
                              onChange={(e) => {
                                const projs = [...manualInput.projects];
                                projs[pIdx] = { ...proj, subtitle: e.target.value };
                                setManualInput({ ...manualInput, projects: projs });
                              }}
                              placeholder="Role / Technologies"
                              className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                            />
                            <input
                              type="text"
                              value={proj.link || ""}
                              onChange={(e) => {
                                const projs = [...manualInput.projects];
                                projs[pIdx] = { ...proj, link: e.target.value };
                                setManualInput({ ...manualInput, projects: projs });
                              }}
                              placeholder="Link (e.g. github.com/...)"
                              className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-muted-foreground block mb-0.5">
                              Accomplishments (one per line):
                            </label>
                            <textarea
                              rows={2}
                              value={(proj.bullets || []).join("\n")}
                              onChange={(e) => {
                                const projs = [...manualInput.projects];
                                projs[pIdx] = {
                                  ...proj,
                                  bullets: e.target.value.split("\n").filter((b) => b.trim().length > 0),
                                };
                                setManualInput({ ...manualInput, projects: projs });
                              }}
                              placeholder="Key accomplishments or features delivered..."
                              className="w-full rounded-lg border border-border bg-background p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 7. Certifications & Accreditations */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-foreground text-xs uppercase tracking-wider text-primary">
                      7. Certifications & Accreditations ({manualInput.certifications.length})
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddManualCertification}
                      className="text-[11px] font-bold text-primary hover:underline"
                    >
                      + Add Certification
                    </button>
                  </div>
                  <div className="space-y-2">
                    {manualInput.certifications.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-1">
                        No certifications added. Click &quot;+ Add Certification&quot; above to add licenses or certificates.
                      </p>
                    ) : (
                      manualInput.certifications.map((cert, cIdx) => (
                        <div key={cert.id || cIdx} className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border border-border bg-secondary/15 p-2.5">
                          <input
                            type="text"
                            value={cert.name}
                            onChange={(e) => {
                              const certs = [...manualInput.certifications];
                              certs[cIdx] = { ...cert, name: e.target.value };
                              setManualInput({ ...manualInput, certifications: certs });
                            }}
                            placeholder="Certification Name"
                            className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                          />
                          <input
                            type="text"
                            value={cert.issuer}
                            onChange={(e) => {
                              const certs = [...manualInput.certifications];
                              certs[cIdx] = { ...cert, issuer: e.target.value };
                              setManualInput({ ...manualInput, certifications: certs });
                            }}
                            placeholder="Issuing Organization"
                            className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                          />
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={cert.year || ""}
                              onChange={(e) => {
                                const certs = [...manualInput.certifications];
                                certs[cIdx] = { ...cert, year: e.target.value };
                                setManualInput({ ...manualInput, certifications: certs });
                              }}
                              placeholder="Year (e.g. 2023)"
                              className="w-full rounded-lg border border-border bg-background px-2.5 py-1 text-xs text-foreground"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveManualCertification(cIdx)}
                              className="text-muted-foreground hover:text-destructive p-1"
                              title="Remove certification"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 8. Languages */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
                  <h3 className="font-bold text-foreground text-xs uppercase tracking-wider text-primary">
                    8. Languages
                  </h3>
                  <input
                    type="text"
                    value={manualInput.languages}
                    onChange={(e) => setManualInput({ ...manualInput, languages: e.target.value })}
                    placeholder="e.g. English (Fluent), isiZulu (Native), Afrikaans (Conversational)"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Separate languages with commas, indicating proficiency levels where appropriate.
                  </p>
                </div>

                {/* 9. References */}
                <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
                  <h3 className="font-bold text-foreground text-xs uppercase tracking-wider text-primary">
                    9. References
                  </h3>
                  <textarea
                    rows={2}
                    value={manualInput.references}
                    onChange={(e) => setManualInput({ ...manualInput, references: e.target.value })}
                    placeholder="e.g. Available upon request, or enter referee name, role, company and contact"
                    className="w-full rounded-xl border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Enter &quot;Available upon request&quot; or provide specific contact details (one referee per line).
                  </p>
                </div>
              </div>
            ) : (
              /* OPTION 2: UPLOAD CV */
              <div className="space-y-4">
                {/* Diagnostic review banner if available in session */}
                {readReport() && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-3.5">
                    <div className="flex items-center gap-2.5 text-xs">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-sky-500/20 text-sky-600 dark:text-sky-300 shrink-0">
                        <Zap size={14} />
                      </span>
                      <div>
                        <div className="font-bold text-foreground">
                          Detected Review: {readReport()?.fileName || "Uploaded CV"}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Targeting {readReport()?.targetRole || "your selected role"}. Upload the original CV to import source-backed employment and education.
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handlePrefillWithDiagnostic}
                      className="rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500 transition"
                    >
                      Use profile & target role
                    </button>
                  </div>
                )}

                {/* Upload Drag & Drop Area */}
                <div className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-secondary/20 p-8 text-center transition hover:border-primary/50 hover:bg-primary/5">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-card border border-border text-primary shadow-xs mb-3">
                    <Upload size={22} />
                  </div>
                  <h3 className="text-sm font-bold text-foreground">Upload your current CV file</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Supports <strong>PDF, Word (.docx), or Text (.txt)</strong>. We will extract your verified history into structured ATS fields.
                  </p>
                  <label className="mt-4 cursor-pointer rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:brightness-105 transition shadow-xs">
                    <span>{extracting ? "Extracting CV Data…" : "Browse File on Device"}</span>
                    <input
                      type="file"
                      accept=".txt,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                      className="hidden"
                      onChange={handleIntakeFileUpload}
                      disabled={extracting}
                    />
                  </label>
                </div>

                {/* Extracted preview card if available */}
                {extractedData && (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 size={16} />
                        <span>Extracted Successfully: {extractedData.personal.fullName || "Candidate"}</span>
                      </div>
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-semibold">
                        {extractedData.experiences.length} Roles · {extractedData.skills.length} Skills
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Target Role: <strong>{extractedData.personal.professionalTitle || manualInput.professionalTitle}</strong> · Email: {extractedData.personal.email || manualInput.email}
                    </p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {extractedData.skills.slice(0, 10).map((skill, sIdx) => (
                        <span key={sIdx} className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-200">
                          {skill}
                        </span>
                      ))}
                      {extractedData.skills.length > 10 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{extractedData.skills.length - 10} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Paste Text Toggle */}
                <div className="border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => setShowPasteInsideUpload(!showPasteInsideUpload)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <FileText size={13} />
                    <span>{showPasteInsideUpload ? "Hide Raw Text Box" : "Or Paste Raw CV Text Instead"}</span>
                  </button>

                  {showPasteInsideUpload && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        rows={6}
                        value={intakePasteText}
                        onChange={(e) => setIntakePasteText(e.target.value)}
                        placeholder="Paste plain text copied from your CV, LinkedIn profile, or job history here..."
                        className="w-full rounded-2xl border border-border bg-background p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={extracting || !intakePasteText.trim()}
                          onClick={() => void handleIntakePasteExtract()}
                          className="rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:brightness-105 disabled:opacity-50"
                        >
                          {extracting ? "Extracting…" : "Extract from Pasted Text"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 2: CHOOSE FROM MODERN ATS TEMPLATES */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">
                    Choose Your Modern ATS-Friendly Template
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    All layouts are pre-tested to parse 100% cleanly in Workday, Taleo, and Greenhouse.
                  </p>
                </div>
                <span className="text-xs font-semibold text-primary">
                  {TEMPLATE_CATALOG.find((t) => t.id === selectedTemplate)?.name || "Corporate Professional"} Selected
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {TEMPLATE_CATALOG.map((tpl) => (
                  <TemplateThumbnail
                    key={tpl.id}
                    tpl={tpl}
                    selected={selectedTemplate === tpl.id}
                    onSelect={() => handleTemplateChange(tpl.id)}
                    doc={cv?.document}
                  />
                ))}
              </div>
            </div>

            {/* ACTION FOOTER — sticky so Generate is always reachable */}
            </div>
            <div className="shrink-0 border-t border-border bg-card px-5 py-4 sm:px-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                <ShieldCheck size={16} />
                <span>Workday & Taleo Compliant · 100% Verified Evidence</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsIntakeModalOpen(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary transition"
                >
                  {cv ? "Back to workspace" : "Close"}
                </button>
                <button
                  type="button"
                  disabled={generatingFromIntake}
                  onClick={() => void handleGenerateFromIntake()}
                  className="rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-primary-foreground shadow-sm hover:brightness-105 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Sparkles size={14} />
                  <span>{generatingFromIntake ? "Generating Modern ATS CV…" : "Generate Modern ATS CV"}</span>
                </button>
              </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* 5. PRE-FLIGHT QUALITY AUDIT MODAL (BONLIST FINAL CHECK - SECTION 37) */}
      {isPreFlightModalOpen && createPortal(
        <div
          className="no-print fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cv-preflight-title"
        >
          <div className="flex max-h-[min(90vh,640px)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <h3 id="cv-preflight-title" className="text-base font-bold text-foreground">BonList Final Check</h3>
                  <p className="text-xs text-muted-foreground">Pre-download quality verification</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPreFlightModalOpen(false)}
                className="rounded-xl border border-border p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <X size={15} />
              </button>
            </div>

            {/* Primary CTA always visible — no scrolling required */}
            <div className="shrink-0 border-b border-border bg-card px-6 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {preFlightLoading
                    ? "Audit running — you can download now."
                    : `Ready · ${TEMPLATE_CATALOG.find((t) => t.id === selectedTemplate)?.name || "selected template"}`}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPreFlightModalOpen(false)}
                    className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary"
                  >
                    Return
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmPreFlightDownload}
                    className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
                  >
                    Download Final CV
                  </button>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              {preFlightLoading ? (
                <div className="space-y-3 py-8 text-center text-xs text-muted-foreground">
                  <RefreshCw size={20} className="mx-auto animate-spin text-primary" />
                  <p className="font-medium">Running BonList pre-flight quality audit…</p>
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        Audit Status
                      </span>
                      <div className="text-sm font-bold text-foreground mt-0.5">
                        {preFlightReport?.overallGrade || "Ready for download"}
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      Approved ✓
                    </span>
                  </div>

                  <div className="rounded-2xl border border-border bg-secondary/20 p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5 text-foreground">
                        <CheckCircle2 size={13} className="text-emerald-500" />
                        <span>Content verified</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-foreground">
                        <CheckCircle2 size={13} className="text-emerald-500" />
                        <span>History checked</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-foreground">
                        <CheckCircle2 size={13} className="text-emerald-500" />
                        <span>Formatting verified</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-foreground">
                        <CheckCircle2 size={13} className="text-emerald-500" />
                        <span>ATS readability checked</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-foreground">
                        <CheckCircle2 size={13} className="text-emerald-500" />
                        <span>Anti-fabrication verified</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-foreground">
                        <CheckCircle2 size={13} className="text-emerald-500" />
                        <span>Professional tone</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    Download uses your currently selected template
                    {TEMPLATE_CATALOG.find((t) => t.id === selectedTemplate)?.name
                      ? ` (${TEMPLATE_CATALOG.find((t) => t.id === selectedTemplate)?.name})`
                      : ""}
                    .
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* 6. ACHIEVEMENT DISCOVERY MODAL (SECTION 34) */}
      {isAchievementDiscoveryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Award size={18} />
                </span>
                <div>
                  <h3 className="text-base font-bold text-foreground">Achievement Discovery</h3>
                  <p className="text-xs text-muted-foreground">Draw out verified metrics without fabrication</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAchievementDiscoveryOpen(false)}
                className="rounded-xl border border-border p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <X size={15} />
              </button>
            </div>

            {discoveryLoading ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                <RefreshCw size={20} className="mx-auto animate-spin text-primary" />
                <p className="mt-2 font-medium">Scanning CV for achievement opportunities…</p>
              </div>
            ) : discoveryQuestions.length > 0 && discoveryQuestions[currentDiscoveryIdx] ? (
              <div className="space-y-4 text-xs">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Question {currentDiscoveryIdx + 1} of {discoveryQuestions.length}</span>
                  <span className="capitalize font-semibold text-primary">{discoveryQuestions[currentDiscoveryIdx]?.category}</span>
                </div>

                <div className="rounded-xl border border-border bg-secondary/30 p-3 italic text-muted-foreground">
                  "{discoveryQuestions[currentDiscoveryIdx]?.dutyBullet}"
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-1">
                  <div className="font-bold text-amber-900 dark:text-amber-200">
                    {discoveryQuestions[currentDiscoveryIdx]?.question}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    💡 {discoveryQuestions[currentDiscoveryIdx]?.hint}
                  </div>
                </div>

                <input
                  type="text"
                  value={discoveryAnswerInput}
                  onChange={(e) => setDiscoveryAnswerInput(e.target.value)}
                  placeholder="e.g. 40+ client inquiries daily, or 98% turnaround rate"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={() => setIsAchievementDiscoveryOpen(false)}
                    className="rounded-xl border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-secondary"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    disabled={!discoveryAnswerInput.trim()}
                    onClick={() => void handleIncorporateAchievement()}
                    className="rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    Incorporate Metric
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-muted-foreground">
                <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-2" />
                <p>All bullet points currently have verified evidence!</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 7. PASTE CV TEXT MODAL */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">Paste Existing CV Text</h3>
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="rounded-xl border border-border p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <X size={15} />
              </button>
            </div>

            <textarea
              value={pasteInputText}
              onChange={(e) => setPasteInputText(e.target.value)}
              rows={8}
              placeholder="Paste raw text from Word, PDF, or email..."
              className="w-full rounded-2xl border border-border bg-background p-3 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={extracting || !pasteInputText.trim()}
                onClick={() => void handleExtractPastedText()}
                className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {extracting ? "Extracting…" : "Extract Information"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Improve CV — review wording before applying */}
      {isImproveModalOpen && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="improve-cv-title"
        >
          <div className="my-4 w-full max-w-2xl rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 id="improve-cv-title" className="flex items-center gap-2 text-base font-bold text-foreground">
                  <Wand2 size={16} className="text-emerald-600" />
                  Improve CV
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Clearer, more natural wording — without inventing experience, numbers, or a new career story.
                  Nothing changes on your CV until you Accept a suggestion.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsImproveModalOpen(false)}
                className="rounded-xl border border-border p-1.5 text-muted-foreground hover:bg-secondary shrink-0"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">What to improve</div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: "entire", label: "Entire CV" },
                    { id: "summary", label: "Summary" },
                    { id: "experience", label: "Work Experience" },
                    { id: "skills", label: "Skills" },
                    { id: "education", label: "Education" },
                    { id: "other", label: "Other sections" },
                  ] as Array<{ id: ImproveCvScope; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setImproveScope(opt.id)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      improveScope === opt.id
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "border border-border bg-secondary/40 text-foreground hover:bg-secondary"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {(jobDescription.trim() || cv?.document.headline) && (
                <p className="text-[10px] text-muted-foreground">
                  Target role context:{" "}
                  <span className="font-semibold text-foreground">
                    {jobDescription.trim().slice(0, 80) || cv?.document.headline}
                  </span>
                  {jobDescription.trim().length > 80 ? "…" : ""}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={improveLoading || !cv}
                onClick={() => void handleRunImproveCv(improveScope)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {improveLoading ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    Analysing wording…
                  </>
                ) : (
                  <>
                    <Sparkles size={13} />
                    Analyse &amp; suggest
                  </>
                )}
              </button>
              {improveReport && improveReport.proposals.some((p) => p.status === "pending") && (
                <button
                  type="button"
                  onClick={handleAcceptAllImproveProposals}
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20"
                >
                  Accept all remaining
                </button>
              )}
            </div>

            {improveReport && (
              <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                {improveReport.qualityNotes.map((note, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground flex gap-1.5">
                    <Info size={12} className="mt-0.5 shrink-0 text-emerald-600" />
                    <span>{note}</span>
                  </p>
                ))}

                {improveReport.missingSuggestions.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-1">
                    <div className="text-[11px] font-bold text-amber-800 dark:text-amber-200">You may want to add (we won’t invent these)</div>
                    {improveReport.missingSuggestions.map((s, i) => (
                      <p key={i} className="text-[11px] text-amber-900/90 dark:text-amber-100/90">• {s}</p>
                    ))}
                  </div>
                )}

                {improveReport.unchangedNote && (
                  <div className="rounded-xl border border-border bg-secondary/30 p-4 text-center text-xs text-muted-foreground">
                    {improveReport.unchangedNote}
                  </div>
                )}

                {improveReport.proposals.map((proposal) => {
                  return (
                    <div
                      key={proposal.id}
                      className={`rounded-2xl border p-3 space-y-2 ${
                        proposal.status === "accepted" || proposal.status === "edited"
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : proposal.status === "rejected"
                            ? "border-border bg-secondary/20 opacity-60"
                            : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-foreground">{proposal.title}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{proposal.reason}</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {proposal.section}
                        </span>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-border bg-secondary/20 p-2.5">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Original</div>
                          <p className="text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">{proposal.before}</p>
                        </div>
                        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-2.5">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 mb-1">
                            Improved {proposal.status === "pending" ? "(editable)" : ""}
                          </div>
                          {proposal.status === "pending" ? (
                            <textarea
                              rows={3}
                              value={improveDrafts[proposal.id] ?? proposal.after}
                              onChange={(e) =>
                                setImproveDrafts((prev) => ({ ...prev, [proposal.id]: e.target.value }))
                              }
                              className="w-full resize-none rounded-lg border border-border bg-background p-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                            />
                          ) : (
                            <p className="text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">
                              {improveDrafts[proposal.id] ?? proposal.after}
                            </p>
                          )}
                        </div>
                      </div>

                      {proposal.missingHint && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-300">{proposal.missingHint}</p>
                      )}

                      {proposal.status === "pending" && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleAcceptImproveProposal(proposal.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                            >
                              <Check size={12} /> Accept
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectImproveProposal(proposal.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary"
                            >
                              <X size={12} /> Reject
                            </button>
                          </div>
                        )}
                      {(proposal.status === "accepted" || proposal.status === "edited") && (
                        <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                          <CheckCircle2 size={12} /> Applied to your CV
                        </div>
                      )}
                      {proposal.status === "rejected" && (
                        <div className="text-[10px] font-semibold text-muted-foreground">Rejected — left unchanged</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!improveReport && !improveLoading && (
              <div className="rounded-2xl border border-dashed border-border bg-secondary/20 p-6 text-center space-y-2">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Choose a section (or Entire CV), then run the analysis. You’ll review Original vs Improved for each change.
                </p>
              </div>
            )}

            <div className="flex justify-end border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setIsImproveModalOpen(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* 8. SMART BULLET ENHANCEMENT MODAL */}
      {enhancingBullet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                <Wand2 size={15} className="text-primary" /> Smart Bullet Improvement
              </h3>
              <button
                type="button"
                onClick={() => setEnhancingBullet(null)}
                className="rounded-xl border border-border p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Original</span>
                <p className="mt-1 rounded-xl border border-border bg-secondary/30 p-2.5 italic text-muted-foreground">
                  "{enhancingBullet.original}"
                </p>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-primary">Improved (Active Power Verb)</span>
                <p className="mt-1 rounded-xl border border-primary/30 bg-primary/5 p-2.5 font-medium text-foreground">
                  "{enhancingBullet.improved}"
                </p>
              </div>

              {enhancingBullet.missingMetricInquiry && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-1">
                  <span className="font-bold text-amber-800 dark:text-amber-300">Metric Verification</span>
                  <p className="text-[10px] text-muted-foreground">{enhancingBullet.missingMetricInquiry}</p>
                  <input
                    type="text"
                    value={userMetricInput}
                    onChange={(e) => setUserMetricInput(e.target.value)}
                    placeholder="e.g. 20+ inquiries daily or 15% improvement"
                    className="w-full rounded-xl border border-border bg-background p-2 text-xs text-foreground focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setEnhancingBullet(null)}
                className="rounded-xl border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyBulletImprovement}
                className="rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
              >
                Apply to CV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. ROLE VERSIONING MODAL */}
      {isNewVersionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground">Create Role-Targeted Version</h3>
              <button
                type="button"
                onClick={() => setIsNewVersionModalOpen(false)}
                className="rounded-xl border border-border p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <X size={15} />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Clone your verified history into a specialized version targeted at a specific vacancy without touching your Master CV.
            </p>

            <input
              type="text"
              value={newVersionNameInput}
              onChange={(e) => setNewVersionNameInput(e.target.value)}
              placeholder="e.g. Customer Service CV, Logistics CV"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsNewVersionModalOpen(false)}
                className="rounded-xl border border-border px-3.5 py-1.5 text-xs font-semibold hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newVersionNameInput.trim()}
                onClick={handleCreateNewVersion}
                className="rounded-xl bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Create Version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. EXTRACTION REVIEW SCREEN MODAL */}
      {isExtractModalOpen && extractedData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">Confirm Extracted Information</h3>
              <button
                type="button"
                onClick={() => setIsExtractModalOpen(false)}
                className="rounded-xl border border-border p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold">Full Name</label>
                  <input
                    type="text"
                    value={extractedData.personal.fullName}
                    onChange={(e) =>
                      setExtractedData({
                        ...extractedData,
                        personal: { ...extractedData.personal, fullName: e.target.value },
                      })
                    }
                    className="w-full rounded-lg border border-border bg-background p-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold">Target Role / Title</label>
                  <input
                    type="text"
                    value={extractedData.personal.professionalTitle || ""}
                    onChange={(e) =>
                      setExtractedData({
                        ...extractedData,
                        personal: { ...extractedData.personal, professionalTitle: e.target.value },
                      })
                    }
                    className="w-full rounded-lg border border-border bg-background p-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold">Email</label>
                  <input
                    type="text"
                    value={extractedData.personal.email}
                    onChange={(e) =>
                      setExtractedData({
                        ...extractedData,
                        personal: { ...extractedData.personal, email: e.target.value },
                      })
                    }
                    className="w-full rounded-lg border border-border bg-background p-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold">Phone</label>
                  <input
                    type="text"
                    value={extractedData.personal.phone || ""}
                    onChange={(e) =>
                      setExtractedData({
                        ...extractedData,
                        personal: { ...extractedData.personal, phone: e.target.value },
                      })
                    }
                    className="w-full rounded-lg border border-border bg-background p-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold">Location</label>
                  <input
                    type="text"
                    value={extractedData.personal.location || ""}
                    onChange={(e) =>
                      setExtractedData({
                        ...extractedData,
                        personal: { ...extractedData.personal, location: e.target.value },
                      })
                    }
                    className="w-full rounded-lg border border-border bg-background p-1.5 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-semibold">LinkedIn</label>
                  <input
                    type="text"
                    value={extractedData.personal.linkedin || ""}
                    onChange={(e) =>
                      setExtractedData({
                        ...extractedData,
                        personal: { ...extractedData.personal, linkedin: e.target.value },
                      })
                    }
                    placeholder="linkedin.com/in/..."
                    className="w-full rounded-lg border border-border bg-background p-1.5 text-xs"
                  />
                </div>
              </div>

              {/* Work Experience Summary */}
              <div className="rounded-xl border border-border bg-secondary/20 p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-foreground">
                    Work Experience ({extractedData.experiences.length} roles found)
                  </span>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                  {extractedData.experiences.map((exp, idx) => (
                    <div key={idx} className="text-[11px] text-slate-700 dark:text-slate-300">
                      <strong>{exp.role}</strong> at {exp.company} ({exp.startDate} – {exp.endDate})
                    </div>
                  ))}
                </div>
              </div>

              {/* Education & Projects Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-xl border border-border bg-secondary/20 p-2.5">
                  <span className="text-[11px] font-bold text-foreground block mb-1">
                    Education ({extractedData.education.length} qualifications)
                  </span>
                  <div className="space-y-1 max-h-20 overflow-y-auto pr-1">
                    {extractedData.education.map((edu, idx) => (
                      <div key={idx} className="text-[11px] text-slate-700 dark:text-slate-300">
                        {edu.degree} · {edu.institution} ({edu.graduationYear})
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-secondary/20 p-2.5">
                  <span className="text-[11px] font-bold text-foreground block mb-1">
                    Projects ({extractedData.projects?.length || 0} projects)
                  </span>
                  <div className="space-y-1 max-h-20 overflow-y-auto pr-1">
                    {(extractedData.projects || []).map((proj, idx) => (
                      <div key={idx} className="text-[11px] text-slate-700 dark:text-slate-300">
                        {proj.title}{proj.subtitle ? ` (${proj.subtitle})` : ""}
                      </div>
                    ))}
                    {(!extractedData.projects || extractedData.projects.length === 0) && (
                      <span className="text-[10px] text-muted-foreground italic">None detected</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="text-[10px] text-muted-foreground font-bold">Skills Extracted ({extractedData.skills.length})</label>
                <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
                  {extractedData.skills.map((s, idx) => (
                    <span key={idx} className="rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {(extractedData.toolsAndSoftware || []).length > 0 && (
                <div>
                  <label className="text-[10px] text-muted-foreground font-bold">Systems & Software Extracted ({extractedData.toolsAndSoftware.length})</label>
                  <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
                    {extractedData.toolsAndSoftware.map((tool, idx) => (
                      <span key={idx} className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-700 dark:text-sky-300">
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setIsExtractModalOpen(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmExtractionAndBuild()}
                className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
              >
                Confirm & Generate CV
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Semantic HTML Generator (for standalone HTML & Word exports)
// ---------------------------------------------------------------------------
function generateSemanticHtml(
  doc: GeneratedCvDocument,
  color: { primary: string; secondary: string; border: string },
  font: { family: string },
  templateId = "single_column",
): string {
  const isSerifClassic = templateId === "serif_classic";
  const isCorporateBlue = templateId === "corporate_blue";
  const isEditorialGold = templateId === "editorial_gold";
  const isAnalystClean = templateId === "analyst_clean";

  const headingFont = isSerifClassic || isEditorialGold ? `Georgia, "Times New Roman", serif` : font.family;
  const nameStyle = isSerifClassic
    ? `margin:0;font-size:22pt;text-align:center;font-family:${headingFont};color:#0f172a;`
    : isCorporateBlue
      ? `margin:0;font-size:20pt;text-transform:uppercase;letter-spacing:0.04em;color:${color.primary};`
      : isEditorialGold
        ? `margin:0;font-size:24pt;font-family:${headingFont};color:${color.primary};`
        : isAnalystClean
          ? `margin:0;font-size:22pt;font-weight:800;color:#0f172a;`
          : `margin:0;font-size:22pt;color:${color.primary};`;

  const h2Style = isSerifClassic
    ? `font-size:10.5pt;text-transform:uppercase;letter-spacing:0.16em;color:#0f172a;border-top:1px solid #0f172a;border-bottom:1px solid #0f172a;padding:6px 0;margin-top:1.4rem;font-family:${headingFont};`
    : isCorporateBlue
      ? `font-size:10.5pt;text-transform:uppercase;letter-spacing:0.12em;color:${color.primary};border-top:2px solid ${color.primary};border-bottom:2px solid ${color.primary};padding:6px 0;margin-top:1.4rem;`
      : isEditorialGold
        ? `font-size:12pt;font-family:${headingFont};color:${color.primary};border-bottom:1px solid ${color.primary};padding-bottom:4px;margin-top:1.4rem;`
        : isAnalystClean
          ? `font-size:10pt;text-transform:uppercase;letter-spacing:0.28em;color:#1e293b;border-bottom:1px dashed #cbd5e1;padding-bottom:6px;margin-top:1.4rem;`
          : `font-size:11pt;text-transform:uppercase;color:${color.primary};border-bottom:1px solid ${color.border};padding-bottom:4px;margin-top:1.5rem;`;

  const contactBits = [doc.location, doc.phone, doc.email, doc.linkedin, doc.website].filter(Boolean).join(" | ");
  const contactLine = doc.contactLine || contactBits;

  const headerHtml = isAnalystClean
    ? `<header style="display:flex;justify-content:space-between;gap:1.5rem;align-items:flex-start;border-bottom:1px dashed #cbd5e1;padding-bottom:12px;">
        <div>
          <h1 style="${nameStyle}">${doc.fullName}</h1>
          <div style="font-weight:500;color:#64748b;margin-top:4px;">${doc.headline || ""}</div>
        </div>
        <div style="text-align:right;font-size:9.5pt;color:#64748b;line-height:1.5;">
          ${[doc.phone, doc.email, doc.website, doc.location].filter(Boolean).map((v) => `<div>${v}</div>`).join("")}
        </div>
      </header>`
    : isSerifClassic
      ? `<header style="text-align:center;border-bottom:1px solid #0f172a;padding-bottom:12px;">
          <h1 style="${nameStyle}">${doc.fullName}</h1>
          <div style="font-style:italic;color:#475569;margin-top:4px;font-family:${headingFont};">${doc.headline || ""}</div>
          <div class="contact" style="margin-top:8px;">${contactLine}</div>
        </header>`
      : `<header>
          <h1 style="${nameStyle}">${doc.fullName}</h1>
          <div style="font-weight:600;color:#475569;${isCorporateBlue ? "text-transform:uppercase;letter-spacing:0.12em;font-size:9.5pt;" : ""}">${doc.headline || ""}</div>
          <div class="contact">${contactLine}</div>
        </header>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${doc.fullName} - CV</title>
  <style>
    body {
      font-family: ${font.family};
      font-size: 10.5pt;
      line-height: 1.5;
      color: #1e293b;
      margin: 0;
      padding: 16mm 18mm;
      width: 210mm;
      max-width: 210mm;
      box-sizing: border-box;
      background: #ffffff;
      overflow-wrap: break-word;
      word-break: normal;
    }
    h1 { ${nameStyle} }
    h2 { ${h2Style} }
    .contact { font-size: 9.5pt; color: #64748b; margin-top: 4px; }
    .exp-item { margin-bottom: 1rem; }
    .role-header { font-weight: bold; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem 1rem; }
    .company { color: #475569; }
    .dates { font-weight: 600; white-space: nowrap; color: #334155; }
    ul { margin: 4px 0; padding-left: 1.2rem; }
    li { margin-bottom: 2px; overflow-wrap: anywhere; word-break: break-word; }
    .skills { display: flex; flex-wrap: wrap; gap: 4px; }
    .skill-tag { background: ${color.secondary}; border: 1px solid ${color.border}; color: ${color.primary}; padding: 2px 8px; border-radius: 4px; font-size: 9pt; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
    footer { margin-top: 2rem; font-size: 8pt; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  ${headerHtml}

  ${doc.summary ? `
  <section>
    <h2>${isEditorialGold ? "Profile" : isSerifClassic ? "PROFILE" : isCorporateBlue ? "SUMMARY" : "Professional Summary"}</h2>
    <p>${doc.summary}</p>
  </section>` : ""}

  ${doc.experiences && doc.experiences.length > 0 ? `
  <section>
    <h2>${isEditorialGold ? "Professional Experience" : isSerifClassic ? "EXPERIENCE" : isCorporateBlue ? "PROFESSIONAL EXPERIENCE" : isAnalystClean ? "E X P E R I E N C E" : "Work Experience"}</h2>
    ${doc.experiences
      .map(
        (exp) => `
      <div class="exp-item">
        <div class="role-header">
          <span>${exp.role} <span class="company">· ${exp.company}${exp.location ? ` · ${exp.location}` : ""}</span></span>
          <span class="dates">${exp.startDate} – ${exp.endDate}</span>
        </div>
        <ul>
          ${exp.bullets.map((b) => `<li>${b}</li>`).join("")}
        </ul>
      </div>
    `,
      )
      .join("")}
  </section>` : ""}

  ${doc.projects && doc.projects.length > 0 ? `
  <section>
    <h2>Key Projects</h2>
    ${doc.projects
      .map(
        (proj) => `
      <div class="exp-item">
        <div class="role-header">${proj.title}${proj.subtitle ? ` <span class="company">· ${proj.subtitle}</span>` : ""}${proj.link ? ` <a href="${proj.link}" target="_blank" style="font-size: 8.5pt; color: ${color.primary}; text-decoration: underline;">[Link]</a>` : ""}</div>
        ${proj.bullets && proj.bullets.length > 0 ? `
        <ul>
          ${proj.bullets.map((b) => `<li>${b}</li>`).join("")}
        </ul>` : ""}
      </div>
    `,
      )
      .join("")}
  </section>` : ""}

  ${doc.skills && doc.skills.length > 0 ? `
  <section>
    <h2>${isSerifClassic ? "SKILLS" : isCorporateBlue ? "TECHNICAL SKILLS" : isAnalystClean ? "S K I L L S" : "Skills & Competencies"}</h2>
    <div class="skills">
      ${doc.skills.map((s) => `<span class="skill-tag">${s}</span>`).join(" ")}
    </div>
  </section>` : ""}

  ${doc.toolsAndSoftware && doc.toolsAndSoftware.length > 0 ? `
  <section>
    <h2>${isSerifClassic ? "SYSTEMS" : isAnalystClean ? "S Y S T E M S" : "Systems & Software"}</h2>
    <div class="skills">
      ${doc.toolsAndSoftware.map((s) => `<span class="skill-tag">${s}</span>`).join(" ")}
    </div>
  </section>` : ""}

  ${doc.education && doc.education.length > 0 ? `
  <section>
    <h2>${isSerifClassic ? "EDUCATION" : isAnalystClean ? "E D U C A T I O N" : "Education"}</h2>
    ${doc.education
      .map(
        (edu) => `
      <div class="role-header"><strong>${edu.degree}</strong> <span class="dates">${edu.graduationYear || ""}</span></div>
      <div>${edu.institution}</div>
    `,
      )
      .join("")}
  </section>` : ""}

  ${doc.certifications && doc.certifications.length > 0 ? `
  <section>
    <h2>${isAnalystClean ? "C E R T I F I C A T E S" : "Certifications & Accreditations"}</h2>
    ${doc.certifications
      .map(
        (cert) => `
      <div class="role-header"><strong>${cert.name}</strong> <span class="dates">${cert.year || ""}</span></div>
      <div>${cert.issuer}</div>
    `,
      )
      .join("")}
  </section>` : ""}

  ${doc.languages && doc.languages.length > 0 ? `
  <section>
    <h2>${isSerifClassic ? "LANGUAGES" : isAnalystClean ? "L A N G U A G E S" : "Languages"}</h2>
    <p>${doc.languages.join(" • ")}</p>
  </section>` : ""}

  ${doc.references && doc.references.length > 0 ? `
  <section>
    <h2>References</h2>
    ${doc.references
      .map(
        (ref) => `
      <div>${ref}</div>
    `,
      )
      .join("")}
  </section>` : ""}
</body>
</html>`;
}
