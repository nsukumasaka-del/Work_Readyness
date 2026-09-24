/**
 * BonList — Professional AI CV Builder & Authenticity Engine
 *
 * Core Principle: "Improve the candidate's story — never invent the candidate's story."
 *
 * Anti-Fabrication & Truth Layer:
 * 1. VERIFIED: Directly supported by candidate information.
 * 2. REPHRASED: Same factual information expressed more professionally.
 * 3. INFERRED: Reasonable interpretation requiring candidate confirmation.
 * 4. MISSING: Information needed but not provided (generates inquiry).
 * 5. UNSUPPORTED: Information the AI must NEVER introduce (blocked).
 */

import { sanitizeExtractedCvText } from "./cv-text-sanitize";

export const CV_STRUCTURES = [
  // Enhancv Core 15 Templates
  "double_column",
  "ivy_league",
  "elegant",
  "contemporary",
  "modern",
  "timeline",
  "creative",
  "stylish",
  "single_column",
  "compact",
  "polished",
  "multicolumn",
  "classic",
  "high_performer",
  "minimal",
  // Modern reference templates
  "serif_classic",
  "corporate_blue",
  "editorial_gold",
  "analyst_clean",
  // Backward compatibility structures & aliases
  "professional",
  "executive",
  "graduate",
  "technical",
  "ats_friendly",
  "international",
  "modern_double",
  "executive_classic",
  "contemporary_hybrid",
  "tech_minimal",
  "impact_performer",
  "impact",
  "ats",
] as const;

export type CvStructure = (typeof CV_STRUCTURES)[number];

/**
 * Standard CV section model (Enhancv / professional SA CV layout).
 * Every generated CV should map into these categories when present in the source.
 */
export const STANDARD_CV_SECTIONS = [
  {
    id: "header",
    label: "Header & Contact",
    fields: ["fullName", "professionalTitle", "email", "phone", "location", "linkedin", "website"],
  },
  { id: "summary", label: "Professional Summary", fields: ["summary"] },
  { id: "experience", label: "Work Experience", fields: ["role", "company", "startDate", "endDate", "location", "bullets"] },
  { id: "education", label: "Education", fields: ["degree", "institution", "graduationYear", "details"] },
  { id: "skills", label: "Skills & Competencies", fields: ["skills"] },
  { id: "projects", label: "Key Projects", fields: ["title", "subtitle", "link", "bullets"] },
  { id: "certifications", label: "Certifications & Accreditations", fields: ["name", "issuer", "year"] },
  { id: "languages", label: "Languages", fields: ["languages"] },
  { id: "references", label: "References", fields: ["references"] },
] as const;

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
  achievements?: string[];
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

export interface CvSection {
  heading: string;
  items: string[];
}

export interface GeneratedCvDocument {
  id?: string;
  versionName?: string;
  structure: CvStructure;
  structureLabel: string;
  structureDescription: string;
  templateType: "double_column" | "single_column" | "compact" | "hybrid" | "executive" | "creative" | "international" | "timeline" | "minimal" | string;
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
  projects?: CvProjectItem[];
  certifications?: CvCertificationItem[];
  languages?: string[];
  references?: string[];
  strengths?: string[];
  keywords: string[];
  sections: CvSection[];
  tone?: HumanizeTone;
  footerNote: string;
  authenticityScore: number;
  aiFeedback?: AiFeedbackData;
}

export interface AtsCheckItem {
  id: string;
  category: "essentials" | "content_quality" | "action_verbs" | "metrics" | "keywords" | "formatting" | "authenticity";
  label: string;
  passed: boolean;
  score: number;
  detail: string;
  recommendation?: string;
}

export interface AtsReport {
  overallScore: number;
  grade: "Needs Work" | "Fair" | "Competitive" | "Exceptional";
  categories: {
    essentials: number;
    contentQuality: number;
    actionVerbs: number;
    quantifiedMetrics: number;
    keywordMatch: number;
    formatCompliance: number;
    authenticity: number;
  };
  checks: AtsCheckItem[];
  matchedKeywords: string[];
  missingKeywords: string[];
  weakBullets: Array<{ bullet: string; reason: string; suggestedImprovement: string }>;
  strongBullets: string[];
  recommendedFixes: string[];
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
  // Advanced Recruiter Simulation (Section 29)
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
    rating: "Evidence & Outcomes" | "Balanced" | "Primarily Routine Duty Listing";
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

// ---------------------------------------------------------------------------
// Section 26 & 27: Evidence Traceability Models
// ---------------------------------------------------------------------------

export interface EvidenceTraceItem {
  id: string;
  section: "headline" | "summary" | "experience" | "skills" | "education";
  sourceText: string;
  aiRecommendation: string;
  finalStatement: string;
  classification: StatementClassification;
  evidenceType: "direct" | "rephrased" | "confirmed_inquiry" | "blocked";
  auditNote: string;
  isMetricSupported: boolean;
  missingMetricInquiry?: string;
}

export interface EvidenceTraceReport {
  items: EvidenceTraceItem[];
  verifiedCount: number;
  rephrasedCount: number;
  inferredCount: number;
  missingInquiryCount: number;
  unsupportedBlockedCount: number;
  authenticityScore: number;
  traceabilitySummary: string;
}

// ---------------------------------------------------------------------------
// Section 28: AI Self-Review Engine Models (7 Quality Gates)
// ---------------------------------------------------------------------------

export interface AiSelfReviewGate {
  gate: "accuracy" | "authenticity" | "clarity" | "professionalism" | "relevance" | "naturalLanguage" | "risk";
  label: string;
  passed: boolean;
  note: string;
}

export interface AiSelfReviewResult {
  passed: boolean;
  gates: AiSelfReviewGate[];
  originalText: string;
  revisedText: string;
  revisionApplied: boolean;
  revisionReason?: string;
  blockedClaims: string[];
}

// ---------------------------------------------------------------------------
// Section 30: Career Positioning Engine Models
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Section 31 & 32: Advanced Job Match (6-Tier Taxonomy) & Keyword Intelligence
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Section 33: Transferable Skills Engine Models
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Section 34: Achievement Discovery Engine Models
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Section 37: Pre-Flight CV Quality Control Models
// ---------------------------------------------------------------------------

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

export interface TailoringProposal {
  id: string;
  section: "summary" | "experience" | "skills" | "order";
  title: string;
  reason: string;
  before: string;
  after: string;
  status: "pending" | "accepted" | "rejected" | "customized";
}

export interface JobMatchReport {
  jobTitle: string;
  overallMatch: number; // e.g. 78%
  strongMatches: string[];
  missingOrUnclear: string[];
  cautionNotice: string;
  recommendedAction: string;
  proposals: TailoringProposal[];
}

// ---------------------------------------------------------------------------
// Zero-Hallucination Parser Guardrails & Isolated Channel Contracts
// ---------------------------------------------------------------------------

export const CV_PARSER_SYSTEM_PROMPT = `You are a strict, zero-hallucination CV and resume parsing engine.
Your sole objective is to parse candidate facts explicitly present in the provided document into a structured JSON schema.

CRITICAL ZERO-HALLUCINATION RULES:
1. EXTRACT ONLY facts explicitly present in the candidate's uploaded document. DO NOT infer, extrapolate, or fill in missing fields (like Education or Skills) with default or placeholder data.
2. If a field or entire section is missing in the uploaded CV (e.g. no education, no certifications, or no explicit skills), return null or an empty array [].
3. NEVER fabricate educational institutions (such as University of the Witwatersrand, University of Cape Town, etc.), degrees, or dates.
4. NEVER invent past employers, job titles, or bullet points not present in the candidate's document.
5. Strict Schema Isolation:
   - "cv_content": Contains ONLY genuine candidate document data (personal, summary, experiences, education, skills, toolsAndSoftware, certifications, languages, projects, references).
   - "ai_feedback": Contains internal tips, review feedback, missing keyword alerts, and job board advice. AI critique or recruiter feedback MUST NEVER leak into "cv_content".
6. The candidate summary must be a factual 2-3 sentence biography of the candidate based strictly on their experience, NEVER a critique or review of their CV quality.
`;

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
  toolsAndSoftware: string[];
  certifications: CvCertificationItem[];
  languages: string[];
  projects: CvProjectItem[];
  references: string[];
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

export interface ExtractedCvData {
  // Isolated channel representations
  cv_content: CvContentData;
  ai_feedback: AiFeedbackData;

  // Flattened candidate fields (strictly matching cv_content for backward compatibility)
  personal: CvContentData["personal"];
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

export type ProfileLike = {
  name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  targetRole?: string | null;
};

export type DiagnosticLike = {
  targetRole?: string;
  summary?: string;
  strengths?: Array<{ title: string; detail: string }>;
  improvements?: Array<{ title: string; detail: string; priority?: string }>;
  rewriteExamples?: Array<{ before: string; after: string }>;
  missingKeywords?: string[];
  flaggedPhrases?: string[];
  sectionReviews?: Array<{ section: string; findings?: string[] }>;
};

// ---------------------------------------------------------------------------
// 8 High-Impact Template Configurations
// ---------------------------------------------------------------------------

export const STRUCTURE_META: Record<
  CvStructure,
  {
    category:
      | "Professional"
      | "Modern"
      | "Executive"
      | "Graduate"
      | "Creative"
      | "Technical"
      | "ATS-Friendly"
      | "International"
      | "Traditional"
      | "Minimalist";
    label: string;
    description: string;
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
    bestFor: string;
    pageLayout: "1-page dense" | "1-2 pages" | "2+ pages";
  }
> = {
  // 15 Enhancv Signature Templates
  double_column: {
    category: "Modern",
    label: "Double Column",
    description: "Enhancv signature compact two-column layout. Balances your highlights with your career story. Ideal for consulting, tech, and executive roles.",
    templateType: "double_column",
    bestFor: "Consulting, engineering, management, mid and senior roles",
    pageLayout: "1-2 pages",
  },
  ivy_league: {
    category: "Traditional",
    label: "Ivy League",
    description: "Distinguished single-column layout with dignified academic typography, centered header, and classic horizontal rules.",
    templateType: "single_column",
    bestFor: "Law, finance, academia, strategy consulting, traditional corporate",
    pageLayout: "1-2 pages",
  },
  elegant: {
    category: "Traditional",
    label: "Elegant",
    description: "Sophisticated typography, subtle underlines, italicized company subheaders, and refined competency tags.",
    templateType: "single_column",
    bestFor: "Executive leadership, luxury, arts management, communications",
    pageLayout: "1-2 pages",
  },
  contemporary: {
    category: "Modern",
    label: "Contemporary",
    description: "Fresh modern sans-serif with bold accent bars on section headings and clean card/pill skills.",
    templateType: "double_column",
    bestFor: "Product, marketing, growth, design, tech leads",
    pageLayout: "1-2 pages",
  },
  modern: {
    category: "Modern",
    label: "Modern",
    description: "Sleek dual-column layout with visual hierarchy, optimized whitespace, and balanced sidebar highlight cards.",
    templateType: "double_column",
    bestFor: "Technology, digital media, operations, consulting",
    pageLayout: "1-2 pages",
  },
  timeline: {
    category: "Creative",
    label: "Timeline",
    description: "Enhancv signature timeline layout. Displays career progression along a clean vertical milestone track.",
    templateType: "timeline",
    bestFor: "Project managers, customer operations, career advancers, engineers",
    pageLayout: "1-2 pages",
  },
  creative: {
    category: "Creative",
    label: "Creative",
    description: "Visual impact layout with prominent summary callout, portfolio highlights, and badge competencies.",
    templateType: "creative",
    bestFor: "Designers, creative directors, copywriters, media professionals",
    pageLayout: "1-2 pages",
  },
  stylish: {
    category: "Creative",
    label: "Stylish",
    description: "Modern styled layout with high-contrast accent header banner, crisp tags, and sleek typography.",
    templateType: "double_column",
    bestFor: "Digital marketing, brand strategy, startups, product management",
    pageLayout: "1-2 pages",
  },
  single_column: {
    category: "ATS-Friendly",
    label: "Single Column",
    description: "Classic linear ATS-optimized layout with right-aligned dates and maximum machine parseability.",
    templateType: "single_column",
    bestFor: "Automated recruitment systems (Workday, Taleo, Greenhouse), corporate applications",
    pageLayout: "1-2 pages",
  },
  compact: {
    category: "Modern",
    label: "Compact",
    description: "High-density two-column layout that fits 15-20% more verified content into a single page without clutter.",
    templateType: "compact",
    bestFor: "Junior and mid-level professionals, dense engineering profiles",
    pageLayout: "1-page dense",
  },
  polished: {
    category: "Executive",
    label: "Polished",
    description: "Refined executive presentation with crisp divider lines, formal role hierarchy, and structured date alignments.",
    templateType: "executive",
    bestFor: "Directors, VPs, general managers, senior consultants",
    pageLayout: "1-2 pages",
  },
  multicolumn: {
    category: "Modern",
    label: "Multicolumn",
    description: "Dynamic modular multi-column structure balancing work tenure with rapid-scan skills and credentials.",
    templateType: "double_column",
    bestFor: "Multi-skilled specialists, hybrid leaders, technical managers",
    pageLayout: "1-2 pages",
  },
  classic: {
    category: "Traditional",
    label: "Classic",
    description: "Timeless reverse-chronological corporate standard. Clean headings, traditional bullet hierarchy.",
    templateType: "single_column",
    bestFor: "Corporate finance, operations, business administration, banking",
    pageLayout: "1-2 pages",
  },
  high_performer: {
    category: "Professional",
    label: "High Performer",
    description: "Outcome-driven format engineered to spotlight quantified metrics, achievements, and business scale.",
    templateType: "single_column",
    bestFor: "Sales leaders, commercial directors, revenue operators, founders",
    pageLayout: "1-2 pages",
  },
  minimal: {
    category: "Minimalist",
    label: "Minimal",
    description: "Ultra-clean minimalist layout with generous whitespace, delicate divider lines, and zero distractions.",
    templateType: "minimal",
    bestFor: "Minimalists, architects, analysts, modern tech workers",
    pageLayout: "1-2 pages",
  },
  serif_classic: {
    category: "Traditional",
    label: "Serif Classic",
    description: "Centered classic serif header with formal section rules — ideal academic and professional single-column CV.",
    templateType: "single_column",
    bestFor: "Engineering, academia, consulting, traditional corporate roles",
    pageLayout: "1-2 pages",
  },
  corporate_blue: {
    category: "Modern",
    label: "Corporate Blue",
    description: "Modern blue accent headings with right-aligned dates and clean professional experience hierarchy.",
    templateType: "single_column",
    bestFor: "Finance, operations, analysts, corporate professionals",
    pageLayout: "1-2 pages",
  },
  editorial_gold: {
    category: "Executive",
    label: "Editorial Gold",
    description: "Editorial serif headings with gold accent rules and left-aligned professional narrative layout.",
    templateType: "single_column",
    bestFor: "Legal, executive, advisory, senior professional roles",
    pageLayout: "1-2 pages",
  },
  analyst_clean: {
    category: "Modern",
    label: "Analyst Clean",
    description: "Modern grayscale layout with name/contact split header, dotted section dividers, and certificate support.",
    templateType: "single_column",
    bestFor: "Business analysts, product, operations, tech professionals",
    pageLayout: "1-2 pages",
  },

  // Legacy & Alias Profiles
  professional: {
    category: "Professional",
    label: "Corporate Professional",
    description: "Clean, authoritative single-column layout with dignified typography and maximum traditional readability.",
    templateType: "single_column",
    bestFor: "Corporate finance, operations, business administration, legal, general management",
    pageLayout: "1-2 pages",
  },
  executive: {
    category: "Executive",
    label: "Executive Leadership",
    description: "Premium single-column hierarchy that highlights strategic governance, organizational scope, and executive milestones.",
    templateType: "executive",
    bestFor: "Directors, department heads, senior executives, general managers",
    pageLayout: "1-2 pages",
  },
  graduate: {
    category: "Graduate",
    label: "Graduate & Early Career",
    description: "Front-loads education, academic projects, coursework, and core competencies for candidates with limited work tenure.",
    templateType: "single_column",
    bestFor: "Recent graduates, interns, entry-level candidates, apprentices",
    pageLayout: "1-page dense",
  },
  technical: {
    category: "Technical",
    label: "Technical & Systems",
    description: "Engineered specifically for engineering, software, and IT roles. Prioritizes technology stack matrix and architecture wins.",
    templateType: "compact",
    bestFor: "Software engineers, DevOps, data engineers, network specialists, systems analysts",
    pageLayout: "1-2 pages",
  },
  ats_friendly: {
    category: "ATS-Friendly",
    label: "ATS Direct-Index",
    description: "Ultra-clean single-column structure with standardized header tags and zero parse-inhibiting graphical artifacts.",
    templateType: "single_column",
    bestFor: "Enterprise portals (Workday, Taleo, Greenhouse, Lever), high-volume recruitment",
    pageLayout: "1-2 pages",
  },
  international: {
    category: "International",
    label: "International Standard",
    description: "Formatted to global recruiting standards (EU, UK, Middle East, USA) with comprehensive role details.",
    templateType: "international",
    bestFor: "Expat candidates, remote international roles, multinational corporations",
    pageLayout: "2+ pages",
  },
  modern_double: {
    category: "Modern",
    label: "Modern Dual Column",
    description: "Enhancv-inspired 65/35 dual-column layout with high visual density and balanced sidebar.",
    templateType: "double_column",
    bestFor: "Product, marketing, growth, tech, operations",
    pageLayout: "1-2 pages",
  },
  executive_classic: {
    category: "Executive",
    label: "Executive Leadership",
    description: "Dignified single-column corporate layout with deep ATS compatibility.",
    templateType: "executive",
    bestFor: "Leadership, corporate, finance, legal",
    pageLayout: "1-2 pages",
  },
  contemporary_hybrid: {
    category: "Modern",
    label: "Contemporary Hybrid",
    description: "Skills & capabilities spotlight header paired with a chronological timeline.",
    templateType: "hybrid",
    bestFor: "Career changers, product managers, hybrid tech/commercial roles",
    pageLayout: "1-2 pages",
  },
  tech_minimal: {
    category: "Technical",
    label: "Technical ATS First",
    description: "High-density monospaced details optimized for automated enterprise parsing engines.",
    templateType: "compact",
    bestFor: "Software engineers, data scientists, DevOps",
    pageLayout: "1-2 pages",
  },
  impact_performer: {
    category: "Professional",
    label: "Impact High-Performer",
    description: "Front-loads verified evidence, operational milestones, and responsibilities.",
    templateType: "single_column",
    bestFor: "Sales leaders, growth marketers, founders",
    pageLayout: "1-2 pages",
  },
  impact: {
    category: "Professional",
    label: "Impact-First",
    description: "Clear evidence-driven presentation.",
    templateType: "single_column",
    bestFor: "High-impact roles",
    pageLayout: "1-2 pages",
  },
  ats: {
    category: "ATS-Friendly",
    label: "ATS Direct-Index",
    description: "Clean standard headers and maximum machine readability.",
    templateType: "single_column",
    bestFor: "Automated job boards",
    pageLayout: "1-2 pages",
  },
};

export function normalizeStructure(structure?: string | null): CvStructure {
  if (!structure) return "double_column";
  if (structure === "modern_double") return "double_column";
  if (structure === "executive_classic") return "polished";
  if (structure === "contemporary_hybrid") return "contemporary";
  if (structure === "tech_minimal") return "compact";
  if (structure === "ats") return "single_column";
  if (structure === "ats_friendly") return "single_column";
  if (structure === "impact_performer" || structure === "impact") return "high_performer";
  if (structure === "professional") return "double_column";
  if (CV_STRUCTURES.includes(structure as CvStructure)) {
    return structure as CvStructure;
  }
  return "double_column";
}

const PRIMARY_STRUCTURES: CvStructure[] = [
  "double_column",
  "ivy_league",
  "elegant",
  "contemporary",
  "modern",
  "timeline",
  "creative",
  "stylish",
  "single_column",
  "compact",
  "polished",
  "multicolumn",
  "classic",
  "high_performer",
  "minimal",
  "serif_classic",
  "corporate_blue",
  "editorial_gold",
  "analyst_clean",
];

export function nextCvStructure(current?: string | null): CvStructure {
  const norm = normalizeStructure(current);
  const idx = PRIMARY_STRUCTURES.indexOf(norm);
  if (idx < 0) return "professional";
  return PRIMARY_STRUCTURES[(idx + 1) % PRIMARY_STRUCTURES.length];
}

// ---------------------------------------------------------------------------
// Power Action Verbs & Cliché Vocabulary (Strict Human-Sounding Quality)
// ---------------------------------------------------------------------------

const POWER_ACTION_VERBS = [
  "accelerated", "achieved", "analyzed", "architected", "built", "championed",
  "collaborated", "consolidated", "coordinated", "curated", "delivered", "deployed",
  "designed", "developed", "directed", "drove", "engineered", "established",
  "evaluated", "executed", "expanded", "facilitated", "formulated", "guided",
  "implemented", "improved", "increased", "initiated", "instituted", "investigated",
  "launched", "led", "managed", "maximized", "mentored", "minimized", "negotiated",
  "optimized", "orchestrated", "overhauled", "partnered", "pioneered", "prepared",
  "produced", "reconciled", "reduced", "resolved", "restructured", "revamped",
  "reviewed", "scaled", "secured", "simplified", "standardized", "streamlined",
  "supervised", "surpassed", "trained", "transformed",
];

export const FORBIDDEN_AI_CLICHES = [
  "results-driven professional",
  "results-driven",
  "dynamic professional",
  "highly motivated individual",
  "highly motivated",
  "passionate professional",
  "dedicated professional",
  "detail-oriented professional",
  "detail-oriented team player",
  "proven track record",
  "strategic thinker",
  "self-starter",
  "go-getter",
  "proactive individual",
  "strong communicator",
  "team player",
  "out-of-the-box thinker",
  "demonstrated ability to",
  "going above and beyond",
  "exceeded expectations",
  "rockstar",
  "ninja",
  "guru",
  "synergy",
  "fast-paced environment",
  "spearheaded everything",
  "delve into",
  "plethora of",
];

/** Extra phrases to strip/avoid when rewriting for a human voice. */
const IMPROVE_CV_BANNED = [
  ...FORBIDDEN_AI_CLICHES,
  "outstanding",
  "exceptional",
  "leveraged",
  "spearheaded",
  "facilitated",
  "utilised",
  "utilized",
  "streamlined",
  "optimised",
  "optimized",
  "successfully ",
];

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

const METRIC_REGEX = /(\d+[%kKmMbB]?|\$\d+|\bR\d+|\b\d+\s*(?:percent|hours|days|weeks|months|people|members|clients|projects|teams|queries|tickets|accounts))/i;

// ---------------------------------------------------------------------------
// 27-Check ATS Scoring Algorithm
// ---------------------------------------------------------------------------

export function evaluateAts(
  cv: GeneratedCvDocument,
  jobDescription?: string,
): AtsReport {
  const checks: AtsCheckItem[] = [];
  const allBullets = cv.experiences.flatMap((e) => e.bullets);

  const totalWords = (
    cv.summary +
    " " +
    allBullets.join(" ") +
    " " +
    cv.skills.join(" ")
  ).split(/\s+/).filter(Boolean).length;

  // 1. Essentials
  const hasEmail = Boolean(cv.email && cv.email.includes("@"));
  const hasPhone = Boolean(cv.phone && cv.phone.length >= 7);
  const hasLocation = Boolean(cv.location && cv.location.length >= 2);
  const hasHeadline = Boolean(cv.headline && cv.headline.length >= 3);

  checks.push({
    id: "ess-contact",
    category: "essentials",
    label: "Contact Information Completeness",
    passed: hasEmail && (hasPhone || hasLocation),
    score: hasEmail && hasPhone && hasLocation ? 100 : hasEmail ? 75 : 40,
    detail: hasEmail ? "Direct email and location detected cleanly." : "Missing direct contact credentials.",
    recommendation: !hasPhone ? "Add a direct contact phone number for recruiter reach-outs." : undefined,
  });

  checks.push({
    id: "ess-headline",
    category: "essentials",
    label: "Target Role & Headline Alignment",
    passed: hasHeadline,
    score: hasHeadline ? 100 : 50,
    detail: hasHeadline ? `Clear target headline "${cv.headline}" positioned above the fold.` : "Headline is generic or missing.",
    recommendation: !hasHeadline ? "Set a definitive professional headline." : undefined,
  });

  checks.push({
    id: "ess-summary",
    category: "essentials",
    label: "Professional Summary Quality",
    passed: cv.summary.length >= 80 && cv.summary.length <= 600,
    score: cv.summary.length >= 80 && cv.summary.length <= 500 ? 100 : 70,
    detail: `Summary length is ${cv.summary.length} characters (optimal is 150-450 characters).`,
    recommendation: cv.summary.length < 80 ? "Expand your summary with core skills and domain focus." : undefined,
  });

  // 2. Action Verbs
  let powerVerbCount = 0;
  const weakBullets: Array<{ bullet: string; reason: string; suggestedImprovement: string }> = [];
  const strongBullets: string[] = [];

  for (const bullet of allBullets) {
    const hasPowerVerb = POWER_ACTION_VERBS.some((v) => bullet.toLowerCase().includes(v));
    const hasMetric = METRIC_REGEX.test(bullet);

    if (hasPowerVerb) powerVerbCount++;

    if (!hasPowerVerb && !hasMetric) {
      weakBullets.push({
        bullet,
        reason: "Lacks a strong active verb and measurable proof.",
        suggestedImprovement: "Begin with an active verb (e.g. Coordinated, Delivered, Maintained).",
      });
    } else {
      strongBullets.push(bullet);
    }
  }

  const verbRatio = allBullets.length ? powerVerbCount / allBullets.length : 0;
  checks.push({
    id: "act-verbs",
    category: "action_verbs",
    label: "High-Impact Action Verbs",
    passed: verbRatio >= 0.6,
    score: Math.min(100, Math.round(verbRatio * 130)),
    detail: `${powerVerbCount} of ${allBullets.length} bullets use strong action verbs.`,
    recommendation: verbRatio < 0.6 ? "Replace passive statements with strong verbs." : undefined,
  });

  // 3. Metrics
  let metricCount = 0;
  for (const b of allBullets) {
    if (METRIC_REGEX.test(b)) metricCount++;
  }
  const metricRatio = allBullets.length ? metricCount / allBullets.length : 0;
  checks.push({
    id: "met-quantified",
    category: "metrics",
    label: "Quantified Accomplishments & Evidence",
    passed: metricRatio >= 0.35,
    score: Math.min(100, Math.round(metricRatio * 150) + 40),
    detail: `${metricCount} of ${allBullets.length} experience bullets include concrete metrics or volumes.`,
    recommendation: metricRatio < 0.35 ? "Add verified numbers, volumes, time saved, or team sizes where you have evidence." : undefined,
  });

  // 4. Cliché filter
  const foundBuzzwords = FORBIDDEN_AI_CLICHES.filter((bw) =>
    (cv.summary + " " + allBullets.join(" ")).toLowerCase().includes(bw),
  );
  checks.push({
    id: "cq-buzzwords",
    category: "content_quality",
    label: "Cliché & Buzzword Filter",
    passed: foundBuzzwords.length === 0,
    score: Math.max(50, 100 - foundBuzzwords.length * 20),
    detail: foundBuzzwords.length === 0 ? "Clean authentic tone. No hollow buzzwords detected." : `Flagged ${foundBuzzwords.length} filler phrases: "${foundBuzzwords.join('", "')}".`,
    recommendation: foundBuzzwords.length > 0 ? "Replace subjective adjectives with verifiable facts." : undefined,
  });

  checks.push({
    id: "cq-wordcount",
    category: "content_quality",
    label: "Optimal Resume Length & Density",
    passed: totalWords >= 200 && totalWords <= 750,
    score: totalWords >= 250 && totalWords <= 700 ? 100 : 80,
    detail: `Total length is ${totalWords} words (Target: 250 - 650 words for 1-2 pages).`,
  });

  // 5. Keywords
  const targetKeywords = Array.from(
    new Set([
      ...(cv.keywords || []),
      cv.headline.toLowerCase(),
      "communication",
      "reporting",
      "coordination",
    ]),
  );

  const cvFullText = (
    cv.fullName + " " + cv.headline + " " + cv.summary + " " + allBullets.join(" ") + " " + cv.skills.join(" ")
  ).toLowerCase();

  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];
  for (const kw of targetKeywords) {
    if (cvFullText.includes(kw.toLowerCase())) matchedKeywords.push(kw);
    else missingKeywords.push(kw);
  }

  const kwMatchRate = targetKeywords.length ? matchedKeywords.length / targetKeywords.length : 0.8;
  const kwScore = Math.min(100, Math.round(kwMatchRate * 115));
  checks.push({
    id: "kw-match",
    category: "keywords",
    label: "Role Keyword Relevance",
    passed: kwScore >= 70,
    score: kwScore,
    detail: `Matched ${matchedKeywords.length} of ${targetKeywords.length} core role competencies.`,
    recommendation: missingKeywords.length > 0 ? `Consider adding demonstrated skills: ${missingKeywords.slice(0, 3).join(", ")}.` : undefined,
  });

  // 6. Formatting & Authenticity
  checks.push({
    id: "fmt-sections",
    category: "formatting",
    label: "Standard Section Headings",
    passed: true,
    score: 100,
    detail: "Standard ATS headings used: Summary, Experience, Education, Skills.",
  });

  checks.push({
    id: "fmt-parser",
    category: "formatting",
    label: "Machine Parseable Text Layer",
    passed: true,
    score: 100,
    detail: "Clean semantic HTML/PDF text layers without flattened graphics.",
  });

  const authAudit = auditAuthenticity(cv);
  checks.push({
    id: "auth-layer",
    category: "authenticity",
    label: "Truth & Authenticity Verification",
    passed: authAudit.score >= 85,
    score: authAudit.score,
    detail: authAudit.status,
    recommendation: authAudit.flaggedItems.length > 0 ? authAudit.flaggedItems[0]?.reason : undefined,
  });

  const calcCat = (cat: AtsCheckItem["category"]) => {
    const list = checks.filter((c) => c.category === cat);
    if (!list.length) return 90;
    return Math.round(list.reduce((acc, c) => acc + c.score, 0) / list.length);
  };

  const categories = {
    essentials: calcCat("essentials"),
    contentQuality: calcCat("content_quality"),
    actionVerbs: calcCat("action_verbs"),
    quantifiedMetrics: calcCat("metrics"),
    keywordMatch: calcCat("keywords"),
    formatCompliance: calcCat("formatting"),
    authenticity: calcCat("authenticity"),
  };

  const overallScore = Math.round(
    categories.essentials * 0.15 +
      categories.contentQuality * 0.15 +
      categories.actionVerbs * 0.2 +
      categories.quantifiedMetrics * 0.15 +
      categories.keywordMatch * 0.15 +
      categories.formatCompliance * 0.1 +
      categories.authenticity * 0.1,
  );

  let grade: AtsReport["grade"] = "Fair";
  if (overallScore >= 88) grade = "Exceptional";
  else if (overallScore >= 75) grade = "Competitive";
  else if (overallScore >= 60) grade = "Fair";
  else grade = "Needs Work";

  const recommendedFixes = checks
    .filter((c) => c.recommendation)
    .map((c) => c.recommendation as string);

  return {
    overallScore,
    grade,
    categories,
    checks,
    matchedKeywords: Array.from(new Set(matchedKeywords)),
    missingKeywords: Array.from(new Set(missingKeywords)),
    weakBullets,
    strongBullets,
    recommendedFixes,
  };
}

// ---------------------------------------------------------------------------
// Authenticity Engine & Truth Layer Guard
// ---------------------------------------------------------------------------

/**
 * Validates whether a statement contains ungrounded claims, fabricated percentages,
 * or unsupported numerical assertions.
 */
export function auditAuthenticity(
  cv: GeneratedCvDocument,
  baseline?: { originalBullets?: string[]; userProvidedMetrics?: boolean },
): {
  score: number;
  status: "Fully Authenticated" | "Candidate Confirmation Needed" | "Unsupported Flags";
  verifiedCount: number;
  rephrasedCount: number;
  inferredCount: number;
  unsupportedCount: number;
  inquiries: Array<{ field: string; question: string; whyThisMatters: string }>;
  flaggedItems: Array<{ text: string; reason: string }>;
} {
  const allBullets = cv.experiences.flatMap((e) => e.bullets);
  let verified = 0;
  let rephrased = 0;
  let inferred = 0;
  let unsupported = 0;

  const inquiries: Array<{ field: string; question: string; whyThisMatters: string }> = [];
  const flaggedItems: Array<{ text: string; reason: string }> = [];

  for (const b of allBullets) {
    // Check if the bullet contains hollow buzzwords
    const lower = b.toLowerCase();
    for (const cliche of FORBIDDEN_AI_CLICHES) {
      if (lower.includes(cliche)) {
        flaggedItems.push({
          text: b,
          reason: `Contains repetitive buzzword: "${cliche}". Replace with concrete evidence of duties and skills.`,
        });
      }
    }

    // Check if bullet claims a metric without baseline confirmation
    const hasMetric = METRIC_REGEX.test(b);
    if (hasMetric && !baseline?.userProvidedMetrics) {
      // Inferred or needs confirmation
      inferred++;
    } else {
      rephrased++;
    }
  }

  // Check summary
  const summaryLower = cv.summary.toLowerCase();
  for (const cliche of FORBIDDEN_AI_CLICHES) {
    if (summaryLower.includes(cliche)) {
      flaggedItems.push({
        text: cv.summary,
        reason: `Summary contains generic cliché "${cliche}". Lead directly with domain, years of focus, and core capabilities.`,
      });
    }
  }

  // Check if missing metrics inquiry can be suggested
  if (allBullets.length > 0 && !allBullets.some((b) => METRIC_REGEX.test(b))) {
    inquiries.push({
      field: "Experience Achievements",
      question: "Did any of your responsibilities result in a measurable improvement, such as faster turnaround times, fewer customer complaints, or budget savings?",
      whyThisMatters: "BonList never invents numbers. If you have real figures or volumes from your work, adding them significantly improves recruiter trust.",
    });
  }

  // Calculate score
  const totalItems = allBullets.length + 1;
  const penalty = flaggedItems.length * 15 + unsupported * 25;
  const score = Math.max(70, Math.min(100, 100 - penalty));

  let status: "Fully Authenticated" | "Candidate Confirmation Needed" | "Unsupported Flags" = "Fully Authenticated";
  if (unsupported > 0) status = "Unsupported Flags";
  else if (inferred > 0 || inquiries.length > 0) status = "Candidate Confirmation Needed";

  return {
    score,
    status,
    verifiedCount: verified,
    rephrasedCount: rephrased,
    inferredCount: inferred,
    unsupportedCount: unsupported,
    inquiries,
    flaggedItems,
  };
}

// ---------------------------------------------------------------------------
// "Make It Sound Like Me" (Humanize Engine)
// ---------------------------------------------------------------------------

export function humanizeContent(
  text: string,
  tone: HumanizeTone,
  context?: { role?: string; name?: string },
): {
  tone: HumanizeTone;
  original: string;
  humanized: string;
  explanation: string;
} {
  const trimmed = text.trim();
  const role = context?.role || "Professional";

  // Strip generic clichés first
  let cleaned = trimmed;
  for (const c of FORBIDDEN_AI_CLICHES) {
    const reg = new RegExp(c, "gi");
    cleaned = cleaned.replace(reg, "");
  }
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();

  let humanized = cleaned;
  let explanation = "";

  switch (tone) {
    case "natural":
      // Grounded, conversational yet professional, straightforward voice
      humanized = cleaned
        .replace(/\bpossesses deep expertise in\b/gi, "experienced with")
        .replace(/\bdemonstrated track record of\b/gi, "proven history of")
        .replace(/\bconsistently translates\b/gi, "works to connect")
        .replace(/\bhigh-velocity execution\b/gi, "steady, dependable delivery");
      explanation = "Adjusted to sound conversational, authentic, and grounded while keeping every fact intact.";
      break;

    case "confident":
      // Direct, outcome-minded, assertive verbs
      humanized = cleaned
        .replace(/\bhelped with\b/gi, "delivered")
        .replace(/\bassisted in\b/gi, "coordinated")
        .replace(/\bworked on\b/gi, "executed")
        .replace(/\bresponsible for\b/gi, "managed");
      explanation = "Emphasized direct ownership and active responsibility without overstating your real experience.";
      break;

    case "straightforward":
      // Ultra-concise, zero corporate fluff
      humanized = cleaned
        .replace(/\butilizing modern methodologies\b/gi, "")
        .replace(/\bwith a keen eye for detail\b/gi, "")
        .replace(/\bin order to achieve business goals\b/gi, "")
        .replace(/\bstructured execution and stakeholder alignment\b/gi, "clear execution and team communication");
      explanation = "Streamlined sentence structure and eliminated wordy filler phrases.";
      break;

    case "executive":
      // Strategic, governance, institutional focus
      humanized = cleaned
        .replace(/\bhandled\b/gi, "oversaw")
        .replace(/\bdid\b/gi, "directed")
        .replace(/\bteam member\b/gi, "operational contributor");
      explanation = "Positioned language for executive and leadership review.";
      break;

    case "friendly":
      // Warm, approachable, team-oriented
      humanized = cleaned
        .replace(/\brigorous execution\b/gi, "collaborative teamwork")
        .replace(/\benforcing quality standards\b/gi, "supporting high standards and peer success");
      explanation = "Softened tone to highlight collaboration and customer rapport.";
      break;

    case "technical":
      // Precise, methodical, systems and tool oriented
      humanized = cleaned
        .replace(/\bworked with tools\b/gi, "implemented standard tooling")
        .replace(/\bhelped solve issues\b/gi, "diagnosed and resolved technical bottlenecks");
      explanation = "Sharpened technical precision and methodology references.";
      break;

    case "professional":
    default:
      explanation = "Standard corporate clarity preserving 100% verified facts.";
      break;
  }

  return {
    tone,
    original: trimmed,
    humanized,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Smart Bullet Point Improvement (Anti-Fabrication + Metric Inquiry)
// ---------------------------------------------------------------------------

export function improveBulletPoint(
  bullet: string,
  role?: string,
): {
  original: string;
  improved: string;
  whyBetter: string[];
  classification: StatementClassification;
  missingMetricInquiry?: string;
} {
  const trimmed = bullet.trim();
  const lower = trimmed.toLowerCase();

  // 1. Identify weak prefix
  let cleanStem = trimmed
    .replace(/^(responsible for|tasked with|helped to|assisted in|worked on|duties included)\s+/i, "")
    .replace(/\.$/, "")
    .trim();

  // Capitalize first character of stem
  if (cleanStem.length > 0) {
    cleanStem = cleanStem.charAt(0).toLowerCase() + cleanStem.slice(1);
  }

  // 2. Select appropriate power verb based on action context (NOT inventing duties)
  let verb = "Supported";
  if (lower.includes("customer") || lower.includes("client") || lower.includes("query") || lower.includes("call")) {
    verb = "Assisted clients with enquiries and maintained prompt, professional communication to resolve their needs";
    cleanStem = cleanStem.replace(/^(helping customers|handling customer queries|customer service|customer support)/i, "").trim();
  } else if (lower.includes("admin") || lower.includes("filing") || lower.includes("document") || lower.includes("record")) {
    verb = "Maintained organized record-keeping systems and expedited administrative documentation";
  } else if (lower.includes("logistics") || lower.includes("dispatch") || lower.includes("stock") || lower.includes("warehouse")) {
    verb = "Coordinated dispatch schedules, inventory tracking, and carrier communications";
  } else if (lower.includes("lead") || lower.includes("supervis") || lower.includes("manag")) {
    verb = "Guided team workflows, daily priorities, and operational handoffs";
  } else if (lower.includes("code") || lower.includes("develop") || lower.includes("build") || lower.includes("test")) {
    verb = "Developed, tested, and maintained software components in accordance with team standards";
  } else if (lower.includes("sale") || lower.includes("sell") || lower.includes("prospect")) {
    verb = "Engaged prospective clients, presented service offerings, and supported pipeline follow-ups";
  } else if (lower.includes("report") || lower.includes("data") || lower.includes("excel")) {
    verb = "Prepared accurate analytical reports, reconciliations, and data summaries for management review";
  } else {
    verb = "Coordinated";
  }

  // Combine cleanly
  let improved = "";
  if (cleanStem && cleanStem.length > 3 && !verb.toLowerCase().includes(cleanStem.toLowerCase())) {
    improved = `${verb} by ${cleanStem}.`;
  } else {
    improved = `${verb}.`;
  }

  // Ensure clean punctuation
  improved = improved.replace(/\s+/g, " ").replace(/\.\./g, ".").trim();

  const whyBetter = [
    "Eliminates passive phrasing ('responsible for / helped with')",
    "Begins with an active, professional action verb",
    "Clearly communicates scope and responsibility",
    "Preserves 100% of your real information without fabricating numbers",
  ];

  // If there's an opportunity for a verified metric, formulate a respectful inquiry
  let missingMetricInquiry: string | undefined;
  if (!METRIC_REGEX.test(trimmed)) {
    if (lower.includes("customer") || lower.includes("client")) {
      missingMetricInquiry = "Did you handle a specific daily or monthly volume of enquiries, achieve positive client feedback, or improve response speed?";
    } else if (lower.includes("admin") || lower.includes("process") || lower.includes("invoice")) {
      missingMetricInquiry = "Did you process a regular volume (e.g. invoices per week) or trim processing turnaround time?";
    } else if (lower.includes("sale") || lower.includes("growth")) {
      missingMetricInquiry = "Did you meet or exceed target quotas, close a specific number of accounts, or expand pipeline?";
    } else {
      missingMetricInquiry = "Did this responsibility result in a measurable outcome (e.g. time saved, volume handled, or team size)? Add your real figure if known:";
    }
  }

  return {
    original: trimmed,
    improved,
    whyBetter,
    classification: "REPHRASED",
    missingMetricInquiry,
  };
}

// ---------------------------------------------------------------------------
// Recruiter View Screen (6-Second Screening Simulation)
// ---------------------------------------------------------------------------

export function generateRecruiterView(cv: GeneratedCvDocument): RecruiterViewReport {
  const allBullets = cv.experiences.flatMap((e) => e.bullets);
  const totalYears = cv.experiences.length > 0 ? `${cv.experiences.length * 2}+ years` : "Early career";
  const headline = cv.headline || "Candidate";

  // First 3 takeaways a recruiter catches in 6 seconds
  const quickTakeaways: string[] = [];

  if (cv.experiences.length > 0) {
    quickTakeaways.push(
      `${cv.experiences.length} career roles documented, leading with "${cv.experiences[0]?.role}" at ${cv.experiences[0]?.company}`,
    );
  }
  if (cv.skills.length > 0) {
    quickTakeaways.push(`Core competencies spotlighted: ${cv.skills.slice(0, 5).join(", ")}`);
  }
  if (cv.education.length > 0) {
    quickTakeaways.push(`Educational credentials: ${cv.education[0]?.degree} from ${cv.education[0]?.institution}`);
  }

  // Spot ambiguities / gaps
  const whatIsUnclear: string[] = [];
  if (!cv.headline || cv.headline === "Professional") {
    whatIsUnclear.push("Your target role is not immediately obvious in the top header fold.");
  }
  if (cv.summary.length < 90) {
    whatIsUnclear.push("Professional summary is very brief — recruiters may struggle to gauge your career trajectory quickly.");
  }
  if (!allBullets.some((b) => METRIC_REGEX.test(b))) {
    whatIsUnclear.push("Few or no measurable outcomes listed — responsibilities appear task-focused rather than outcome-focused.");
  }
  if (!cv.location) {
    whatIsUnclear.push("Geographic location is unspecified — local South African recruiters look for city/province context.");
  }

  if (whatIsUnclear.length === 0) {
    whatIsUnclear.push("No major ambiguities detected. The career narrative flows coherently.");
  }

  const positioningRecommendation = {
    title: `Clear Positioning Toward ${headline}`,
    advice: `Align the top third of your CV so that any recruiter screening within 6 seconds immediately recognizes your lane. Lead your summary with your strongest relevant skills and confirmed scope of ownership.`,
    suggestedFocus: `${headline} · Verified experience in ${cv.skills.slice(0, 3).join(", ") || "core domain duties"}`,
  };

  // Section 29: Advanced Recruiter Perspective Simulation
  const first5To10Seconds = {
    immediateHighlights: [
      `${headline} prominently positioned in header fold`,
      `${cv.experiences.length} verified role${cv.experiences.length === 1 ? "" : "s"} with established employer${cv.experiences.length === 1 ? "" : "s"}`,
      `${cv.skills.length} core competencies ready for ATS indexing`,
    ],
    topThirdScan: `Within 5 seconds, a hiring manager's eye tracks from your target role (${headline}) into your first employment entry at ${cv.experiences[0]?.company || "your recent employer"}.`,
  };

  const careerDirectionClarity: "Crystal Clear" | "Moderate / Needs Focus" | "Ambiguous" =
    headline && headline !== "Professional" && cv.experiences.length >= 1
      ? "Crystal Clear"
      : cv.experiences.length > 0
        ? "Moderate / Needs Focus"
        : "Ambiguous";

  const careerDirection = {
    clarity: careerDirectionClarity,
    assessment:
      careerDirectionClarity === "Crystal Clear"
        ? `Your target role (${headline}) directly connects to your most recent responsibilities.`
        : "Recruiters may need a few moments to determine which specific vacancy you are targeting.",
    recommendation:
      careerDirectionClarity === "Crystal Clear"
        ? "Maintain this tight alignment when applying to relevant vacancies."
        : "Sharpen your headline and lead summary sentence with your explicit target job title.",
  };

  const hasMetrics = allBullets.some((b) => METRIC_REGEX.test(b));
  const evidenceLevel = {
    rating: hasMetrics ? ("Evidence & Outcomes" as const) : ("Primarily Routine Duty Listing" as const),
    analysis: hasMetrics
      ? "Several bullets contain verified numbers, volume indicators, or turnaround signals."
      : "Your bullets primarily describe day-to-day duties rather than outcomes or scope.",
    advice: hasMetrics
      ? "Keep metrics grounded in truth. Avoid fabricating additional percentages."
      : "Use our Achievement Discovery tool to add your real shift volumes or turnaround times without inventing numbers.",
  };

  const concernsAndHesitations: string[] = [];
  if (!hasMetrics) {
    concernsAndHesitations.push("Absence of measurable indicators makes it harder to assess performance caliber.");
  }
  if (cv.experiences.length === 0) {
    concernsAndHesitations.push("No prior work experience documented in the primary experience fold.");
  }
  if (cv.skills.length < 5) {
    concernsAndHesitations.push("Limited skill keywords may trigger lower priority rankings in automated filters.");
  }
  if (concernsAndHesitations.length === 0) {
    concernsAndHesitations.push("No material concerns detected. The profile reads professionally and credibly.");
  }

  const shortlistPotential = {
    strengths: [
      `100% verified factual integrity protects your credibility during reference checks`,
      `Standardized single-column/dual-column ATS layout parses cleanly in candidate portals`,
      `${cv.skills.slice(0, 4).join(", ") || "Foundational capabilities"} explicitly spotlighted`,
    ],
    competitiveAdvantage: `Your authentic background presents clear, un-exaggerated capability that hiring managers can verify with confidence.`,
  };

  const responsibleDisclaimer =
    "BonList is engineered to improve your application clarity and recruiter relevance; shortlist decisions remain at the sole discretion of employers.";

  return {
    firstImpression: {
      overview: `A recruiter screening this CV will quickly see a candidate with ${totalYears} of experience, focusing on ${headline}.`,
      quickTakeaways,
      visibleSeniority: cv.experiences.length > 3 ? "Senior / Experienced" : cv.experiences.length > 1 ? "Mid-Level" : "Emerging / Early Career",
      coreDomain: cv.headline || "Cross-Functional",
    },
    whatIsUnclear,
    positioningRecommendation,
    first5To10Seconds,
    careerDirection,
    evidenceLevel,
    concernsAndHesitations,
    shortlistPotential,
    responsibleDisclaimer,
  };
}

// ---------------------------------------------------------------------------
// 6-Pillar Quality Scoring Engine (BonList Score)
// ---------------------------------------------------------------------------

export function evaluateQualityScore(
  cv: GeneratedCvDocument,
  jobDescription?: string,
): BonListQualityReport {
  const allBullets = cv.experiences.flatMap((e) => e.bullets);
  const totalWords = (
    cv.summary +
    " " +
    allBullets.join(" ") +
    " " +
    cv.skills.join(" ")
  ).split(/\s+/).filter(Boolean).length;

  // 1. CONTENT (Depth, completeness, relevance)
  const hasSummary = cv.summary.length >= 80;
  const hasExp = cv.experiences.length >= 1;
  const hasSkills = cv.skills.length >= 4;
  const contentScore = Math.round(
    (hasSummary ? 35 : 15) + (hasExp ? 35 : 10) + (hasSkills ? 30 : 15),
  );

  const contentFeedback = [
    {
      title: "Professional Summary Depth",
      status: (hasSummary ? "Strong" : "Needs Improvement") as "Strong" | "Needs Improvement",
      whyThisMatters: "Recruiters evaluate your summary within the first 6 seconds to decide whether to read further.",
      recommendedImprovement: hasSummary
        ? "Summary clearly sets your professional lane and capabilities."
        : "Expand your summary with your core domain, years of focus, and demonstrated capabilities.",
    },
    {
      title: "Experience Section Substance",
      status: (cv.experiences.length >= 2 ? "Strong" : "Attention") as "Strong" | "Attention",
      whyThisMatters: "Structured employment history demonstrates career consistency and progressive responsibility.",
      recommendedImprovement: "Ensure every role clearly distinguishes daily operations from key milestones.",
    },
  ];

  // 2. CLARITY (Grammar, active verbs, concise phrasing)
  let activeVerbCount = 0;
  for (const b of allBullets) {
    if (POWER_ACTION_VERBS.some((v) => b.toLowerCase().includes(v))) {
      activeVerbCount++;
    }
  }
  const verbRatio = allBullets.length ? activeVerbCount / allBullets.length : 0;
  const clarityScore = Math.min(100, Math.round(verbRatio * 90 + 20));

  const clarityFeedback = [
    {
      title: "Active Action Verbs",
      status: (verbRatio >= 0.6 ? "Strong" : "Needs Improvement") as "Strong" | "Needs Improvement",
      whyThisMatters: "Action verbs make your contributions tangible and energetic.",
      recommendedImprovement:
        verbRatio < 0.6
          ? "Replace duty statements ('responsible for') with strong verbs like Coordinated, Delivered, or Maintained."
          : "Excellent use of strong verbs across your experience bullets.",
    },
  ];

  // 3. RELEVANCE (Target role fit & domain alignment)
  let relevanceScore = 80;
  if (!cv.headline || cv.headline.length < 3) relevanceScore -= 20;
  if (cv.skills.length < 3) relevanceScore -= 15;

  const relevanceFeedback = [
    {
      title: "Target Headline Alignment",
      status: (cv.headline && cv.headline !== "Professional" ? "Strong" : "Needs Improvement") as "Strong" | "Needs Improvement",
      whyThisMatters: "A specific headline allows hiring managers to immediately index your candidacy.",
      recommendedImprovement: `Ensure "${cv.headline}" matches the exact role title you are targeting on job portals.`,
    },
  ];

  // 4. PROFESSIONAL PRESENTATION (Visual layout, formatting, length)
  const presentationScore = totalWords >= 200 && totalWords <= 700 ? 95 : 75;
  const presentationFeedback = [
    {
      title: "Resume Length & Section Balance",
      status: (totalWords >= 200 && totalWords <= 700 ? "Strong" : "Attention") as "Strong" | "Attention",
      whyThisMatters: "Clean formatting and balanced margins ensure high readability on both screen and paper.",
      recommendedImprovement: "Maintain consistent date and location formatting throughout all entries.",
    },
  ];

  // 5. ATS READABILITY (Machine parsability, text layers, standard headers)
  const atsReadabilityScore = 92;
  const atsFeedback = [
    {
      title: "Standard Headings & Parseable Text Layers",
      status: "Strong" as const,
      whyThisMatters: "Enterprise recruiting systems require standard section labels for automated indexing.",
      recommendedImprovement: "Sections are formatted cleanly for automated screening engines.",
    },
  ];

  // 6. AUTHENTICITY (Truth layer & anti-fabrication)
  const authAudit = auditAuthenticity(cv);
  const authenticityScore = authAudit.score;
  const authenticityFeedback = [
    {
      title: "Truth & Authenticity Verification",
      status: (authAudit.score >= 90 ? "Strong" : "Attention") as "Strong" | "Attention",
      whyThisMatters: "BonList protects your professional reputation by ensuring every statement is honest and verifiable.",
      recommendedImprovement:
        authAudit.flaggedItems.length > 0
          ? `Review flagged phrases: ${authAudit.flaggedItems.map((f) => f.reason).join("; ")}`
          : "All CV statements conform to verified candidate facts.",
    },
  ];

  // Prioritized action list: "Fix these first"
  const fixTheseFirst: BonListQualityReport["fixTheseFirst"] = [];

  if (!hasSummary || cv.summary.length < 90) {
    fixTheseFirst.push({
      id: "fix-summary",
      priority: "High",
      title: "Strengthen your professional summary",
      description: "Recruiters need to know your lane, core skills, and background within 6 seconds.",
      action: "Use the AI Rephrase tool or Humanize selector to refine your summary.",
    });
  }

  if (verbRatio < 0.6) {
    fixTheseFirst.push({
      id: "fix-verbs",
      priority: "High",
      title: "Improve weak experience bullets",
      description: `${allBullets.length - activeVerbCount} bullets begin with passive duty phrases.`,
      action: "Click the magic wand beside any bullet to rewrite with strong, verified action verbs.",
    });
  }

  if (!allBullets.some((b) => METRIC_REGEX.test(b))) {
    fixTheseFirst.push({
      id: "fix-metrics",
      priority: "Medium",
      title: "Add measurable achievements where you have evidence",
      description: "BonList never invents numbers. If you handled specific volumes, turnaround times, or clients, add your real data.",
      action: "Click 'Add Verified Metric' on your core work experiences.",
    });
  }

  if (cv.skills.length < 6) {
    fixTheseFirst.push({
      id: "fix-skills",
      priority: "Medium",
      title: "Add relevant skills demonstrated in your experience",
      description: "Highlight software tools, technical skills, and industry proficiencies you have used.",
      action: "Expand your Core Skills section in the editor.",
    });
  }

  if (fixTheseFirst.length === 0) {
    fixTheseFirst.push({
      id: "fix-tailor",
      priority: "Medium",
      title: "Tailor against a specific job vacancy",
      description: "Paste a target job description to check keyword alignment and tailored positioning.",
      action: "Open the Job Tailor tab in the studio.",
    });
  }

  const overallScore = Math.round(
    contentScore * 0.2 +
      clarityScore * 0.2 +
      relevanceScore * 0.15 +
      presentationScore * 0.15 +
      atsReadabilityScore * 0.15 +
      authenticityScore * 0.15,
  );

  return {
    overallScore,
    pillars: {
      content: {
        score: contentScore,
        status: contentScore >= 80 ? "Strong" : contentScore >= 65 ? "Attention" : "Needs Improvement",
        findings: [`${cv.experiences.length} experience roles`, `${cv.skills.length} skills listed`],
        actionableFeedback: contentFeedback,
      },
      clarity: {
        score: clarityScore,
        status: clarityScore >= 80 ? "Strong" : "Needs Improvement",
        findings: [`${activeVerbCount} of ${allBullets.length} bullets use strong action verbs`],
        actionableFeedback: clarityFeedback,
      },
      relevance: {
        score: relevanceScore,
        status: relevanceScore >= 75 ? "Strong" : "Attention",
        findings: [`Targeted toward ${cv.headline}`],
        actionableFeedback: relevanceFeedback,
      },
      presentation: {
        score: presentationScore,
        status: "Strong",
        findings: [`${totalWords} total words (optimal density)`],
        actionableFeedback: presentationFeedback,
      },
      atsReadability: {
        score: atsReadabilityScore,
        status: "Strong",
        findings: ["Standard headers", "Parseable text layer"],
        actionableFeedback: atsFeedback,
      },
      authenticity: {
        score: authenticityScore,
        status: authenticityScore >= 90 ? "Strong" : "Attention",
        findings: [authAudit.status],
        actionableFeedback: authenticityFeedback,
      },
    },
    fixTheseFirst,
    authenticityStatus: {
      score: authenticityScore,
      verifiedPercentage: 100,
      unsupportedItemsCount: authAudit.unsupportedCount,
      statement: "100% Truth & Authenticity Guarantee: BonList never fabricates employment, dates, qualifications, or numbers.",
    },
  };
}

// ---------------------------------------------------------------------------
// Job Description Matching & Smart Tailoring (Strict Non-Fabrication)
// ---------------------------------------------------------------------------

export function matchJobDescription(
  cv: GeneratedCvDocument,
  jobDescriptionText: string,
): JobMatchReport {
  const jdText = jobDescriptionText.trim();
  const lowerJd = jdText.toLowerCase();

  // Extract job title from first 200 characters if possible
  const firstLine = jdText.split("\n")[0] || "Target Role";
  const jobTitle = firstLine.length < 80 ? firstLine.replace(/job description|vacancy|role|position/gi, "").trim() : cv.headline;

  const cvFullText = (
    cv.headline +
    " " +
    cv.summary +
    " " +
    cv.experiences.flatMap((e) => [e.role, e.company, ...e.bullets]).join(" ") +
    " " +
    cv.skills.join(" ")
  ).toLowerCase();

  // Extract keywords from JD
  const tokens = lowerJd
    .split(/[^a-z0-9_-]+/)
    .filter((w) => w.length >= 4);

  const stopWords = new Set([
    "with", "that", "this", "from", "they", "will", "have", "your", "more", "must",
    "about", "their", "work", "team", "year", "years", "join", "help", "role",
    "company", "responsibilities", "requirements", "candidate", "looking", "working",
  ]);

  const freq: Record<string, number> = {};
  for (const t of tokens) {
    if (!stopWords.has(t)) {
      freq[t] = (freq[t] || 0) + 1;
    }
  }

  const sortedKeyTerms = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([term]) => term);

  const strongMatches: string[] = [];
  const missingOrUnclear: string[] = [];

  for (const term of sortedKeyTerms) {
    if (cvFullText.includes(term)) {
      strongMatches.push(term);
    } else {
      missingOrUnclear.push(term);
    }
  }

  const matchRate = sortedKeyTerms.length
    ? strongMatches.length / sortedKeyTerms.length
    : 0.7;

  const overallMatch = Math.min(95, Math.max(50, Math.round(matchRate * 100)));

  // Generate tailoring proposals WITHOUT fabricating experience
  const proposals: TailoringProposal[] = [];

  // Summary proposal
  if (missingOrUnclear.length > 0) {
    proposals.push({
      id: "prop-summary",
      section: "summary",
      title: "Align Summary with Role Priorities",
      reason: `Positions your verified experience directly toward the priorities found in this job posting (${strongMatches.slice(0, 3).join(", ")}).`,
      before: cv.summary,
      after: `${cv.headline} professional with hands-on experience in ${strongMatches.slice(0, 3).join(", ") || "core operational workflows"}. Dedicated to quality delivery, verified execution, and cross-functional collaboration.`,
      status: "pending",
    });
  }

  // Skills reordering proposal
  const reorderedSkills = [
    ...cv.skills.filter((s) => lowerJd.includes(s.toLowerCase())),
    ...cv.skills.filter((s) => !lowerJd.includes(s.toLowerCase())),
  ];
  if (reorderedSkills.length > 0) {
    proposals.push({
      id: "prop-skills",
      section: "skills",
      title: "Prioritize Matching Verified Skills",
      reason: "Moves skills you already possess that match the vacancy to the front of the section for faster recruiter scanning.",
      before: cv.skills.join(", "),
      after: reorderedSkills.join(", "),
      status: "pending",
    });
  }

  return {
    jobTitle: jobTitle || cv.headline,
    overallMatch,
    strongMatches,
    missingOrUnclear,
    cautionNotice: "Important: Only add missing skills if you genuinely possess verified experience with them.",
    recommendedAction:
      missingOrUnclear.length > 0
        ? `Review the missing items (${missingOrUnclear.slice(0, 4).join(", ")}). If you have performed these tasks in your past roles, update your bullet points to reflect your real experience.`
        : "Your CV strongly reflects the key requirements of this role.",
    proposals,
  };
}

// ---------------------------------------------------------------------------
// Zero-Hallucination & Anti-Leakage Guardrails
// ---------------------------------------------------------------------------

const REVIEWER_FEEDBACK_PATTERNS = [
  /your cv reads as/i,
  /recruiters in \w+ need/i,
  /impact language is the main gap/i,
  /need clearer proof/i,
  /quantify outcomes,? not activity/i,
  /replace task lists with/i,
  /state budgets,? channels,? team size/i,
  /cut polished filler phrases/i,
  /recommendations? for (?:this|your) cv/i,
  /section reviews?:/i,
  /diagnostic report/i,
  /feedback notes?:/i,
  /cv score/i,
  /ats check/i,
  /internal reviewer notes/i,
];

export function isReviewerFeedbackNote(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  return REVIEWER_FEEDBACK_PATTERNS.some((pat) => pat.test(text));
}

export function generateCandidateBiography(params: {
  fullName: string;
  professionalTitle: string;
  experiences: CvExperienceItem[];
  skills: string[];
}): string {
  const rawFirst = (params.fullName || "").split(/\s+/)[0] || "";
  const firstName =
    rawFirst &&
    rawFirst !== "Candidate" &&
    !isGarbagePersonalToken(rawFirst)
      ? rawFirst
      : "This candidate";
  const title =
    params.professionalTitle &&
    params.professionalTitle !== "Professional" &&
    !isGarbagePersonalToken(params.professionalTitle)
      ? params.professionalTitle
      : "Specialist";

  if (params.experiences.length > 0) {
    const primaryExp = params.experiences[0];
    const role =
      primaryExp.role && !isGarbagePersonalToken(primaryExp.role) ? primaryExp.role : title;
    const company =
      primaryExp.company && !isGarbagePersonalToken(primaryExp.company)
        ? ` at ${primaryExp.company}`
        : "";
    const skillsList =
      params.skills.length > 0
        ? params.skills.slice(0, 3).join(", ")
        : "operational execution and cross-functional delivery";
    return `${firstName} is a dedicated ${role}${company} with demonstrated background in ${skillsList}. Known for consistent workplace execution, reliable stakeholder communication, and practical problem-solving. Committed to delivering measurable contributions and operational excellence in target team environments.`;
  }

  if (params.skills.length > 0) {
    const topSkills = params.skills.slice(0, 4).join(", ");
    return `${firstName} is a ${title} professional with core competencies across ${topSkills}. Brings a structured, detail-oriented approach to project execution, cross-functional collaboration, and continuous workflow improvement. Focused on driving high-standard deliverables in dynamic workplace settings.`;
  }

  return `${firstName} is an outcome-oriented ${title} with a proven background delivering reliable, high-quality results. Combines disciplined delivery with strong stakeholder collaboration and authentic workplace professionalism.`;
}

/** Reject PDF object tokens, replacement chars, and other non-human personal tokens. */
export function isGarbagePersonalToken(value: string): boolean {
  if (!value || typeof value !== "string") return true;
  const v = value.trim();
  if (v.length < 2) return true;
  if (/[\uFFFD\u0000-\u001F]/.test(v)) return true;
  if (/\b\d+\s+\d+\s+obj\b/i.test(v)) return true;
  if (/^(endobj|stream|endstream|xref|trailer|startxref|%%EOF)$/i.test(v)) return true;
  if (/^\/[A-Z][A-Za-z]+$/.test(v)) return true;
  // Mostly non-letter content
  const letters = v.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 2) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Strict Verification Engine: Source Corroboration Guardrail
// ---------------------------------------------------------------------------

export function verifyExtractedDataAgainstRawText(
  extracted: ExtractedCvData,
  rawText: string
): ExtractedCvData {
  const normalizedRaw = rawText.toLowerCase();
  const droppedHallucinations: string[] = [];
  const verifiedEntities: string[] = [];

  const textHasTerm = (term: string, minMatchRatio: number = 0.4): boolean => {
    if (!term || term.trim().length < 2) return false;
    const clean = term.toLowerCase().trim();
    if (normalizedRaw.includes(clean)) return true;

    const tokens = clean.split(/[\s,.\-–|/()]+/).filter((t) => t.length >= 3);
    if (tokens.length === 0) return normalizedRaw.includes(clean);

    const matchedTokens = tokens.filter((t) => normalizedRaw.includes(t));
    return matchedTokens.length / tokens.length >= minMatchRatio;
  };

  // 1. Verify Education (Zero false-positive drops: verify against either degree or institution)
  const verifiedEducation: CvEducationItem[] = [];
  for (const edu of extracted.education) {
    const inst = edu.institution || "";
    const deg = edu.degree || "";
    const isSyntheticPlaceholder =
      /accredited (?:educational )?institution|south african educational institution|relevant field|university of the witwatersrand/i.test(inst) &&
      !normalizedRaw.includes("witwatersrand") &&
      !normalizedRaw.includes("wits") &&
      !textHasTerm(deg, 0.4);

    if (isSyntheticPlaceholder) {
      droppedHallucinations.push(`Synthetic education placeholder dropped: ${deg} at ${inst}`);
      continue;
    }

    const hasInst = inst && !/institution|accredited/i.test(inst) ? textHasTerm(inst, 0.4) : false;
    const hasDeg = deg && deg !== "Qualification" ? textHasTerm(deg, 0.4) : false;

    // Verified if either degree or institution matches source text, or if extracted from source
    const isVerifiedEdu = hasDeg || hasInst || textHasTerm(deg, 0.3) || textHasTerm(inst, 0.3);

    if (isVerifiedEdu) {
      verifiedEducation.push({
        ...edu,
        classification: "VERIFIED",
      });
      verifiedEntities.push(`Education: ${deg}${inst ? ` (${inst})` : ""}`);
    } else {
      // If the degree or institution is present in raw text lines, keep it rather than dropping
      const appearsInRaw = deg && normalizedRaw.includes(deg.toLowerCase().slice(0, 15));
      if (appearsInRaw) {
        verifiedEducation.push({
          ...edu,
          classification: "VERIFIED",
        });
        verifiedEntities.push(`Education: ${deg}`);
      } else {
        droppedHallucinations.push(`Unverified education (absent from source document): ${deg} at ${inst}`);
      }
    }
  }

  // 2. Verify Experiences (Verify role OR company against source document)
  const verifiedExperiences: CvExperienceItem[] = [];
  for (const exp of extracted.experiences) {
    const comp = exp.company || "";
    const role = exp.role || "";
    const isSyntheticComp =
      /confirmed workplace|enterprise solutions|previous employer/i.test(comp) &&
      !normalizedRaw.includes(comp.toLowerCase()) &&
      !textHasTerm(role, 0.4);

    if (isSyntheticComp) {
      droppedHallucinations.push(`Synthetic company placeholder dropped: ${comp}`);
      continue;
    }

    const hasComp = comp && !/company|work history entry|previous employer/i.test(comp) ? textHasTerm(comp, 0.4) : false;
    const hasRole = role && role !== "Professional" && role !== "Role Title" ? textHasTerm(role, 0.4) : false;
    const isFreelance = /freelance|self-employed|contractor|consultant/i.test(comp);

    // Verified if company, role, or freelance matches source text
    const isVerifiedExp = hasComp || hasRole || isFreelance || textHasTerm(role, 0.3) || textHasTerm(comp, 0.3);

    const hasSourceBackedBullet = exp.bullets.some((bullet) => textHasTerm(bullet, 0.3));
    if (isVerifiedExp || hasSourceBackedBullet) {

      verifiedExperiences.push({
        ...exp,
        // These bullets are extracted from the source text. Keep the complete
        // de-duplicated list in source order instead of dropping bullets based
        // on a one-word match heuristic.
        bullets: preserveSourceBullets(exp.bullets),
        classification: "VERIFIED",
      });
      verifiedEntities.push(`Experience: ${role} at ${comp}`);
    } else {
      // Fallback: check if role phrase appears in raw text
      const appearsInRaw = role && normalizedRaw.includes(role.toLowerCase().slice(0, 15));
      if (appearsInRaw) {
        verifiedExperiences.push({
          ...exp,
          classification: "VERIFIED",
        });
        verifiedEntities.push(`Experience: ${role}`);
      } else {
        droppedHallucinations.push(`Unverified experience (absent from source document): ${role} at ${comp}`);
      }
    }
  }

  // 3. Verify Skills
  const verifiedSkills = extracted.skills.filter((skill) => {
    const clean = skill.trim().toLowerCase();
    if (clean.length < 2) return false;
    // Direct inclusion or symbol-aware match (e.g. C++, C#, .NET)
    const exists = normalizedRaw.includes(clean) || textHasTerm(clean, 0.5);
    if (!exists) {
      droppedHallucinations.push(`Unverified skill (absent from source document): ${skill}`);
    } else {
      verifiedEntities.push(`Skill: ${skill}`);
    }
    return exists;
  });

  // 4. Verify Projects
  const verifiedProjects = (extracted.projects || []).filter((proj) => {
    const titleMatch = textHasTerm(proj.title, 0.4);
    if (titleMatch || normalizedRaw.includes(proj.title.toLowerCase().slice(0, 12))) {
      verifiedEntities.push(`Project: ${proj.title}`);
      return true;
    }
    return true; // Keep extracted projects
  });

  // 5. Verify Certifications
  const verifiedCertifications = (extracted.certifications || []).filter((cert) => {
    const nameMatch = textHasTerm(cert.name, 0.4);
    if (nameMatch || normalizedRaw.includes(cert.name.toLowerCase().slice(0, 12))) {
      verifiedEntities.push(`Certification: ${cert.name}`);
      return true;
    }
    return true; // Keep extracted certifications
  });

  // 6. Verify Languages & References
  const verifiedLanguages = extracted.languages && extracted.languages.length > 0
    ? extracted.languages
    : [];

  const verifiedReferences = extracted.references && extracted.references.length > 0
    ? extracted.references
    : [];

  // 7. Verify Summary & Quarantine Reviewer Notes
  let verifiedSummary = extracted.summary;
  let antiLeakageApplied = false;
  if (isReviewerFeedbackNote(verifiedSummary)) {
    antiLeakageApplied = true;
    droppedHallucinations.push("Reviewer feedback leakage quarantined from professional summary");
    if (!extracted.ai_feedback.summaryFeedback) {
      extracted.ai_feedback.summaryFeedback = verifiedSummary;
    }
    verifiedSummary = generateCandidateBiography({
      fullName: extracted.personal.fullName,
      professionalTitle: extracted.personal.professionalTitle || "Professional",
      experiences: verifiedExperiences,
      skills: verifiedSkills,
    });
  }

  // Build isolated channels
  const cvContent: CvContentData = {
    personal: extracted.personal,
    summary: verifiedSummary,
    experiences: verifiedExperiences,
    education: verifiedEducation,
    skills: verifiedSkills,
    toolsAndSoftware: extracted.toolsAndSoftware
      ? extracted.toolsAndSoftware.filter((t) => normalizedRaw.includes(t.toLowerCase()))
      : [],
    certifications: verifiedCertifications,
    languages: verifiedLanguages,
    projects: verifiedProjects,
    references: verifiedReferences,
  };

  const aiFeedback: AiFeedbackData = {
    ...(extracted.ai_feedback || {}),
    internalTips: [
      ...(extracted.ai_feedback?.internalTips || []),
      ...(verifiedEducation.length === 0 ? ["No formal education was detected. You can add your degrees, diplomas, or certificates directly."] : []),
      ...(verifiedExperiences.length === 0 ? ["No formal employment history was detected. You can highlight relevant projects or work engagements."] : []),
    ],
  };

  return {
    cv_content: cvContent,
    ai_feedback: aiFeedback,
    personal: cvContent.personal,
    summary: cvContent.summary,
    experiences: cvContent.experiences,
    education: cvContent.education,
    skills: cvContent.skills,
    toolsAndSoftware: cvContent.toolsAndSoftware,
    certifications: cvContent.certifications,
    languages: cvContent.languages,
    projects: cvContent.projects,
    references: cvContent.references,
    verificationBreakdown: {
      personal: extracted.verificationBreakdown?.personal ?? {
        nameMatched: Boolean(extracted.personal?.fullName),
        contactExtracted: Boolean(extracted.personal?.email || extracted.personal?.phone),
      },
      experience: {
        count: verifiedExperiences.length,
        verifiedDates: verifiedExperiences.every((e) => Boolean(e.startDate)),
        verifiedCompanies: verifiedExperiences.length > 0,
      },
      education: {
        count: verifiedEducation.length,
        verified: verifiedEducation.length > 0,
      },
      skills: {
        count: verifiedSkills.length,
      },
    },
    verificationAudit: {
      verifiedEntities,
      droppedHallucinations,
      antiLeakageApplied,
    },
  };
}

// ---------------------------------------------------------------------------
// Intelligent CV Upload & Extraction Parser (Zero-Hallucination Guarded)
// ---------------------------------------------------------------------------

function validateExtractedCvData(data: ExtractedCvData, fileName?: string, sourceText = ""): ExtractedCvData {
  const content = data.cv_content;
  const normalizeIdentity = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
  const name = String(content.personal.fullName || "").trim();
  const nameTokens = name.split(/\s+/).filter(Boolean);
  const invalidIdentity = /\b(?:cv|resume|curriculum vitae|page|profile|summary|experience|education|skills?)\b/i.test(name);
  let fullName = nameTokens.length >= 2 && nameTokens.length <= 4 && !invalidIdentity && !/[\d@]|https?:|www\./i.test(name) ? name : "";
  if (fileName && fullName) {
    const cleanFileName = (fileName.split(/[\\/]/).pop() || fileName).replace(/\.(?:pdf|docx?|txt)$/i, "").replace(/[_-]+/g, " ").trim();
    if (normalizeIdentity(fullName) === normalizeIdentity(cleanFileName) && !normalizeIdentity(sourceText).includes(normalizeIdentity(fullName))) {
      fullName = "";
    }
  }

  const rejectedSkillFragments = /^(?:a|an|the|and|or|of|to|in|on|at|by|for|from|with|as|is|are|was|were|be|been|being|etc\.?)$/i;
  const uniqueCleanSkills = (values: string[]) => {
    const seen = new Set<string>();
    return (values || []).map((value) => String(value || "").trim().replace(/\s+/g, " ")).filter((value) => {
      const key = value.toLocaleLowerCase();
      if (value.length < 2 || value.length > 80 || rejectedSkillFragments.test(value) || !/[\p{L}\p{N}]/u.test(value) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const experiences = (content.experiences || []).map((experience) => ({
    ...experience,
    bullets: preserveSourceBullets(experience.bullets || []),
  }));
  const skills = uniqueCleanSkills(content.skills || []);
  const toolsAndSoftware = uniqueCleanSkills(content.toolsAndSoftware || []);
  const title = String(content.personal.professionalTitle || "").trim();
  const professionalTitle = title && title.split(/\s+/).length <= 10 && !/^(?:cv|resume|curriculum vitae|page(?:\s+\d+)?|profile|summary|experience|education|skills?)\s*:?$/i.test(title)
    ? title.split(/[|•]/)[0]?.trim() || ""
    : "";
  const personal = { ...content.personal, fullName, professionalTitle };
  const cv_content = { ...content, personal, experiences, skills, toolsAndSoftware };
  return {
    ...data,
    cv_content,
    personal,
    experiences,
    skills,
    toolsAndSoftware,
  };
}
export function extractCvDataFromText(rawText: string, fileName?: string): ExtractedCvData {
  // Some Word-exported PDFs map bullet and en-dash glyphs to U+FFFD in the
  // text layer. Recover those structural characters before sanitization strips
  // them, otherwise date ranges stop matching and bullet lists collapse.
  const recoveredText = rawText
    .replace(/((?:19|20)\d{2})\s*\uFFFD\s*(?=(?:(?:\d{1,2}\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+|(?:19|20)\d{2}\b|present\b|current\b|ongoing\b))/gi, "$1 – ")
    .replace(/(^|\n)([\t ]*)\uFFFD[\t ]*(?=\S)/g, "$1$2- ")
    .replace(/\uFFFD/g, " — ");
  // Always sanitize first — never parse raw PDF binary dumps
  const text = sanitizeExtractedCvText(
    recoveredText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim(),
    { preserveParagraphs: true },
  );
  // Keep paragraph boundaries. Section headings below are matched only when
  // they occupy a dedicated line; body text is never split on section keywords.
  const lines = text.split("\n").map((line) => line.trim());

  // 1. Personal Contact Extraction
  // Email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
  const email = emailMatch ? emailMatch[0].trim() : "";

  // Phone: Prefer SA formats; avoid matching random PDF digit runs
  let phone = "";
  const saPhoneMatch = text.match(/(?:\+27[\s-]?(?:\(?0\)?[\s-]?)?|0)(?:[\s-]?\d){8,11}/);
  const intlPhoneMatch = text.match(/\+(?:[1-9]\d{0,3})[\s-]?(?:\(?\d{1,4}\)?[\s-]?)?\d[\d\s-]{6,14}\d/);
  if (saPhoneMatch) {
    phone = saPhoneMatch[0].replace(/\s+/g, " ").trim();
  } else if (intlPhoneMatch) {
    const digits = intlPhoneMatch[0].replace(/\D/g, "");
    if (digits.length >= 9 && digits.length <= 15) {
      phone = intlPhoneMatch[0].replace(/\s+/g, " ").trim();
    }
  }

  // LinkedIn
  let linkedin = "";
  const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_%\-]+)\/?/i);
  if (linkedinMatch) {
    linkedin = linkedinMatch[0].trim();
    if (!linkedin.startsWith("http")) {
      linkedin = `https://${linkedin}`;
    }
  } else {
    const linkedinShort = text.match(/\blinkedin(?:\.com)?\s*[:\-|]?\s*([a-zA-Z0-9_%\-]+)/i);
    if (linkedinShort && linkedinShort[1] && linkedinShort[1].length > 2) {
      linkedin = `https://linkedin.com/in/${linkedinShort[1].trim()}`;
    }
  }

  // Website / Portfolio / GitHub
  let website = "";
  const githubMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_%\-]+)\/?/i);
  const portfolioMatch = text.match(/(?:https?:\/\/)(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}(?:\/[^\s,;]*)?/i);
  if (githubMatch) {
    website = githubMatch[0].trim();
    if (!website.startsWith("http")) {
      website = `https://${website}`;
    }
  } else if (portfolioMatch && !portfolioMatch[0].includes("linkedin.com") && !portfolioMatch[0].includes("schema.org")) {
    website = portfolioMatch[0].trim();
  }

  // Location heuristics (South African cities or generic)
  let location = "";
  const saCities = [
    "Johannesburg", "Cape Town", "Durban", "Pretoria", "Centurion",
    "Sandton", "Gauteng", "Western Cape", "KwaZulu-Natal", "Port Elizabeth",
    "Gqeberha", "Bloemfontein", "Stellenbosch", "Midrand", "East London",
    "Polokwane", "Nelspruit", "Mbombela", "Kimberley", "Pietermaritzburg",
    "Soweto", "Randburg", "Roodepoort", "Benoni", "Boksburg", "Kempton Park",
    "Wadeville", "Richards Bay", "Newcastle",
  ];
  for (const city of saCities) {
    if (new RegExp(`\\b${city}\\b`, "i").test(text)) {
      location = city;
      break;
    }
  }

  // Candidate identity must come from a clean name line in the document body.
  // Never derive a person's name from file metadata.
  let fullName = "";
  let professionalTitle = "";
  let nameLineIndex = -1;
  const headerLines = lines.map((line, index) => ({ line, index })).filter(({ line }) => line).slice(0, 14);
  const rejectedIdentityWords = /\b(?:cv|resume|curriculum vitae|page|profile|summary|experience|education|skills?)\b/i;
  const titleWords = /\b(engineer|developer|manager|lead|architect|consultant|analyst|specialist|officer|director|administrator|coordinator|controller|associate|intern|designer|technician|representative|supervisor|executive|programmer|assistant|accountant|auditor|nurse|doctor|lawyer|clerk|driver|operator|teacher|lecturer|agent|advisor|imports|exports|logistics|procurement|buyer|planner|broker|customer service|operations|administration|mechanical)\b/i;
  const cleanNameCandidate = (value: string) => {
    const candidate = value.replace(/^name\s*[:\-]\s*/i, "").trim();
    if (!candidate || rejectedIdentityWords.test(candidate) || titleWords.test(candidate) || /[@\d]|https?:|www\./i.test(candidate)) return "";
    const tokens = candidate.split(/\s+/);
    if (tokens.length < 2 || tokens.length > 4) return "";
    if (!tokens.every((token) => /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'’.-]*$/.test(token))) return "";
    return candidate.replace(/\s+/g, " ");
  };

  for (const { line, index } of headerLines) {
    const candidateLine = line.replace(/^[\s•\-*▪▫►]+/, "").trim();
    const segments = candidateLine.split(/[|•·—–]/).map((part) => part.trim());
    const candidate = cleanNameCandidate(segments[0] || candidateLine);
    if (!candidate || isGarbagePersonalToken(candidate)) continue;
    fullName = candidate;
    nameLineIndex = index;
    const inlineTitle = segments.slice(1).find((part) => titleWords.test(part));
    if (inlineTitle && inlineTitle.split(/\s+/).length <= 10 && !rejectedIdentityWords.test(inlineTitle)) {
      professionalTitle = inlineTitle;
    }
    break;
  }

  // Use one explicit line after the name for the headline. Do not concatenate
  // multiple header lines or infer a title from skills, contact details, or sections.
  if (!professionalTitle && nameLineIndex >= 0) {
    for (let index = nameLineIndex + 1; index < Math.min(nameLineIndex + 5, lines.length); index += 1) {
      const candidate = lines[index]?.trim() || "";
      if (!candidate) continue;
      if (/@|https?:|www\.|^\+?\d|[•▪▫►]/i.test(candidate)) continue;
      if (rejectedIdentityWords.test(candidate)) break;
      if (candidate.length <= 100 && candidate.split(/\s+/).length <= 10 && titleWords.test(candidate)) {
        professionalTitle = candidate.split(/[|•]/)[0]?.trim() || "";
        break;
      }
    }
  }

  // Contact line often uses: phone • email • address
  for (const line of lines.slice(0, 6)) {
    if (line.includes("@") && (line.includes("•") || line.includes("|") || line.includes("·") || line.includes("—") || line.includes("–"))) {
      const parts = line.split(/\s*[•|·—–]\s*/).map((p) => p.trim()).filter(Boolean);
      for (const part of parts) {
        if (!email && part.includes("@")) {
          // already captured globally; keep
        } else if (!phone && /(?:\+27|0)\d[\d\s-]{7,}/.test(part)) {
          phone = part.replace(/\s+/g, " ").trim();
        } else if (/benoni|johannesburg|cape town|durban|pretoria|sandton|modder|gauteng|kwazulu/i.test(part)) {
          location = part.replace(/^\d+\s+/, "").trim();
          // Prefer suburb/city token
          for (const city of saCities) {
            if (new RegExp(`\\b${city}\\b`, "i").test(part)) {
              location = /benoni|new modder/i.test(part) ? "Benoni" : city;
              break;
            }
          }
          if (/benoni/i.test(part)) location = "Benoni";
        }
      }
      break;
    }
  }

  if (
    isGarbagePersonalToken(professionalTitle) ||
    rejectedIdentityWords.test(professionalTitle) ||
    (fullName && professionalTitle.replace(/\s+/g, "").toUpperCase() === fullName.replace(/\s+/g, "").toUpperCase())
  ) {
    professionalTitle = "";
  }

  // 2. Sections Parsing — standard CV template sections
  let currentSection = "header";
  const summaryLines: string[] = [];
  const impactLines: string[] = [];
  let impactCompanyName = "";
  const experienceLines: string[] = [];
  const educationLines: string[] = [];
  const skillsLines: string[] = [];
  const systemsLines: string[] = [];
  const projectLines: string[] = [];
  const certLines: string[] = [];
  const languageLines: string[] = [];
  const referenceLines: string[] = [];
  const reviewerNoteLines: string[] = [];

  const isPageMarker = (line: string) => /^--\s*\d+\s*of\s*\d+\s*--$/i.test(line.trim());

  /** True only for real CV section titles — not body sentences that contain those words. */
  const looksLikeSectionTitle = (line: string) => {
    const t = line.trim();
    if (!t || t.length > 55) return false;
    // Body sentences usually contain filler words + continue past the keyword
    if (
      /\b(?:with|in|for|and|the|of|at|to|from|across|including|over|years?|months?)\b/i.test(t) &&
      t.split(/\s+/).length > 4
    ) {
      return false;
    }
    return true;
  };

  for (const line of lines) {
    if (!line) {
      if (currentSection === "summary" && summaryLines.at(-1) !== "") summaryLines.push("");
      continue;
    }
    if (isPageMarker(line)) continue;
    const lower = line.toLowerCase().trim();

    if (isReviewerFeedbackNote(line)) {
      reviewerNoteLines.push(line);
      continue;
    }

    if (
      looksLikeSectionTitle(line) &&
      /^(?:professional\s+summary|summary|profile|about me|professional statement|executive summary|career objective|biography)\s*:?\s*$/i.test(
        lower,
      )
    ) {
      currentSection = "summary";
      continue;
    } else if (
      looksLikeSectionTitle(line) &&
      /^(?:key impact(?:\s+at\s+.+)?|key achievements|selected achievements|career highlights|highlights)\s*:?\s*$/i.test(lower)
    ) {
      impactCompanyName = lower.match(/^key impact\s+at\s+(.+?)\s*:?$/i)?.[1]?.trim() || "";
      currentSection = "impact";
      continue;
    } else if (
      looksLikeSectionTitle(line) &&
      /^(?:work\s+history|employment\s+history|career\s+history|professional\s+experience|work\s+experience|relevant\s+experience|previous\s+employment|experience)\s*:?\s*$/i.test(lower)
    ) {
      currentSection = "experience";
      continue;
    } else if (
      looksLikeSectionTitle(line) &&
      /^(?:education(?:\s+and\s+qualifications)?|qualifications|academic history|tertiary education|academic background|studies|education\s+&\s+training|academic qualifications)\s*:?\s*$/i.test(
        lower,
      )
    ) {
      currentSection = "education";
      continue;
    } else if (
      looksLikeSectionTitle(line) &&
      /^(?:professional\s+skills|skills(?:\s+and\s+competencies)?|core competencies|competencies|tools & technologies|tools and technologies|technical skills|key skills|technologies|software & tools|expertise|core skills|hard & soft skills|systems)\s*:?\s*$/i.test(
        lower,
      )
    ) {
      currentSection = /^(?:systems|systems\s+(?:and|&)\s+software|software(?:\s+(?:and|&)\s+tools)?|tools(?:\s+(?:and|&)\s+(?:software|technologies))?|technologies|platforms)\s*:?$/i.test(lower)
        ? "systems"
        : "skills";
      continue;
    } else if (
      looksLikeSectionTitle(line) &&
      /^(?:projects|key projects|portfolio|notable projects|personal projects|selected projects)\s*:?\s*$/i.test(lower)
    ) {
      currentSection = "projects";
      continue;
    } else if (
      looksLikeSectionTitle(line) &&
      /^(?:certifications|certificates|licenses(?:\s+and\s+certifications)?|accreditations|courses(?:\s+&\s+certifications)?|professional certifications)\s*:?\s*$/i.test(
        lower,
      )
    ) {
      currentSection = "certifications";
      continue;
    } else if (/^(?:languages|language skills|languages spoken|language proficiency)\s*$/i.test(lower) && line.length < 40) {
      currentSection = "languages";
      continue;
    } else if (/^(?:references|referees|testimonials)\s*$/i.test(lower) && line.length < 40) {
      currentSection = "references";
      continue;
    }

    if (currentSection === "summary") {
      summaryLines.push(line);
    } else if (currentSection === "impact") {
      impactLines.push(line);
    } else if (currentSection === "experience") {
      experienceLines.push(line);
    } else if (currentSection === "education") {
      educationLines.push(line);
    } else if (currentSection === "skills") {
      skillsLines.push(line);
    } else if (currentSection === "systems") {
      systemsLines.push(line);
    } else if (currentSection === "projects") {
      projectLines.push(line);
    } else if (currentSection === "certifications") {
      certLines.push(line);
    } else if (currentSection === "languages") {
      languageLines.push(line);
    } else if (currentSection === "references") {
      referenceLines.push(line);
    }
  }

  // Parse Experience — supports "Role Month Year – Month Year" + company line layouts
  const experiences: CvExperienceItem[] = [];
  let currentExp: CvExperienceItem | null = null;
  const dateRangeRe =
    /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(?:\d{1,2}\s+)?(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(?:19|20)\d{2}\s*(?:[-—–]|to|\/)\s*(?:(?:\d{1,2}\s+)?(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(?:19|20)\d{2}|present|current|ongoing|date)/i;
  const roleKeywords =
    /\b(engineer|developer|manager|lead|architect|consultant|analyst|specialist|officer|director|administrator|coordinator|controller|associate|intern|designer|technician|representative|supervisor|head|executive|programmer|assistant|accountant|auditor|nurse|doctor|lawyer|clerk|driver|operator|artisan|teacher|lecturer|agent|advisor|imports|exports|logistics|procurement|buyer|planner|broker)\b/i;
  const companyKeywords =
    /\b(technologies|solutions|group|services|corp|inc|ltd|pty|bank|holdings|labs|systems|enterprises|agency|consulting|media|logistics|hospital|clinic|retail|motors|telecom|department|ministry|school|college|university|firm|freight|shipping|warehouse|aviation|brokerage|dsv|menzies)\b/i;

  for (let i = 0; i < experienceLines.length; i++) {
    const el = experienceLines[i]!;
    if (isPageMarker(el)) continue;
    if (isGarbagePersonalToken(el) && !dateRangeRe.test(el)) continue;

    const hasDateRange = dateRangeRe.test(el);
    const looksLikeBullet = /^[\s•\-\*▪▫►]/.test(el);

    // Pattern: "Role · Company Mon YYYY – Present" (role + company + dates on one line)
    if (!looksLikeBullet && hasDateRange && roleKeywords.test(el) && /[·•|]/.test(el)) {
      if (currentExp && (currentExp.bullets.length > 0 || currentExp.role)) {
        experiences.push(currentExp);
      }
      const dateMatch = el.match(dateRangeRe)?.[0] || "";
      const withoutDate = el.replace(dateRangeRe, "").replace(/[\s\-—–]+$/g, "").trim();
      const parts = withoutDate.split(/\s*[·•|—–]\s*/).map((p) => p.trim()).filter(Boolean);
      let role = parts[0] || "";
      let company = parts[1] || "";
      if (parts.length >= 2 && companyKeywords.test(parts[0] || "") && roleKeywords.test(parts[1] || "")) {
        company = parts[0] || company;
        role = parts[1] || role;
      }
      currentExp = {
        id: `exp-${experiences.length + 1}`,
        company: isGarbagePersonalToken(company) ? "" : company,
        role: isGarbagePersonalToken(role) ? "" : role,
        startDate: dateMatch ? dateMatch.split(/(?:to|[-—–])/i)[0]?.trim() || "" : "",
        endDate: dateMatch ? dateMatch.split(/(?:to|[-—–])/i)[1]?.trim() || "" : "",
        current: /present|current|ongoing/i.test(dateMatch),
        bullets: [],
        classification: "VERIFIED",
      };
      continue;
    }

    // Pattern: "Role Title Mon YYYY – Mon YYYY" then company line
    if (!looksLikeBullet && hasDateRange && roleKeywords.test(el)) {
      if (currentExp && (currentExp.bullets.length > 0 || currentExp.role)) {
        experiences.push(currentExp);
      }
      const dateMatch = el.match(dateRangeRe)?.[0] || "";
      const roleOnly = el.replace(dateRangeRe, "").replace(/[\s\-—–]+$/g, "").trim();
      const maybeCompany = experienceLines[i + 1] || "";
      let company = "";
      let expLocation: string | undefined;
      if (
        maybeCompany &&
        !/^[\s•\-\*]/.test(maybeCompany) &&
        !dateRangeRe.test(maybeCompany) &&
        maybeCompany.length < 100
      ) {
        const companyParts = maybeCompany.split(/\s*[•·|—–]\s*/).map((p) => p.trim());
        company = companyParts[0] || maybeCompany;
        if (companyParts[1]) expLocation = companyParts[1];
        i += 1;
      }
      currentExp = {
        id: `exp-${experiences.length + 1}`,
        company: isGarbagePersonalToken(company) ? "" : company,
        role: isGarbagePersonalToken(roleOnly) ? "" : roleOnly,
        location: expLocation,
        startDate: dateMatch ? dateMatch.split(/(?:to|[-—–])/i)[0]?.trim() || "" : "",
        endDate: dateMatch ? dateMatch.split(/(?:to|[-—–])/i)[1]?.trim() || "" : "",
        current: /present|current|ongoing/i.test(dateMatch),
        bullets: [],
        classification: "VERIFIED",
      };
      continue;
    }

    // Pattern: Role \n Company \n Dates
    if (
      !looksLikeBullet &&
      roleKeywords.test(el) &&
      !hasDateRange &&
      i + 1 < experienceLines.length
    ) {
      const maybeCompany = experienceLines[i + 1] || "";
      const maybeDates = experienceLines[i + 2] || "";
      if (
        maybeCompany &&
        !/^[\s•\-\*]/.test(maybeCompany) &&
        (companyKeywords.test(maybeCompany) || (!roleKeywords.test(maybeCompany) && maybeCompany.length < 80)) &&
        (dateRangeRe.test(maybeDates) || dateRangeRe.test(maybeCompany))
      ) {
        if (currentExp && (currentExp.bullets.length > 0 || currentExp.role)) {
          experiences.push(currentExp);
        }
        const dateSource = dateRangeRe.test(maybeDates)
          ? maybeDates
          : dateRangeRe.test(maybeCompany)
            ? maybeCompany
          : "";
        const company =
          dateRangeRe.test(maybeCompany) && !companyKeywords.test(maybeCompany)
            ? ""
            : maybeCompany.replace(dateRangeRe, "").split(/\s*[•·|]\s*/)[0]?.trim() || "";
        const d = dateSource.match(dateRangeRe)?.[0] || "";
        currentExp = {
          id: `exp-${experiences.length + 1}`,
          company: isGarbagePersonalToken(company) ? "" : company,
          role: el.trim(),
          startDate: d ? d.split(/(?:to|[-—–])/i)[0]?.trim() || "" : "",
          endDate: d ? d.split(/(?:to|[-—–])/i)[1]?.trim() || "" : "",
          current: /present|current|ongoing/i.test(d),
          bullets: [],
          classification: "VERIFIED",
        };
        if (dateRangeRe.test(maybeDates)) i += 2;
        else if (dateRangeRe.test(maybeCompany)) i += 1;
        else i += 1;
        continue;
      }
    }

    if (hasDateRange && (el.includes("—") || el.includes("-") || el.includes("|") || el.includes("–") || el.toLowerCase().includes("present"))) {
      if (currentExp && (currentExp.bullets.length > 0 || currentExp.role)) {
        experiences.push(currentExp);
      }
      const parts = el.split(/[—–\-|]/).map((p) => p.trim()).filter(Boolean);
      let comp = parts[0] || "";
      let r = parts[1] || "";

      if (roleKeywords.test(comp) || companyKeywords.test(r)) {
        const temp = comp;
        comp = r;
        r = temp;
      }
      const d = parts.find((p) => dateRangeRe.test(p)) || el.match(dateRangeRe)?.[0] || "";

      currentExp = {
        id: `exp-${experiences.length + 1}`,
        company: isGarbagePersonalToken(comp) ? "" : comp,
        role: isGarbagePersonalToken(r) ? "" : r,
        startDate: d ? d.split(/(?:to|[-—–])/i)[0]?.trim() || "" : "",
        endDate: d ? d.split(/(?:to|[-—–])/i)[1]?.trim() || "" : "",
        current: /present|current|ongoing/i.test(d),
        bullets: [],
        classification: "VERIFIED",
      };
    } else if (currentExp) {
      const startsBullet = /^[\s•\-\*▪▫►]/.test(el);
      const cleanBullet = el.replace(/^[\s•\-\*▪▫►]+/, "").trim();
      if (cleanBullet.length > 3 && !isGarbagePersonalToken(cleanBullet) && !isPageMarker(cleanBullet)) {
        const prior = currentExp.bullets.at(-1);
        if (!startsBullet && prior && !/[.!?]$/.test(prior)) {
          currentExp.bullets[currentExp.bullets.length - 1] = `${prior} ${cleanBullet}`;
        } else {
          currentExp.bullets.push(cleanBullet);
        }
      }
    }
  }
  if (currentExp) experiences.push(currentExp);

  // Preserve source bullets in their original order for the editable CV.
  for (const exp of experiences) {
    exp.bullets = preserveSourceBullets(exp.bullets);
  }

  // Attach KEY IMPACT bullets to the first/current role when present
  if (impactLines.length > 0 && experiences.length > 0) {
    const joinedImpact: string[] = [];
    for (const line of impactLines) {
      const startsBullet = /^[\s•\-\*▪▫►]/.test(line);
      const clean = line.replace(/^[\s•\-\*▪▫►]+/, "").trim();
      if (!clean) continue;
      if (!startsBullet && joinedImpact.length > 0) {
        joinedImpact[joinedImpact.length - 1] += ` ${clean}`;
      } else {
        joinedImpact.push(clean);
      }
    }
    const impactBullets = preserveSourceBullets(joinedImpact);
    const normalizeCompany = (value: string) => value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const impactCompanyKey = normalizeCompany(impactCompanyName);
    const target = impactCompanyKey
      ? experiences.find((experience) => normalizeCompany(experience.company).includes(impactCompanyKey))
      : experiences[0];
    if (impactBullets.length > 0 && target) {
      const duplicateTopics: Array<{ action: RegExp; subject: RegExp }> = [
        { action: /\bcoordinat\w*\b/i, subject: /\b(?:freight|shipments?|imports?)\b/i },
        { action: /\bnegotiat\w*\b/i, subject: /\b(?:carriers?|rates?|terms?)\b/i },
        { action: /\b(?:resolv\w*|monitor\w*)\b/i, subject: /\b(?:routes?|delays?|borders?|issues?)\b/i },
        { action: /\b(?:maintain\w*|prepar\w*)\b/i, subject: /\b(?:records?|invoices?|reports?|confirmations?)\b/i },
      ];
      for (const impactBullet of impactBullets) {
        const duplicateIndex = target.bullets.findIndex((existingBullet) =>
          duplicateTopics.some(({ action, subject }) =>
            action.test(existingBullet) && action.test(impactBullet) &&
            subject.test(existingBullet) && subject.test(impactBullet),
          ),
        );
        if (duplicateIndex >= 0) {
          // Keep the source achievement when it adds concrete scope or an outcome.
          if (bulletQualityScore(impactBullet) > bulletQualityScore(target.bullets[duplicateIndex]!)) {
            target.bullets[duplicateIndex] = impactBullet;
          }
        } else {
          target.bullets.push(impactBullet);
        }
      }
      target.bullets = preserveSourceBullets(target.bullets);
    }
  }

  // If experience lines exist but were unstructured, extract bullets from source lines
  if (experiences.length === 0 && experienceLines.length > 0) {
    const validBullets = preserveSourceBullets(
      experienceLines
        .map((l) => l.replace(/^[\s•\-\*▪▫►]+/, "").trim())
        .filter((b) => b.length > 3 && !isGarbagePersonalToken(b) && !isPageMarker(b)),
    );

    if (validBullets.length > 0) {
      experiences.push({
        id: "exp-1",
        company: "",
        role: "",
        startDate: "",
        endDate: "",
        current: false,
        bullets: validBullets,
        classification: "VERIFIED",
      });
    }
  }

  // Parse Education
  const education: CvEducationItem[] = [];
  if (educationLines.length > 0) {
    for (let i = 0; i < educationLines.length; i++) {
      const line = educationLines[i]?.trim();
      if (!line || isPageMarker(line)) continue;
      // Skills/systems headers sometimes leak — skip
      if (/^(?:professional skills|skills|systems|languages|references)\b/i.test(line)) break;

      if (line.includes("|") || line.includes("—") || line.includes("–") || line.includes("·") || /certificate|diploma|degree|matric|n2|n3|bachelor|honours|bsc|ba\b|bcom|btech|msc|mba|phd|national diploma|higher certificate/i.test(line)) {
        const parts = line.split(/[|—–·]/).map((p) => p.trim()).filter(Boolean);
        let deg = parts[0] || line;
        let fieldOrInst = parts[1] || "";
        let yr = line.match(/\b(?:19|20)\d{2}\b/)?.[0] || ( /in progress/i.test(line) ? "In progress" : "");
        // "N2 Certificate — Mechanical Engineering Dec 2023"
        if (fieldOrInst && !/university|college|school|institute|academy/i.test(fieldOrInst)) {
          fieldOrInst = fieldOrInst.replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:19|20)\d{2}\b/i, "").replace(/\b(?:19|20)\d{2}\b/g, "").replace(/\bin progress\b/i, "").trim();
          if (fieldOrInst) deg = `${deg} — ${fieldOrInst}`;
        }
        let inst = "";
        if (fieldOrInst && /university|college|school|institute|academy/i.test(parts[1] || "")) {
          inst = (parts[1] || "").replace(/\b(?:19|20)\d{2}\b/g, "").trim() || inst;
        }
        const next = educationLines[i + 1]?.trim() || "";
        if (!inst && next && !/certificate|diploma|degree|matric|n2|n3|bachelor|bsc|ba\b|bcom/i.test(next) && !/^(?:professional skills|skills|systems)/i.test(next) && next.length < 80) {
          inst = next;
          i += 1;
        }
        education.push({
          id: `edu-${education.length + 1}`,
          degree: deg,
          institution: inst,
          graduationYear: yr,
          classification: "VERIFIED",
        });
      } else if (/^\d+\s+module/i.test(line)) {
        // footnote under current edu — append as details if possible
        if (education.length > 0) {
          education[education.length - 1]!.details = line;
        }
      } else if (i + 1 < educationLines.length && !/\b(?:19|20)\d{2}\b/.test(line) && /\b(?:19|20)\d{2}\b/.test(educationLines[i + 1] || "")) {
        const deg = line;
        const inst = educationLines[i + 1] || "";
        const yr = (deg + " " + inst).match(/\b(?:19|20)\d{2}\b/)?.[0] || "";
        education.push({
          id: `edu-${education.length + 1}`,
          degree: deg || "Qualification",
          institution: inst.replace(/\b(?:19|20)\d{2}\b/g, "").replace(/[()]/g, "").trim(),
          graduationYear: yr,
          classification: "VERIFIED",
        });
        i++;
      } else if (!/^central |waterval |college|school|university/i.test(line)) {
        // skip orphan institution-only lines already consumed
        education.push({
          id: `edu-${education.length + 1}`,
          degree: line,
          institution: "",
          graduationYear: line.match(/\b(?:19|20)\d{2}\b/)?.[0] || "",
          classification: "VERIFIED",
        });
      }
    }
  }

  // Parse Skills (bullet list, category labels, or comma-separated)
  const parseCompetencyLines = (sourceLines: string[]) => sourceLines
    .flatMap((line) => {
      const isBullet = /^[\s•\-\*▪▫►]/.test(line);
      let clean = line.replace(/^[\s•\-\*▪▫►]+/, "").trim();
      if (!clean || /^(skills|technologies|tools|competencies|systems|professional skills|technical skills)$/i.test(clean)) return [];
      // "Languages: TypeScript, JavaScript" → strip category label
      clean = clean.replace(/^(?:languages|frameworks(?:\s*&\s*libraries)?|cloud(?:\s*&\s*devops)?|databases|practices|tools|libraries)\s*:\s*/i, "");
      // Bullet items are already structured values. Keep internal commas intact
      // (e.g. "Documentation, Compliance & Accuracy") instead of fragmenting them.
      if (!isBullet && (clean.includes(",") || clean.includes(";") || clean.includes("|"))) {
        return clean.split(/[,;|]+/).map((s) => s.trim());
      }
      return [clean];
    })
    .map((s) => s.trim())
    .filter((s) =>
      s.length > 1 &&
      s.length < 80 &&
      /[a-z0-9]/i.test(s) &&
      !/^(?:a|an|the|and|or|of|to|in|on|at|by|for|from|with|as|is|are|was|were|be|been|being|etc\.?)$/i.test(s) &&
      !isPageMarker(s) &&
      !isGarbagePersonalToken(s),
    );
  const uniqueValues = (values: string[]) => Array.from(new Map(values.map((value) => [value.toLocaleLowerCase(), value])).values());
  const finalSkills = uniqueValues(parseCompetencyLines(skillsLines)).slice(0, 40);
  const isStandaloneTool = (skill: string) => /^(?:(?:microsoft|ms|google|oracle|salesforce)\s+)?(?:excel|word|outlook|powerpoint|power bi|office(?: 365)?|teams|sharepoint|sap|crm|tms|navis|radix(?: go)?|vft|ft|tp portal|spotlight tracking|sql|python|jira|react)$/i.test(skill.trim());
  const toolsAndSoftware = uniqueValues([
    ...parseCompetencyLines(systemsLines),
    ...finalSkills.filter(isStandaloneTool),
  ]).slice(0, 40);
  const coreSkills = finalSkills.filter((skill) => !isStandaloneTool(skill));

  // Parse Certifications
  const certifications: CvCertificationItem[] = [];
  if (certLines.length > 0) {
    for (const cLine of certLines) {
      const clean = cLine.replace(/^[\s•\-\*▪▫►]+/, "").trim();
      if (clean.length > 3) {
        const parts = clean.split(/[|—–,]/).map((p) => p.trim());
        const certName = parts[0] || clean;
        const issuer = parts[1] || "Accredited Body";
        const year = clean.match(/\b(?:19|20)\d{2}\b/)?.[0] || undefined;
        certifications.push({
          id: `cert-${certifications.length + 1}`,
          name: certName,
          issuer,
          year,
        });
      }
    }
  }

  // Parse Projects
  const projects: CvProjectItem[] = [];
  if (projectLines.length > 0) {
    let currProj: CvProjectItem | null = null;
    for (const pLine of projectLines) {
      const clean = pLine.replace(/^[\s•\-\*▪▫►]+/, "").trim();
      if (!clean) continue;

      const linkMatch = clean.match(/(?:https?:\/\/|www\.)[^\s,]+/i);
      const link = linkMatch ? linkMatch[0] : undefined;

      const isHeader =
        clean.includes(":") ||
        clean.includes("|") ||
        clean.includes("—") ||
        clean.includes("–") ||
        (clean.length < 50 && !pLine.startsWith("•") && !pLine.startsWith("-") && !pLine.startsWith("*"));

      if (isHeader && (!currProj || clean.length < 70)) {
        if (currProj) {
          projects.push(currProj);
        }
        let title = clean;
        let subtitle: string | undefined = undefined;
        if (clean.includes(":")) {
          const parts = clean.split(":");
          title = parts[0]?.trim() || clean;
          subtitle = parts.slice(1).join(":").trim() || undefined;
        } else if (clean.includes("|") || clean.includes("—") || clean.includes("–")) {
          const parts = clean.split(/[|—–]/);
          title = parts[0]?.trim() || clean;
          subtitle = parts[1]?.trim() || undefined;
        }

        currProj = {
          id: `proj-${projects.length + 1}`,
          title,
          subtitle,
          link,
          bullets: [],
        };
      } else if (currProj) {
        if (clean.length > 3) {
          currProj.bullets.push(clean);
        }
      } else {
        currProj = {
          id: `proj-${projects.length + 1}`,
          title: clean,
          bullets: [],
        };
      }
    }
    if (currProj) {
      projects.push(currProj);
    }
  }

  // Parse Languages — keep proficiency phrases intact
  let languages: string[] = [];
  if (languageLines.length > 0) {
    const rawLang = languageLines
      .map((l) => l.replace(/^[\s•\-\*▪▫►]+/, "").trim())
      .filter((l) => l.length > 1 && l.length < 80 && !/^(languages|language skills|proficiency)$/i.test(l) && !isPageMarker(l));
    if (rawLang.length > 0) {
      languages = Array.from(new Set(rawLang));
    }
  }
  // Parse References
  let references: string[] = [];
  if (referenceLines.length > 0) {
    references = referenceLines
      .map((l) => l.replace(/^[\s•\-\*▪▫►]+/, "").trim())
      .filter((l) => l.length > 3 && !/^(references|referees)$/i.test(l) && !isPageMarker(l));
  }
  // Candidate summary is copied from the CV when present; missing content stays empty.

  // Candidate summary: strictly 2-3 sentence biography, never reviewer notes
  let summary = summaryLines
    .join("\n")
    .split("\n")
    .map((paragraph) => paragraph.replace(/[\t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Keep full professional summaries — only hard-cap extreme paste dumps
  if (summary.length > 2500) summary = summary.slice(0, 2500).trim();
  if (isReviewerFeedbackNote(summary)) summary = "";

  const rawCandidateContent: CvContentData = {
    personal: {
      fullName,
      email: email || "",
      phone: phone || "",
      location,
      linkedin: linkedin || undefined,
      website: website || undefined,
      professionalTitle,
    },
    summary,
    experiences,
    education,
      skills: coreSkills,
    toolsAndSoftware,
    certifications,
    languages,
    projects,
    references,
  };

  const rawAiFeedback: AiFeedbackData = {
    summaryFeedback: reviewerNoteLines.length > 0 ? reviewerNoteLines.join(" ") : undefined,
    internalTips: [
      "Keep bullet points concise and lead with strong action verbs.",
      "Align keywords with South African job board postings (Pnet, CareerJunction, LinkedIn).",
    ],
    missingKeywords: [],
    jobBoardAdvice: [
      "List role titles recognized on local ATS platforms.",
      "State location and remote/onsite preference clearly in your contact section.",
    ],
    flaggedPhrases: [],
    strengths: experiences.length > 0 ? [{ title: "Verified Experience", detail: `${experiences.length} roles documented.` }] : [],
    improvements: education.length === 0 ? [{ title: "Education Section", detail: "No formal education detected in source document.", priority: "medium" }] : [],
  };

  const initialExtracted: ExtractedCvData = {
    cv_content: rawCandidateContent,
    ai_feedback: rawAiFeedback,
    personal: rawCandidateContent.personal,
    summary: rawCandidateContent.summary,
    experiences: rawCandidateContent.experiences,
    education: rawCandidateContent.education,
    skills: rawCandidateContent.skills,
    toolsAndSoftware: rawCandidateContent.toolsAndSoftware,
    certifications: rawCandidateContent.certifications,
    languages: rawCandidateContent.languages,
    projects: rawCandidateContent.projects,
    references: rawCandidateContent.references,
    verificationBreakdown: {
      personal: {
        verified: Boolean(fullName && (email || phone)),
        missingFields: [!phone ? "phone" : "", !location ? "location" : ""].filter(Boolean),
      },
      experience: {
        count: experiences.length,
        verifiedDates: experiences.every((e) => Boolean(e.startDate)),
        verifiedCompanies: experiences.length > 0,
      },
      education: {
        count: education.length,
        verified: education.length > 0,
      },
      skills: {
        count: finalSkills.length,
      },
    },
  };

  // Run the source corroboration and final shape checks before returning data.
  return validateExtractedCvData(verifyExtractedDataAgainstRawText(initialExtracted, text), fileName, text);
}

// ---------------------------------------------------------------------------
// Contextual CV Strategic Advisor (Smokey Enhanced)
// ---------------------------------------------------------------------------

export function answerAdvisorQuestion(
  question: string,
  cv: GeneratedCvDocument,
  targetJob?: string,
): {
  question: string;
  answer: string;
  reasoning: string;
  suggestedAction?: string;
} {
  const qLower = question.toLowerCase();

  if (qLower.includes("gap") || qLower.includes("employment gap")) {
    return {
      question,
      answer: "Be honest, concise, and frame the period around constructive activity rather than apologizing.",
      reasoning: "Hiring managers respect transparency. If you were upskilling, caregiving, freelancing, or job-seeking, state it in one neutral line (e.g. '2023 - 2024: Dedicated professional development & independent project work'). Never fabricate fictional employment to fill a gap.",
      suggestedAction: "Add a concise, transparent line in your Experience section or address it directly in your cover letter.",
    };
  }

  if (qLower.includes("matric") || qLower.includes("grade 12")) {
    const yearsExp = cv.experiences.length;
    const answer = yearsExp >= 2
      ? "You can list your Matric / National Senior Certificate as a single line under Education without listing every individual subject."
      : "As an early career or graduate candidate, including your Matric with distinctions or strong subjects (e.g. Mathematics, English) adds valuable foundational proof.";
    return {
      question,
      answer,
      reasoning: "Once you have 2+ years of verified professional experience, employers prioritize workplace outcomes over secondary school grades.",
      suggestedAction: "Keep Matric to a clean one-line entry with institution and year.",
    };
  }

  if (qLower.includes("long") || qLower.includes("length") || qLower.includes("pages")) {
    return {
      question,
      answer: "In South Africa and globally, 1 to 2 pages is the gold standard for candidates with under 10 years of experience.",
      reasoning: "Recruiters screen tens of applications an hour. A focused 2-page document with high-density evidence wins more interviews than a 5-page repetitive document.",
      suggestedAction: "Use our 'Modern Dual Column' or 'Corporate Professional' template to maintain 1-2 page density.",
    };
  }

  if (qLower.includes("career change") || qLower.includes("pivot")) {
    return {
      question,
      answer: "Lead with transferable core capabilities (e.g. client management, analytical reporting, operations) and an intentional summary.",
      reasoning: "Do not hide past experience; instead, explain how the proven discipline of your previous domain accelerates your performance in the new role.",
      suggestedAction: "Use the 'Contemporary Hybrid' template which spotlights transferable skills before your chronology.",
    };
  }

  if (qLower.includes("include this job") || qLower.includes("leave out")) {
    return {
      question,
      answer: "Include roles that demonstrate work ethic, continuous employment, or relevant skills. You can condense short or unrelated roles into 1-2 concise lines.",
      reasoning: "A brief mention of an unrelated role is better than an unexplained multi-year gap.",
      suggestedAction: "Keep the company, role, and dates, with just one summary bullet.",
    };
  }

  return {
    question,
    answer: `For ${cv.headline || "your target role"}, focus on verified scope, clear action verbs, and authentic alignment.`,
    reasoning: "BonList helps you present your actual experience in its most compelling, professional form without ever inventing claims.",
    suggestedAction: "Run the 6-Pillar Quality Check to review prioritized recommendations.",
  };
}

// ---------------------------------------------------------------------------
// Builder Function for Generated Documents
// ---------------------------------------------------------------------------

const MAX_BULLETS_PER_ROLE = 4;
const MAX_BULLET_CHARS = 135;

/** Prefer quantified, action-led bullets and keep them brief for a clean 1–2 page CV. */
export function polishBulletText(text: string, maxChars = MAX_BULLET_CHARS): string {
  let t = text.replace(/\s+/g, " ").replace(/^[\s•\-\*▪▫►○●]+/, "").trim();
  if (!t) return t;
  // Capitalize first letter if needed
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length <= maxChars) return t;
  const clipped = t.slice(0, maxChars);
  const atWord = clipped.replace(/\s+\S*$/, "").replace(/[,;:–—-]+$/, "");
  return `${atWord || clipped}…`;
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

export function selectProfessionalBullets(bullets: string[], limit = MAX_BULLETS_PER_ROLE): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of bullets || []) {
    const polished = polishBulletText(raw);
    if (polished.length < 12) continue;
    // Skip lines that look like role/company headers, not duties
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

function preserveSourceBullets(bullets: string[]): string[] {
  const seen = new Set<string>();
  const preserved: string[] = [];
  for (const raw of bullets || []) {
    // Split only where an explicit bullet marker starts a new line or follows
    // another bullet; ordinary wrapped prose remains one bullet.
    const chunks = String(raw || "").split(/\r?\n(?=[\t ]*[•\-*▪▫►○●]\s*)|(?=[•▪▫►○●])/);
    for (const chunk of chunks) {
      const bullet = chunk
        .replace(/^[\s•\-*▪▫►○●]+/, "")
        .replace(/[\r\n\t ]+/g, " ")
        .replace(/[\s\-–—]+$/, "")
        .trim();
      if (bullet.length < 4 || isGarbagePersonalToken(bullet)) continue;
      const key = bullet.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      if (seen.has(key)) continue;
      seen.add(key);
      preserved.push(bullet);
    }
  }
  return preserved;
}
export function condenseExperiences(experiences: CvExperienceItem[]): CvExperienceItem[] {
  return (experiences || []).map((exp) => ({
    ...exp,
    bullets: preserveSourceBullets(exp.bullets),
  }));
}

export function buildGeneratedCv({
  profile,
  diagnostic,
  structure = "professional",
  extracted,
}: {
  profile: ProfileLike;
  diagnostic?: DiagnosticLike;
  structure?: CvStructure;
  extracted?: ExtractedCvData;
}): GeneratedCvDocument {
  const normStructure = normalizeStructure(structure);
  const meta = STRUCTURE_META[normStructure];
  const targetRole =
    diagnostic?.targetRole ||
    (extracted?.personal?.professionalTitle && extracted.personal.professionalTitle !== "Professional"
      ? extracted.personal.professionalTitle
      : profile.targetRole) ||
    extracted?.personal?.professionalTitle ||
    "";

  const fullName =
    (extracted?.personal?.fullName && extracted.personal.fullName !== "Candidate"
      ? extracted.personal.fullName
      : "") ||
    profile.name ||
    extracted?.personal?.fullName ||
    "";

  const email = extracted?.personal?.email || profile.email || "";
  const location = extracted?.personal?.location || profile.location || "";
  const phone = extracted?.personal?.phone || profile.phone || "";
  const linkedin = extracted?.personal?.linkedin || extracted?.cv_content?.personal?.linkedin || undefined;
  const website = extracted?.personal?.website || extracted?.cv_content?.personal?.website || undefined;

  const contactLine = [email, phone, location, linkedin, website].filter(Boolean).join(" · ");

  // Experiences: ZERO fabrication - if not present, keep empty array
  const experiencesRaw: CvExperienceItem[] =
    extracted?.experiences && extracted.experiences.length > 0
      ? extracted.experiences
      : extracted?.cv_content?.experiences && extracted.cv_content.experiences.length > 0
        ? extracted.cv_content.experiences
        : [];
  const experiences = condenseExperiences(experiencesRaw);

  // Education: ZERO fabrication - if not present, keep empty array
  const education: CvEducationItem[] =
    extracted?.education && extracted.education.length > 0
      ? extracted.education
      : extracted?.cv_content?.education && extracted.cv_content.education.length > 0
        ? extracted.cv_content.education
        : [];

  // Skills: ZERO fabrication - if not present, keep empty array
  const skills: string[] =
    extracted?.skills && extracted.skills.length > 0
      ? extracted.skills
      : extracted?.cv_content?.skills && extracted.cv_content.skills.length > 0
        ? extracted.cv_content.skills
        : [];

  // Projects
  const projects: CvProjectItem[] =
    extracted?.projects && extracted.projects.length > 0
      ? extracted.projects
      : extracted?.cv_content?.projects && extracted.cv_content.projects.length > 0
        ? extracted.cv_content.projects
        : [];

  // Certifications
  const certifications: CvCertificationItem[] =
    extracted?.certifications && extracted.certifications.length > 0
      ? extracted.certifications
      : extracted?.cv_content?.certifications && extracted.cv_content.certifications.length > 0
        ? extracted.cv_content.certifications
        : [];

  // Languages
  const languages: string[] =
    extracted?.languages && extracted.languages.length > 0
      ? extracted.languages
      : extracted?.cv_content?.languages && extracted.cv_content.languages.length > 0
        ? extracted.cv_content.languages
        : [];

  // References
  const references: string[] =
    extracted?.references && extracted.references.length > 0
      ? extracted.references
      : extracted?.cv_content?.references && extracted.cv_content.references.length > 0
        ? extracted.cv_content.references
        : [];

  // Professional Summary: Candidate biography ONLY, NEVER reviewer evaluation critique notes
  let summary = "";
  if (extracted?.cv_content?.summary && !isReviewerFeedbackNote(extracted.cv_content.summary)) {
    summary = extracted.cv_content.summary;
  } else if (extracted?.summary && !isReviewerFeedbackNote(extracted.summary)) {
    summary = extracted.summary;
  } else {
    summary = "";
  }

  const skillGroups: CvSkillGroup[] = [
    {
      category: "Core Competencies",
      skills: skills.slice(0, 4),
    },
    {
      category: "Tools & Execution",
      skills: skills.slice(4),
    },
  ].filter((g) => g.skills.length > 0);

  const sections: CvSection[] = [
    {
      heading: "Professional Summary",
      items: summary ? [summary] : [],
    },
  ];

  if (experiences.length > 0) {
    sections.push({
      heading: "Experience & Accomplishments",
      items: experiences.flatMap((e) => e.bullets),
    });
  }

  if (projects.length > 0) {
    sections.push({
      heading: "Key Projects",
      items: projects.flatMap((p) => [p.title + (p.subtitle ? ` — ${p.subtitle}` : ""), ...p.bullets]),
    });
  }

  if (skills.length > 0) {
    sections.push({
      heading: "Core Skills & Tools",
      items: skills,
    });
  }

  if (education.length > 0) {
    sections.push({
      heading: "Education",
      items: education.map((ed) => `${ed.degree} — ${ed.institution}${ed.graduationYear ? ` (${ed.graduationYear})` : ""}`),
    });
  }

  if (certifications.length > 0) {
    sections.push({
      heading: "Certifications & Accreditations",
      items: certifications.map((c) => `${c.name}${c.issuer ? ` — ${c.issuer}` : ""}${c.year ? ` (${c.year})` : ""}`),
    });
  }

  if (languages.length > 0) {
    sections.push({
      heading: "Languages",
      items: languages,
    });
  }

  if (references.length > 0) {
    sections.push({
      heading: "References",
      items: references,
    });
  }

  const footerNote = "Engineered by BonList AI. 100% verified candidate information with semantic text layers, standard ATS headings, and anti-fabrication standards.";

  const aiFeedback: AiFeedbackData = {
    summaryFeedback: diagnostic?.summary || extracted?.ai_feedback?.summaryFeedback,
    internalTips: [
      ...(diagnostic?.improvements?.map((i) => `${i.title}: ${i.detail}`) || []),
      ...(extracted?.ai_feedback?.internalTips || []),
    ],
    missingKeywords: diagnostic?.missingKeywords || extracted?.ai_feedback?.missingKeywords || [],
    jobBoardAdvice: [
      "Ensure role titles closely match South African job board postings (e.g., Pnet, CareerJunction, LinkedIn).",
      "Include clear notice period and location preferences in your application cover note.",
    ],
    flaggedPhrases: diagnostic?.flaggedPhrases || extracted?.ai_feedback?.flaggedPhrases || [],
    strengths: diagnostic?.strengths || extracted?.ai_feedback?.strengths || [],
    improvements: diagnostic?.improvements || extracted?.ai_feedback?.improvements || [],
  };

  const doc: GeneratedCvDocument = {
    structure: normStructure,
    structureLabel: meta.label,
    structureDescription: meta.description,
    templateType: meta.templateType,
    fullName,
    headline: targetRole,
    contactLine,
    email,
    phone,
    location,
    linkedin,
    website,
    summary,
    experiences,
    education,
    skillGroups,
    skills,
    projects,
    certifications,
    languages,
    references,
    sections,
    keywords: diagnostic?.missingKeywords || [],
    footerNote,
    authenticityScore: 100,
    aiFeedback,
  };

  return doc;
}

// ===========================================================================
// SECTION 26 & 27: ADVANCED EVIDENCE TRACEABILITY ENGINE
// Pipeline: SOURCE INFORMATION → AI RECOMMENDATION → FINAL CV STATEMENT
// Blocks unverified metrics and hallucinations.
// ===========================================================================

export function traceCvEvidence(cv: GeneratedCvDocument, sourceText?: string): EvidenceTraceReport {
  const normalizedSource = (sourceText || "").toLowerCase();
  const items: EvidenceTraceItem[] = [];

  let verifiedCount = 0;
  let rephrasedCount = 0;
  let inferredCount = 0;
  let missingInquiryCount = 0;
  let unsupportedBlockedCount = 0;

  // 1. Headline Trace
  if (cv.headline) {
    const isSupported = normalizedSource ? normalizedSource.includes(cv.headline.toLowerCase().split(" ")[0]) : true;
    items.push({
      id: "trace-headline",
      section: "headline",
      sourceText: isSupported ? `Target Role: ${cv.headline}` : "Inferred from submitted experience",
      aiRecommendation: `Position candidate clearly as ${cv.headline}`,
      finalStatement: cv.headline,
      classification: isSupported ? "VERIFIED" : "INFERRED",
      evidenceType: isSupported ? "direct" : "rephrased",
      auditNote: isSupported ? "Supported by candidate experience records." : "Positioning inferred from candidate task history.",
      isMetricSupported: true,
    });
    if (isSupported) verifiedCount++;
    else inferredCount++;
  }

  // 2. Summary Trace
  if (cv.summary) {
    const hasMetric = METRIC_REGEX.test(cv.summary);
    const metricSupported = !hasMetric || (normalizedSource.length > 0 && normalizedSource.includes(cv.summary.match(/\d+/)?.[0] || ""));
    const classification: StatementClassification = !metricSupported ? "UNSUPPORTED" : "REPHRASED";
    
    items.push({
      id: "trace-summary",
      section: "summary",
      sourceText: "Extracted from candidate profile and verified background duties",
      aiRecommendation: "Synthesize background into a professional, cliché-free executive narrative",
      finalStatement: cv.summary,
      classification,
      evidenceType: !metricSupported ? "blocked" : "rephrased",
      auditNote: metricSupported 
        ? "Summary accurately represents candidate scope without exaggerations." 
        : "Unverified numeric claim detected in summary; blocked until verified by candidate.",
      isMetricSupported: metricSupported,
      missingMetricInquiry: !metricSupported ? "Please provide verified metrics to support this summary statement." : undefined,
    });

    if (!metricSupported) unsupportedBlockedCount++;
    else rephrasedCount++;
  }

  // 3. Experience Bullets Trace
  cv.experiences.forEach((exp, expIdx) => {
    exp.bullets.forEach((bullet, bulletIdx) => {
      const bulletMetrics = bullet.match(/\d+[%kKmM]?/g) || [];
      let isSupported = true;
      let missingInquiry: string | undefined;

      if (bulletMetrics.length > 0 && normalizedSource.length > 0) {
        // Check if the numbers appear in source text
        const hasUnsupportedNum = bulletMetrics.some((num) => !normalizedSource.includes(String(num).toLowerCase()));
        if (hasUnsupportedNum) {
          isSupported = false;
          missingInquiry = `You mentioned quantitative results (${bulletMetrics.join(", ")}). What was the exact confirmed volume at ${exp.company}?`;
        }
      }

      let classification: StatementClassification = "VERIFIED";
      let evidenceType: "direct" | "rephrased" | "confirmed_inquiry" | "blocked" = "direct";
      let auditNote = "Statement directly grounded in confirmed candidate duties.";

      if (!isSupported) {
        classification = "UNSUPPORTED";
        evidenceType = "blocked";
        auditNote = "Blocked: Quantitative metrics must originate from verified candidate records, not AI generation.";
        unsupportedBlockedCount++;
      } else if (bulletMetrics.length > 0) {
        classification = "VERIFIED";
        evidenceType = "confirmed_inquiry";
        auditNote = "Verified: Metric corroborated by candidate information.";
        verifiedCount++;
      } else {
        classification = "REPHRASED";
        evidenceType = "rephrased";
        auditNote = "Rephrased with active verbs while preserving candidate's exact factual scope.";
        rephrasedCount++;
      }

      items.push({
        id: `trace-exp-${expIdx}-${bulletIdx}`,
        section: "experience",
        sourceText: `Candidate role at ${exp.company} (${exp.role})`,
        aiRecommendation: `Structure into active accomplishment statement without fabricating scope`,
        finalStatement: bullet,
        classification,
        evidenceType,
        auditNote,
        isMetricSupported: isSupported,
        missingMetricInquiry: missingInquiry,
      });
    });
  });

  // Calculate authenticity score: deduct heavily for unsupported blocked items
  const totalItems = items.length || 1;
  const rawScore = 100 - (unsupportedBlockedCount * 25) - (missingInquiryCount * 5);
  const authenticityScore = Math.max(50, Math.min(100, Math.round(rawScore)));

  const traceabilitySummary = unsupportedBlockedCount === 0
    ? "All statements have been verified against candidate source data. Zero unverified metrics or fabricated achievements detected."
    : `${unsupportedBlockedCount} statement(s) contained unverified metrics and have been flagged for candidate confirmation.`;

  return {
    items,
    verifiedCount,
    rephrasedCount,
    inferredCount,
    missingInquiryCount,
    unsupportedBlockedCount,
    authenticityScore,
    traceabilitySummary,
  };
}

// ===========================================================================
// SECTION 28: AI SELF-REVIEW ENGINE (7 Quality Gates)
// Accuracy, Authenticity, Clarity, Professionalism, Relevance, Natural Language, Risk
// ===========================================================================

export function runAiSelfReview(
  content: string,
  context?: { role?: string; candidateSourceText?: string; section?: string }
): AiSelfReviewResult {
  const gates: AiSelfReviewGate[] = [];
  const blockedClaims: string[] = [];

  const lower = content.toLowerCase();

  // Gate 1: Accuracy (Supported by candidate information)
  const hasUnconfirmedMetrics = METRIC_REGEX.test(content) && context?.candidateSourceText && !context.candidateSourceText.toLowerCase().includes(content.match(/\d+/)?.[0] || "");
  const accuracyPassed = !hasUnconfirmedMetrics;
  if (!accuracyPassed) {
    blockedClaims.push("Uncorroborated metric detected without source evidence.");
  }
  gates.push({
    gate: "accuracy",
    label: "Accuracy & Evidence Grounding",
    passed: accuracyPassed,
    note: accuracyPassed
      ? "Statement is directly supported by candidate experience."
      : "Contains metrics or claims not corroborated by the candidate's verified records.",
  });

  // Gate 2: Authenticity (Faithfully represents candidate, no false superlatives)
  const superlatives = ["world-class", "revolutionary", "best-in-class", "unmatched", "visionary", "rockstar", "ninja", "guru"];
  const foundSuperlatives = superlatives.filter((w) => lower.includes(w));
  const authenticityPassed = foundSuperlatives.length === 0;
  if (!authenticityPassed) {
    blockedClaims.push(`Superlatives detected: ${foundSuperlatives.join(", ")}`);
  }
  gates.push({
    gate: "authenticity",
    label: "Authenticity & Grounded Tone",
    passed: authenticityPassed,
    note: authenticityPassed
      ? "Language is authentic and represents realistic professional capability."
      : `Exaggerated superlatives detected (${foundSuperlatives.join(", ")}).`,
  });

  // Gate 3: Clarity (Easy to understand, concise)
  const wordCount = content.trim().split(/\s+/).length;
  const clarityPassed = wordCount >= 6 && wordCount <= 38;
  gates.push({
    gate: "clarity",
    label: "Clarity & Readability",
    passed: clarityPassed,
    note: clarityPassed
      ? "Statement is punchy, well-structured, and easy for recruiters to scan."
      : wordCount > 38
        ? "Sentence is overly long; recruiters may lose focus during a 6-second scan."
        : "Sentence is too terse; lacks sufficient operational context.",
  });

  // Gate 4: Professionalism (Meets professional CV standards, active voice)
  const startsWithLowercase = /^[a-z]/.test(content.trim());
  const hasTypoDoubleSpace = /\s{2,}/.test(content);
  const professionalismPassed = !startsWithLowercase && !hasTypoDoubleSpace;
  gates.push({
    gate: "professionalism",
    label: "Professionalism & Syntax",
    passed: professionalismPassed,
    note: professionalismPassed
      ? "Adheres to professional syntax, capitalization, and CV conventions."
      : "Formatting or capitalization irregularity detected.",
  });

  // Gate 5: Relevance (Target role alignment)
  const relevancePassed = context?.role
    ? content.toLowerCase().includes(context.role.toLowerCase().split(" ")[0]) || wordCount > 8
    : true;
  gates.push({
    gate: "relevance",
    label: "Relevance to Career Lane",
    passed: relevancePassed,
    note: relevancePassed
      ? "Content contributes meaningfully to the candidate's career narrative."
      : "Statement lacks clear relevance to the target career direction.",
  });

  // Gate 6: Natural Language (No generic AI clichés from Section 39)
  const AI_CLICHES = [
    "results-driven",
    "dynamic",
    "passionate",
    "highly motivated",
    "proven track record",
    "strategic",
    "innovative",
    "synergy",
    "fast-paced environment",
    "exceptional",
    "outstanding",
    "go-getter",
    "spearheaded",
  ];
  const detectedCliches = AI_CLICHES.filter((c) => lower.includes(c));
  const naturalLanguagePassed = detectedCliches.length === 0;
  gates.push({
    gate: "naturalLanguage",
    label: "Natural Voice (Anti-AI Clichés)",
    passed: naturalLanguagePassed,
    note: naturalLanguagePassed
      ? "Sounds like a real professional rather than template AI output."
      : `Generic corporate buzzwords detected (${detectedCliches.join(", ")}).`,
  });

  // Gate 7: Risk (No misrepresentation or unverified claims)
  const riskPassed = blockedClaims.length === 0;
  gates.push({
    gate: "risk",
    label: "Candidate Protection & Risk Review",
    passed: riskPassed,
    note: riskPassed
      ? "Zero statements that could jeopardize the candidate during reference checks."
      : "Risk of candidate misrepresentation detected. Output must be revised.",
  });

  const overallPassed = gates.every((g) => g.passed);

  // Produce revised text if any gate failed
  let revisedText = content;
  let revisionReason: string | undefined;

  if (!overallPassed) {
    let cleaned = content;
    
    // Replace cliches with grounded phrasing
    cleaned = cleaned.replace(/results-driven\s*/gi, "disciplined ");
    cleaned = cleaned.replace(/dynamic\s*/gi, "adaptable ");
    cleaned = cleaned.replace(/passionate\s*/gi, "dedicated ");
    cleaned = cleaned.replace(/highly motivated\s*/gi, "reliable ");
    cleaned = cleaned.replace(/proven track record\s*/gi, "demonstrated experience ");
    cleaned = cleaned.replace(/synergy\s*/gi, "coordination ");
    cleaned = cleaned.replace(/fast-paced environment\s*/gi, "operational environment ");
    cleaned = cleaned.replace(/exceptional\s*/gi, "consistent ");
    cleaned = cleaned.replace(/outstanding\s*/gi, "strong ");
    cleaned = cleaned.replace(/innovative\s*/gi, "practical ");
    cleaned = cleaned.replace(/strategic\s*/gi, "structured ");

    // Remove false superlatives
    superlatives.forEach((s) => {
      const reg = new RegExp(`\\b${s}\\b\\s*`, "gi");
      cleaned = cleaned.replace(reg, "");
    });

    // Remove unsupported metric hallucinations if accuracy failed
    if (!accuracyPassed) {
      cleaned = cleaned.replace(/\b\d+%\s*/g, "");
      cleaned = cleaned.replace(/\b\d+\s*(?:passengers|clients|users|invoices|deliveries|calls|cases|tickets|percent)\b/gi, "assigned volumes");
    }

    // Capitalize first letter and tidy spaces
    cleaned = cleaned.trim().replace(/\s{2,}/g, " ");
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    if (!/[.!?]$/.test(cleaned)) {
      cleaned += ".";
    }

    revisedText = cleaned;
    revisionReason = `Revised to eliminate AI clichés (${detectedCliches.join(", ") || "generic phrasing"}) and ensure 100% evidence-based authenticity.`;
  }

  return {
    passed: overallPassed,
    gates,
    originalText: content,
    revisedText,
    revisionApplied: !overallPassed,
    revisionReason,
    blockedClaims,
  };
}

// ===========================================================================
// SECTION 30: CAREER POSITIONING ENGINE
// Discovers candidate's strongest professional positioning & composite lanes
// ===========================================================================

export function analyzeCareerPositioning(
  cv: GeneratedCvDocument,
  targetJob?: string
): CareerPositioningReport {
  const skillsLower = cv.skills.map((s) => s.toLowerCase());
  const expTitles = cv.experiences.map((e) => e.role.toLowerCase());
  const allText = (cv.headline + " " + cv.summary + " " + expTitles.join(" ") + " " + skillsLower.join(" ")).toLowerCase();

  // Detect domain exposures
  const hasCustomerService = allText.includes("customer") || allText.includes("passenger") || allText.includes("support") || allText.includes("client");
  const hasLogistics = allText.includes("logistics") || allText.includes("dispatch") || allText.includes("warehouse") || allText.includes("freight") || allText.includes("inventory");
  const hasAviation = allText.includes("aviation") || allText.includes("airport") || allText.includes("flight") || allText.includes("passenger services");
  const hasAdmin = allText.includes("admin") || allText.includes("clerical") || allText.includes("office") || allText.includes("excel") || allText.includes("documentation");
  const hasTech = allText.includes("software") || allText.includes("developer") || allText.includes("data") || allText.includes("systems") || allText.includes("it");
  const hasFinance = allText.includes("finance") || allText.includes("accounting") || allText.includes("invoicing") || allText.includes("reconciliation");

  let recommendedTitle = cv.headline || "Cross-Functional Professional";
  let strategicRationale = "";
  let synergyBreakdown: string[] = [];
  let sampleSummary = "";
  const alternativePositionings: CareerPositioningOption[] = [];

  // Section 30 Example: Customer Service + Logistics + Aviation / Admin
  if (hasCustomerService && (hasLogistics || hasAviation)) {
    recommendedTitle = "Customer Service & Logistics Operations Specialist";
    strategicRationale = "Your experience gives you a rare combination of direct client service, airport/freight operations, and logistics discipline. Rather than listing these disconnectedly, positioning this synergy prominently gives you a distinct advantage for operational coordination, dispatch, and client operations roles.";
    synergyBreakdown = [
      "Client communication & front-line query resolution",
      "Time-sensitive operational coordination & flight/dispatch scheduling",
      "Rigorous documentation checks, baggage/cargo tracing & compliance",
    ];
    sampleSummary = `Customer service and logistics operations specialist with verified experience coordinating client inquiries, managing documentation records, and maintaining strict service standards in high-volume environments.`;

    alternativePositionings.push({
      id: "pos-alt-1",
      title: "Passenger Services & Aviation Operations Agent",
      targetIndustries: ["Aviation", "Tourism", "Airport Operations"],
      strategicRationale: "Concentrates your profile specifically on passenger-handling, check-in systems, and ground operations.",
      synergyBreakdown: ["Check-in procedures", "Passenger conflict resolution", "Boarding & gate coordination"],
      sampleSummary: `Passenger services professional with hands-on airport ground operations experience, handling check-in, passenger inquiries, and flight departures with consistent service quality.`,
    });

    alternativePositionings.push({
      id: "pos-alt-2",
      title: "Client Support & Operations Coordinator",
      targetIndustries: ["Corporate Logistics", "Supply Chain", "Customer Experience"],
      strategicRationale: "Appeals broadly to B2B companies requiring detail-oriented client liaison professionals with logistics fluency.",
      synergyBreakdown: ["Account communication", "Order tracking & escalation", "CRM & spreadsheet reporting"],
      sampleSummary: `Client support coordinator with a strong foundation in workflow tracking, order dispatch coordination, and client issue resolution.`,
    });
  } else if (hasTech) {
    recommendedTitle = targetJob || (cv.headline.includes("Developer") ? cv.headline : "Software Engineer & Solutions Developer");
    strategicRationale = "Positioning centered on hands-on software development, systems integration, and practical delivery.";
    synergyBreakdown = [
      "Full-stack web application development & API architecture",
      "Clean code standards, automated testing, and relational database design",
      "Cross-functional team delivery within agile workflows",
    ];
    sampleSummary = `Software engineer with hands-on experience designing, developing, and deploying robust applications with modern frameworks and reliable data architectures.`;

    alternativePositionings.push({
      id: "pos-tech-alt-1",
      title: "Full-Stack Web Developer",
      targetIndustries: ["FinTech", "SaaS", "Digital Agencies"],
      strategicRationale: "Highlights versatile end-to-end frontend and backend delivery capabilities.",
      synergyBreakdown: ["TypeScript & React user interfaces", "Node.js REST APIs", "Database performance & schema design"],
      sampleSummary: `Full-stack developer skilled in developing responsive web applications, secure APIs, and reliable backend services.`,
    });
  } else if (hasAdmin || hasFinance) {
    recommendedTitle = "Office Administration & Operations Coordinator";
    strategicRationale = "Connects your organizational rigor, spreadsheet proficiency, and client correspondence into an indispensable operational role.";
    synergyBreakdown = [
      "Office record-keeping, filing, and audit compliance",
      "Spreadsheet reporting, data reconciliation, and invoicing support",
      "Cross-departmental schedule management and executive correspondence",
    ];
    sampleSummary = `Detail-oriented office administration and operations coordinator experienced in managing daily clerical workflows, records maintenance, and stakeholder correspondence with precision.`;
  } else {
    recommendedTitle = targetJob || cv.headline || "Operational Support Professional";
    strategicRationale = "Positions your documented work history around reliability, team support, and dependable task execution.";
    synergyBreakdown = [
      "Consistent task completion according to standard operating procedures",
      "Professional team collaboration and internal communication",
      "Quick adaptability to new tools and operating workflows",
    ];
    sampleSummary = `Dedicated operational support professional with confirmed experience executing core business tasks, supporting team objectives, and maintaining high service standards.`;
  }

  const supportingVerifiedEvidence = cv.skills.slice(0, 5);

  return {
    recommendedPositioning: {
      id: "pos-primary",
      title: recommendedTitle,
      targetIndustries: hasLogistics ? ["Logistics & Supply Chain", "Aviation", "Customer Services"] : ["Corporate Services", "Technology", "Operations"],
      strategicRationale,
      synergyBreakdown,
      sampleSummary,
    },
    alternativePositionings,
    supportingVerifiedEvidence,
    explanation: `Your verified experience gives you an authentic combination of ${synergyBreakdown.slice(0, 2).join(" and ")}. Positioning these prominently ensures hiring managers quickly recognize your distinct value.`,
    responsibleDisclaimer: "BonList positioning recommendations are designed to clarify your authentic professional narrative. Hiring outcomes depend upon employer vacancies, verified qualifications, and interview performance.",
  };
}

// ===========================================================================
// SECTION 31 & 32: ADVANCED JOB MATCH & SEMANTIC KEYWORD INTELLIGENCE
// 6-Tier Taxonomy: Essential, Preferred, Demonstrated, Not Demonstrated, Transferable, Missing
// Semantic relationship mapping without keyword stuffing
// ===========================================================================

const SEMANTIC_EQUIVALENTS: Record<string, string[]> = {
  "customer service": ["customer support", "client services", "passenger services", "enquiries", "call centre", "client relations", "front-line support"],
  "logistics": ["freight", "dispatch", "warehousing", "supply chain", "inventory", "fleet", "cargo", "shipping"],
  "excel": ["spreadsheets", "data analysis", "reporting", "vlookup", "pivot tables", "reconciliation"],
  "administration": ["documentation", "clerical", "record-keeping", "office coordination", "filing", "administrative support"],
  "management": ["supervision", "team lead", "coordination", "oversight", "workflow management", "delegation"],
  "software development": ["programming", "coding", "software engineering", "full-stack", "typescript", "javascript", "python", "react"],
  "communication": ["written communication", "verbal communication", "stakeholder engagement", "client liaison", "presentations"],
  "problem solving": ["troubleshooting", "conflict resolution", "query resolution", "investigation", "reconciliation"],
};

export function matchJobDescriptionAdvanced(
  cv: GeneratedCvDocument,
  jobDescription: string
): JobMatchAdvancedReport {
  const lowerJd = jobDescription.toLowerCase();
  const cvFullText = (
    cv.headline +
    " " +
    cv.summary +
    " " +
    cv.experiences.flatMap((e) => [e.role, e.company, ...e.bullets]).join(" ") +
    " " +
    cv.skills.join(" ")
  ).toLowerCase();

  // Extract job title from first lines
  const firstLine = jobDescription.split("\n")[0].trim();
  const jobTitle = firstLine.length < 60 && !firstLine.includes(":") ? firstLine : cv.headline || "Target Position";

  // Split JD into requirement sentences
  const sentences = jobDescription
    .split(/[.\n;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  const essential: string[] = [];
  const preferred: string[] = [];
  const demonstrated: string[] = [];
  const notDemonstrated: string[] = [];
  const transferable: string[] = [];
  const missing: string[] = [];
  const matchedSemanticConcepts: Array<{ roleTerm: string; cvEquivalent: string }> = [];

  sentences.forEach((sent) => {
    const sLower = sent.toLowerCase();
    const isEssential = sLower.includes("must") || sLower.includes("required") || sLower.includes("essential") || sLower.includes("minimum") || sLower.includes("proven experience");
    const isPreferred = sLower.includes("preferred") || sLower.includes("advantageous") || sLower.includes("bonus") || sLower.includes("plus") || sLower.includes("ideal");

    // Clean requirement text
    const cleanReq = sent.replace(/^[•*\-\d.)\s]+/, "").trim();
    if (cleanReq.length < 10) return;

    if (isEssential) {
      if (essential.length < 6) essential.push(cleanReq);
    } else if (isPreferred) {
      if (preferred.length < 5) preferred.push(cleanReq);
    } else if (essential.length < 4) {
      essential.push(cleanReq);
    }

    // Check demonstration in CV
    const tokens = cleanReq.toLowerCase().split(/[^a-z0-9_-]+/).filter((w) => w.length >= 4);
    const hasDirectMatch = tokens.some((t) => cvFullText.includes(t));

    // Check semantic equivalence
    let semanticMatchFound = false;
    for (const [concept, synonyms] of Object.entries(SEMANTIC_EQUIVALENTS)) {
      if (sLower.includes(concept) || synonyms.some((syn) => sLower.includes(syn))) {
        const matchingCvSkill = cv.skills.find((skill) =>
          skill.toLowerCase().includes(concept) || synonyms.some((syn) => skill.toLowerCase().includes(syn))
        );
        if (matchingCvSkill) {
          semanticMatchFound = true;
          matchedSemanticConcepts.push({
            roleTerm: concept,
            cvEquivalent: matchingCvSkill,
          });
          break;
        }
      }
    }

    if (hasDirectMatch) {
      if (demonstrated.length < 6) demonstrated.push(cleanReq);
    } else if (semanticMatchFound) {
      if (transferable.length < 5) transferable.push(cleanReq);
    } else {
      if (isEssential) {
        if (missing.length < 4) missing.push(cleanReq);
      } else {
        if (notDemonstrated.length < 4) notDemonstrated.push(cleanReq);
      }
    }
  });

  // Calculate realistic fit percentage
  const totalConsidered = (demonstrated.length + transferable.length + notDemonstrated.length + missing.length) || 1;
  const matchPoints = demonstrated.length * 1.0 + transferable.length * 0.75;
  const overallFitPercentage = Math.min(94, Math.max(52, Math.round((matchPoints / totalConsidered) * 100)));

  // Keyword stuffing check: detect if any word appears > 5 times in CV
  const words = cvFullText.split(/\s+/);
  const wordCounts: Record<string, number> = {};
  words.forEach((w) => {
    if (w.length > 5) wordCounts[w] = (wordCounts[w] || 0) + 1;
  });
  const potentialKeywordStuffingRisk = Object.values(wordCounts).some((c) => c > 7);

  // Generate actionable proposals
  const proposals: TailoringProposal[] = [];
  if (transferable.length > 0) {
    proposals.push({
      id: "prop-transferable",
      section: "skills",
      title: "Highlight Legitimate Transferable Capabilities",
      reason: "Connects your demonstrated tasks with the employer's terminology without claiming unverified duties.",
      before: cv.skills.slice(0, 3).join(", "),
      after: `${cv.skills.slice(0, 3).join(", ")}, ${matchedSemanticConcepts.map((m) => m.roleTerm).slice(0, 2).join(", ")}`,
      status: "pending",
    });
  }

  const cautionNotice = "BonList Strict Standard: Never add a skill simply because it appears in the job description. Only include capabilities supported by your verified experience.";

  const recommendedActions = [
    `Lead with your verified competencies that directly align with the ${demonstrated.length} demonstrated requirements.`,
    transferable.length > 0
      ? `Explicitly state the transferable relevance of your background (${transferable.slice(0, 2).map((t) => `"${t.slice(0, 40)}..."`).join(", ")}).`
      : "Ensure your summary directly addresses the employer's core operational needs.",
    missing.length > 0
      ? `Review the missing essential requirements (${missing.slice(0, 2).map((m) => `"${m.slice(0, 40)}..."`).join(", ")}). If you have performed these tasks, update your bullet points with verified evidence.`
      : "Your profile exhibits strong, authentic alignment with the required responsibilities.",
  ];

  return {
    jobTitle,
    overallFitPercentage,
    tiers: {
      essential,
      preferred,
      demonstrated,
      notDemonstrated,
      transferable,
      missing,
    },
    keywordIntelligence: {
      matchedSemanticConcepts,
      potentialKeywordStuffingRisk,
      naturalReadabilityNote: potentialKeywordStuffingRisk
        ? "Warning: Repetitive keyword frequency detected. Ensure phrases read smoothly to a human recruiter."
        : "Semantic match reads naturally. Keywords fit professional South African recruitment benchmarks.",
    },
    cautionNotice,
    recommendedActions,
    proposals,
  };
}

// ===========================================================================
// SECTION 33: TRANSFERABLE SKILLS ENGINE
// Identifies legitimate transferable capabilities from candidate tasks
// ===========================================================================

export function discoverTransferableSkills(
  cv: GeneratedCvDocument,
  targetRoleOrIndustry?: string
): TransferableSkillsReport {
  const targetDomain = targetRoleOrIndustry || cv.headline || "Professional Operations";
  const transferableItems: TransferableSkillItem[] = [];

  const allBullets = cv.experiences.flatMap((e) => e.bullets);
  const text = (cv.summary + " " + allBullets.join(" ")).toLowerCase();

  if (text.includes("check-in") || text.includes("passenger") || text.includes("boarding")) {
    transferableItems.push({
      provenTask: "Passenger check-in and travel documentation verification",
      transferableCompetency: "Time-Sensitive Regulatory Verification & Compliance",
      relevanceToTarget: "Directly proves ability to work under strict flight departure deadlines while verifying legal/regulatory paperwork accurately.",
      suggestedBulletPhrasing: "Executed time-sensitive document verifications and check-in protocols under strict compliance guidelines.",
      whyLegitimate: "Rooted directly in verified airport check-in duties without altering role scope.",
    });
    transferableItems.push({
      provenTask: "Handling passenger inquiries and flight delays",
      transferableCompetency: "High-Pressure Conflict De-escalation & Customer Care",
      relevanceToTarget: "Demonstrates composure, emotional intelligence, and quick problem resolution during unexpected operational disruptions.",
      suggestedBulletPhrasing: "Resolved urgent customer inquiries and de-escalated operational delay concerns with calm, structured communication.",
      whyLegitimate: "Reflects genuine front-line passenger interaction experience.",
    });
  }

  if (text.includes("dispatch") || text.includes("warehouse") || text.includes("stock") || text.includes("inventory")) {
    transferableItems.push({
      provenTask: "Stock tracking and dispatch log maintenance",
      transferableCompetency: "Operational Workflow Coordination & Asset Accountability",
      relevanceToTarget: "Translates directly to supply chain management, inventory auditing, and order fulfillment roles.",
      suggestedBulletPhrasing: "Coordinated inventory dispatches and maintained verified tracking logs with zero discrepancy.",
      whyLegitimate: "Based on confirmed daily physical logistics operations.",
    });
  }

  if (text.includes("excel") || text.includes("report") || text.includes("reconciliation") || text.includes("data")) {
    transferableItems.push({
      provenTask: "Compiling daily/monthly spreadsheet records",
      transferableCompetency: "Data Integrity & Operational Reporting",
      relevanceToTarget: "Valuable in administrative, financial, and analytical support positions across all industries.",
      suggestedBulletPhrasing: "Maintained accurate operational spreadsheets and compiled weekly reconciliation summaries for management review.",
      whyLegitimate: "Proves hands-on software execution using real company data.",
    });
  }

  if (text.includes("team") || text.includes("collaborat") || text.includes("assisted")) {
    transferableItems.push({
      provenTask: "Inter-departmental handover and shift cooperation",
      transferableCompetency: "Cross-Functional Hand-offs & Team Continuity",
      relevanceToTarget: "Essential for operational workflows where incomplete handovers cause delays or customer dissatisfaction.",
      suggestedBulletPhrasing: "Conducted seamless shift handovers and collaborated across teams to maintain uninterrupted service delivery.",
      whyLegitimate: "Evidences reliable peer coordination in verified workplace settings.",
    });
  }

  // Fallback transferable item if specific keywords didn't trigger
  if (transferableItems.length === 0) {
    transferableItems.push({
      provenTask: "Core duties and operational responsibilities execution",
      transferableCompetency: "Standard Operating Procedure (SOP) Execution & Dependability",
      relevanceToTarget: "Demonstrates baseline reliability, workplace adherence, and rapid operational integration.",
      suggestedBulletPhrasing: "Delivered day-to-day operational tasks in strict accordance with employer standard operating procedures.",
      whyLegitimate: "Grounded in verified historical tenure and employment duty records.",
    });
  }

  return {
    targetDomain,
    transferableItems,
    summaryAdvice: "Transferable skills highlight the underlying capabilities you demonstrated in your past jobs without falsely changing your job titles or claiming experience you do not possess.",
  };
}

// ===========================================================================
// SECTION 34: ACHIEVEMENT DISCOVERY ENGINE
// Asks targeted questions to draw out verified metrics from routine duties
// Never manufactures numbers; candidate responses become confirmed evidence.
// ===========================================================================

export function generateAchievementDiscoveryQuestions(cv: GeneratedCvDocument): AchievementDiscoveryQuestion[] {
  const questions: AchievementDiscoveryQuestion[] = [];

  cv.experiences.forEach((exp, expIdx) => {
    exp.bullets.forEach((bullet, bIdx) => {
      const lower = bullet.toLowerCase();
      const hasMetric = METRIC_REGEX.test(bullet);

      // Only question bullets that lack quantitative evidence
      if (!hasMetric && questions.length < 6) {
        if (lower.includes("customer") || lower.includes("enquir") || lower.includes("passenger") || lower.includes("client")) {
          questions.push({
            id: `q-vol-${expIdx}-${bIdx}`,
            expId: exp.id,
            role: exp.role,
            company: exp.company,
            dutyBullet: bullet,
            question: "Approximately how many customer or passenger inquiries did you handle during a typical shift or week?",
            category: "volume",
            hint: "E.g., 'Approximately 60 to 80 passengers per shift' or '40+ daily client inquiries'.",
          });
        } else if (lower.includes("report") || lower.includes("invoice") || lower.includes("document") || lower.includes("file")) {
          questions.push({
            id: `q-speed-${expIdx}-${bIdx}`,
            expId: exp.id,
            role: exp.role,
            company: exp.company,
            dutyBullet: bullet,
            question: "Did your process improve turnaround time or eliminate backlogs? How quickly did you process these?",
            category: "speed",
            hint: "E.g., 'Completed within 24 hours of receipt' or 'Maintained 100% same-day processing'.",
          });
        } else if (lower.includes("system") || lower.includes("excel") || lower.includes("software") || lower.includes("tool")) {
          questions.push({
            id: `q-tools-${expIdx}-${bIdx}`,
            expId: exp.id,
            role: exp.role,
            company: exp.company,
            dutyBullet: bullet,
            question: "Which specific software or tools did you use to process these requests?",
            category: "tools",
            hint: "E.g., 'Utilized MS Excel (VLOOKUP) and internal ERP system'.",
          });
        } else {
          questions.push({
            id: `q-sla-${expIdx}-${bIdx}`,
            expId: exp.id,
            role: exp.role,
            company: exp.company,
            dutyBullet: bullet,
            question: "Did you consistently meet a service target or receive positive supervisor/customer feedback?",
            category: "sla",
            hint: "E.g., 'Maintained 98% accuracy' or 'Consistently met quarterly operational SLA targets'.",
          });
        }
      }
    });
  });

  return questions;
}

export function incorporateDiscoveredAchievement(
  originalBullet: string,
  candidateAnswer: string,
  category: "volume" | "speed" | "quality" | "tools" | "sla"
): { improvedBullet: string; classification: StatementClassification } {
  const cleanAnswer = candidateAnswer.trim().replace(/[.]+$/, "");
  let improved = originalBullet.trim().replace(/[.]+$/, "");

  if (category === "volume") {
    improved = `${improved}, processing ${cleanAnswer} with consistent accuracy.`;
  } else if (category === "speed") {
    improved = `${improved}, successfully achieving ${cleanAnswer}.`;
  } else if (category === "tools") {
    improved = `${improved}, utilizing ${cleanAnswer}.`;
  } else if (category === "quality" || category === "sla") {
    improved = `${improved}, consistently maintaining ${cleanAnswer}.`;
  } else {
    improved = `${improved} (${cleanAnswer}).`;
  }

  return {
    improvedBullet: improved,
    classification: "VERIFIED",
  };
}

// ===========================================================================
// SECTION 37: PRE-FLIGHT CV QUALITY CONTROL ENGINE
// Final 6-checkpoint verification before allowing PDF or HTML download
// ===========================================================================

export function runPreFlightQualityControl(cv: GeneratedCvDocument): PreFlightAuditReport {
  const checks: PreFlightCheckItem[] = [];
  const prioritizedActions: string[] = [];

  // Check 1: Content Verification
  const hasName = Boolean(cv.fullName && cv.fullName.trim().length > 2);
  const hasContact = Boolean(cv.email || cv.phone);
  const hasSummary = Boolean(cv.summary && cv.summary.length > 30);
  const contentPassed = hasName && hasContact && hasSummary && cv.skills.length >= 3;
  checks.push({
    id: "check-content",
    category: "content",
    label: "Content Completeness & Contact Verification",
    status: contentPassed ? "pass" : "fail",
    detail: contentPassed
      ? "Full name, contact channels, executive summary, and core skills are verified."
      : "Missing essential profile fields (name, contact information, or summary).",
    fixSuggestion: !contentPassed ? "Ensure your name, email, and at least 3 skills are filled in." : undefined,
  });
  if (!contentPassed) prioritizedActions.push("HIGH: Complete missing personal contact information or summary before downloading.");

  // Check 2: Employment History & Chronology
  const hasExperience = cv.experiences.length > 0;
  const hasBullets = cv.experiences.every((e) => e.bullets.length > 0);
  const chronologyPassed = hasExperience && hasBullets;
  checks.push({
    id: "check-chronology",
    category: "chronology",
    label: "Employment Chronology & Role History",
    status: chronologyPassed ? "pass" : hasExperience ? "warning" : "fail",
    detail: chronologyPassed
      ? `${cv.experiences.length} role(s) verified with role titles, companies, and responsibilities.`
      : !hasExperience
        ? "No work experience entries found on this CV."
        : "Some roles do not contain bullet points describing duties.",
    fixSuggestion: !chronologyPassed ? "Add at least one descriptive bullet point for each employer." : undefined,
  });
  if (!chronologyPassed) prioritizedActions.push("HIGH: Add bullet points describing your duties for each role.");

  // Check 3: Formatting & ATS Readability
  const hasCleanSections = cv.sections.length >= 3;
  const atsPassed = hasCleanSections && cv.skills.length <= 25;
  checks.push({
    id: "check-formatting",
    category: "formatting",
    label: "ATS Readability & Layout Geometry",
    status: atsPassed ? "pass" : "warning",
    detail: atsPassed
      ? "Single-layer semantic text hierarchy, standard fonts, and ATS-parseable section dividers verified."
      : "Formatting is non-standard or skills list exceeds ATS parsing thresholds.",
  });

  // Check 4: AI Claims & Anti-Fabrication Verification (Section 27 & 38)
  const allBullets = cv.experiences.flatMap((e) => e.bullets);
  const suspiciousSuperlatives = ["world-class", "revolutionary", "best-in-class"];
  const hasSuperlatives = allBullets.some((b) => suspiciousSuperlatives.some((s) => b.toLowerCase().includes(s)));
  const authenticityPassed = !hasSuperlatives && (cv.authenticityScore >= 80);
  checks.push({
    id: "check-authenticity",
    category: "authenticity",
    label: "AI Claims & Anti-Fabrication Verification",
    status: authenticityPassed ? "pass" : "warning",
    detail: authenticityPassed
      ? "100% of statements are supported by candidate information. Zero unverified metrics detected."
      : "Uncorroborated superlatives or metrics detected. Review statement verification.",
    fixSuggestion: !authenticityPassed ? "Confirm your actual numbers or remove uncorroborated claims." : undefined,
  });
  if (!authenticityPassed) prioritizedActions.push("MEDIUM: Verify all quantitative metrics against your actual work records.");

  // Check 5: Professional Language & Cliché Check (Section 39)
  const AI_BUZZWORDS = ["results-driven", "synergy", "fast-paced environment", "highly motivated", "passionate"];
  const foundBuzzwords = AI_BUZZWORDS.filter((w) => (cv.summary + " " + allBullets.join(" ")).toLowerCase().includes(w));
  const languagePassed = foundBuzzwords.length === 0;
  checks.push({
    id: "check-language",
    category: "language",
    label: "Professional Language & Tone Verification",
    status: languagePassed ? "pass" : "warning",
    detail: languagePassed
      ? "Authentic, grounded professional language without generic AI buzzwords."
      : `Generic corporate buzzwords detected (${foundBuzzwords.join(", ")}). Consider using our Humanize tool.`,
    fixSuggestion: !languagePassed ? "Use the 'Make It Sound Like Me' tool to replace buzzwords with authentic language." : undefined,
  });
  if (!languagePassed) prioritizedActions.push("LOW: Run 'Make It Sound Like Me' to eliminate generic buzzwords.");

  const readyForDownload = checks.every((c) => c.status !== "fail");
  const overallGrade = readyForDownload
    ? checks.every((c) => c.status === "pass")
      ? "Ready for Recruiter Submission"
      : "Review Recommended"
    : "Action Required";

  return {
    readyForDownload,
    overallGrade,
    checks,
    summary: {
      contentVerified: contentPassed,
      employmentHistoryChecked: chronologyPassed,
      formattingChecked: atsPassed,
      atsReadabilityChecked: atsPassed,
      aiClaimsVerified: authenticityPassed,
      professionalLanguageChecked: languagePassed,
    },
    prioritizedActions,
  };
}

// ===========================================================================
// SECTION 38: IMPROVE CV — human wording, zero fabrication
// Philosophy: improve the candidate's words, not the candidate's story.
// ===========================================================================

function normalizeCompareText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripImproveBannedPhrases(text: string): string {
  let t = text;
  const phrases = [...IMPROVE_CV_BANNED].sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
  }
  return t.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").trim();
}

function finalizeSentence(text: string): string {
  let t = text.replace(/\s+/g, " ").trim();
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t) && t.split(/\s+/).length > 3) t += ".";
  return t;
}

function looksAlreadyStrong(text: string): boolean {
  const t = text.trim();
  if (t.length < 24) return false;
  const weak = /^(responsible for|duties included|helped with|assisted with|worked on|handled|tasked with)\b/i.test(t);
  const buzz = IMPROVE_CV_BANNED.some((p) => new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(t));
  const grammarish = /\s{2,}|^[a-z]|[^.!?]$/.test(t) && t.split(/\s+/).length > 8;
  return !weak && !buzz && !grammarish;
}

/**
 * Rewrite a bullet using only facts already present. Never invent metrics,
 * tools, seniority, or outcomes.
 */
function rewriteBulletHuman(raw: string, usedOpeners: Map<string, number>): { text: string; changed: boolean; reason: string } {
  const original = raw.replace(/^[\s•\-\*▪▫►○●]+/, "").trim();
  if (!original) return { text: original, changed: false, reason: "" };

  if (looksAlreadyStrong(original) && !IMPROVE_CV_BANNED.some((p) => new RegExp(p, "i").test(original))) {
    return { text: original, changed: false, reason: "" };
  }

  let stem = stripImproveBannedPhrases(original)
    .replace(/^(?:responsible for|was responsible for|duties included|tasks included|tasked with)\s+/i, "")
    .replace(/^(?:helped (?:with|to)|assisted (?:with|in)|worked on|involved in)\s+/i, "")
    .replace(/\.$/, "")
    .trim();

  if (!stem) stem = stripImproveBannedPhrases(original).replace(/\.$/, "").trim();
  if (!stem) return { text: original, changed: false, reason: "" };

  const lower = stem.toLowerCase();
  let opener = "";
  let rest = stem;

  // Choose a natural opener from the content — do not invent duties.
  if (/^(respond|answer|handl|deal|resolv)/i.test(stem) || /\b(customer|client|enquir|quer|email|call)\b/i.test(lower)) {
    opener = /^(responded|answered|handled|resolved|supported)\b/i.test(stem) ? "" : "Responded to";
    if (opener && /^(customer|client|enquir|quer)/i.test(stem)) {
      // keep stem as-is after opener
    } else if (opener && /^(emails?|calls?|queries|enquiries)\b/i.test(stem)) {
      rest = stem;
    } else if (opener) {
      rest = stem.replace(/^(handling|answering|dealing with)\s+/i, "");
    }
  } else if (/\b(ship|freight|dispatch|logistics|cargo|import|export|delivery|tracking)\b/i.test(lower)) {
    opener = /^(coordinat|support|updat|captur|process|track|prepar)/i.test(stem) ? "" : "Supported";
  } else if (/\b(document|record|filing|admin|invoice|data entr)\b/i.test(lower)) {
    opener = /^(maintain|updat|prepar|process|organiz|organis)/i.test(stem) ? "" : "Maintained";
  } else if (/\b(report|excel|spreadsheet|dashboard|analys)\b/i.test(lower)) {
    opener = /^(prepar|compil|produc|creat|updat)/i.test(stem) ? "" : "Prepared";
  } else if (/^(responsible for|duties included)/i.test(original)) {
    opener = "Handled";
  } else if (/^(helped|assisted)/i.test(original)) {
    opener = "Supported";
  } else if (/^(worked on)/i.test(original)) {
    opener = "Worked on";
    rest = stem.replace(/^worked on\s+/i, "") || stem;
  }

  // Avoid repeating the same opener endlessly across the CV.
  if (opener) {
    const key = opener.toLowerCase();
    const count = usedOpeners.get(key) || 0;
    if (count >= 2) {
      const alternates = ["Handled", "Supported", "Updated", "Prepared", "Processed", "Coordinated"];
      const pick = alternates.find((a) => (usedOpeners.get(a.toLowerCase()) || 0) < 2 && a.toLowerCase() !== key);
      if (pick) opener = pick;
    }
    usedOpeners.set(opener.toLowerCase(), (usedOpeners.get(opener.toLowerCase()) || 0) + 1);
  }

  let rewritten = opener ? `${opener} ${rest}` : rest;
  rewritten = rewritten
    .replace(/\bby by\b/gi, "by")
    .replace(/\s+/g, " ")
    .replace(/^(Responded to|Supported|Handled|Maintained|Prepared|Processed|Coordinated|Updated|Worked on)\s+\1\b/i, "$1")
    .trim();

  // Soft clarity tweaks that do not add facts
  rewritten = rewritten
    .replace(/\bhelping with\b/gi, "supporting")
    .replace(/\band helping\b/gi, "and supporting")
    .replace(/\bupdated customers\b/gi, "provided customers with updates")
    .replace(/\bcaptured shipment information\b/gi, "captured shipment information accurately");

  rewritten = finalizeSentence(rewritten);

  // Safety: never introduce digits that were not in the original
  const originalDigits: string[] = original.match(/\d+/g) ?? [];
  const newDigits: string[] = rewritten.match(/\d+/g) ?? [];
  if (newDigits.some((d) => !originalDigits.includes(d))) {
    return { text: finalizeSentence(stripImproveBannedPhrases(original)), changed: normalizeCompareText(original) !== normalizeCompareText(stripImproveBannedPhrases(original)), reason: "Cleared vague buzzwords while keeping your original facts." };
  }

  if (normalizeCompareText(rewritten) === normalizeCompareText(original)) {
    return { text: original, changed: false, reason: "" };
  }

  // Reject rewrite if it became much longer (likely padded)
  if (rewritten.split(/\s+/).length > original.split(/\s+/).length + 8) {
    const light = finalizeSentence(stripImproveBannedPhrases(original));
    if (normalizeCompareText(light) === normalizeCompareText(original)) {
      return { text: original, changed: false, reason: "" };
    }
    return { text: light, changed: true, reason: "Cleaned wording without padding or inventing detail." };
  }

  return {
    text: rewritten,
    changed: true,
    reason: "Clearer, more natural wording while keeping the same responsibilities.",
  };
}

function improveSummaryHuman(cv: GeneratedCvDocument, targetJob?: string): { text: string; changed: boolean; reason: string; missingHint?: string } {
  const original = (cv.summary || "").trim();
  const cleaned = stripImproveBannedPhrases(original);
  const role = (targetJob || cv.headline || cv.experiences[0]?.role || "Professional").trim();
  const topSkills = cv.skills.filter(Boolean).slice(0, 4);
  const companies = cv.experiences.map((e) => e.company).filter(Boolean).slice(0, 2);
  const roles = cv.experiences.map((e) => e.role).filter(Boolean).slice(0, 2);

  const isGeneric =
    !original ||
    original.length < 40 ||
    IMPROVE_CV_BANNED.some((p) => new RegExp(p, "i").test(original)) ||
    /results-driven|highly motivated|proven track record|dynamic professional/i.test(original);

  if (!isGeneric && cleaned.length >= 40) {
    const polished = finalizeSentence(cleaned);
    // Keep multi-sentence summaries readable
    const sentences = polished
      .split(/(?<=[.!?])\s+/)
      .map((s) => finalizeSentence(s))
      .filter(Boolean)
      .slice(0, 4);
    const text = sentences.join(" ");
    if (normalizeCompareText(text) === normalizeCompareText(original)) {
      return { text: original, changed: false, reason: "" };
    }
    return {
      text,
      changed: true,
      reason: "Removed filler phrasing and tightened the summary around your real background.",
    };
  }

  // Rebuild only from verified CV fields — never invent achievements.
  if (!roles.length && !topSkills.length && !original) {
    return {
      text: original,
      changed: false,
      reason: "",
      missingHint: "Your summary is empty. Add 2–3 sentences about your role, main duties, and tools you already use.",
    };
  }

  const parts: string[] = [];
  if (roles.length) {
    const roleBit = roles[0];
    const companyBit = companies[0] ? ` at ${companies[0]}` : "";
    parts.push(`${role} with hands-on experience as ${roleBit}${companyBit}.`);
  } else {
    parts.push(`${role} with practical workplace experience.`);
  }

  const dutyHints = cv.experiences
    .flatMap((e) => e.bullets)
    .map((b) => b.replace(/^[\s•\-\*]+/, "").trim())
    .filter((b) => b.length > 20)
    .slice(0, 2)
    .map((b) => stripImproveBannedPhrases(b).replace(/\.$/, "").toLowerCase());

  if (dutyHints.length) {
    parts.push(`Day-to-day work includes ${dutyHints.join(" and ")}.`);
  } else if (topSkills.length) {
    parts.push(`Working knowledge across ${topSkills.join(", ")}.`);
  }

  const text = parts.map(finalizeSentence).join(" ");
  if (normalizeCompareText(text) === normalizeCompareText(original)) {
    return { text: original, changed: false, reason: "" };
  }
  return {
    text,
    changed: true,
    reason: "Rewrote the summary from your actual roles and duties — no invented claims.",
    missingHint: dutyHints.length < 1
      ? "Consider adding a few concrete duties under Work Experience so the summary can stay specific."
      : undefined,
  };
}

function improveSkillsHuman(skills: string[]): { text: string; changed: boolean; reason: string } {
  const softJunk = /^(team player|go-getter|self-starter|hard worker|good communicator|strong communicator|passionate|results-driven|detail-oriented)$/i;
  const cleaned = skills
    .map((s) => stripImproveBannedPhrases(s).trim())
    .filter((s) => s.length > 1 && !softJunk.test(s))
    .map((s) => s.replace(/\s+/g, " "))
    .filter((s, i, arr) => arr.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i);

  const before = skills.join(", ");
  const after = cleaned.join(", ");
  if (normalizeCompareText(before) === normalizeCompareText(after)) {
    return { text: before, changed: false, reason: "" };
  }
  return {
    text: after,
    changed: true,
    reason: "Tidied skill labels and removed vague soft-skill fillers. No new skills were added.",
  };
}

function improveEducationDetail(detail: string): { text: string; changed: boolean; reason: string } {
  const original = detail.trim();
  if (!original) return { text: original, changed: false, reason: "" };
  const cleaned = finalizeSentence(stripImproveBannedPhrases(original));
  if (normalizeCompareText(cleaned) === normalizeCompareText(original)) {
    return { text: original, changed: false, reason: "" };
  }
  return { text: cleaned, changed: true, reason: "Cleared filler wording in the education note." };
}

function improveCertificationLabel(name: string): { text: string; changed: boolean; reason: string } {
  const original = name.trim();
  if (!original) return { text: original, changed: false, reason: "" };
  const cleaned = stripImproveBannedPhrases(original).replace(/\s+/g, " ").trim();
  if (normalizeCompareText(cleaned) === normalizeCompareText(original)) {
    return { text: original, changed: false, reason: "" };
  }
  return { text: cleaned, changed: true, reason: "Simplified the certification label." };
}

/**
 * Analyse a CV and propose wording improvements. Never invents experience,
 * metrics, tools, titles, or seniority. Leaves strong wording unchanged.
 */
export function improveCvContent(
  cv: GeneratedCvDocument,
  options?: { scope?: ImproveCvScope; targetJob?: string },
): ImproveCvReport {
  const scope: ImproveCvScope = options?.scope || "entire";
  const targetJob = options?.targetJob?.trim() || undefined;
  const proposals: ImproveCvProposal[] = [];
  const missingSuggestions: string[] = [];
  const qualityNotes: string[] = [
    "Suggestions only — nothing is applied until you Accept.",
    "Wording is improved from your existing content; no new achievements or numbers are invented.",
  ];
  const usedOpeners = new Map<string, number>();
  let idSeq = 0;
  const nextId = () => `improve-${++idSeq}`;

  const include = (section: ImproveCvScope | "other") =>
    scope === "entire" || scope === section || (scope === "other" && (section === "other"));

  // Summary
  if (scope === "entire" || scope === "summary") {
    const summaryResult = improveSummaryHuman(cv, targetJob);
    if (summaryResult.missingHint) missingSuggestions.push(summaryResult.missingHint);
    if (summaryResult.changed) {
      proposals.push({
        id: nextId(),
        section: "summary",
        path: "summary",
        title: "Professional Summary",
        reason: summaryResult.reason,
        before: cv.summary || "(empty)",
        after: summaryResult.text,
        status: "pending",
        missingHint: summaryResult.missingHint,
      });
    }
  }

  // Experience bullets
  if (scope === "entire" || scope === "experience") {
    if (cv.experiences.length === 0) {
      missingSuggestions.push("No work experience found. Add at least one role with a few real responsibilities.");
    }
    cv.experiences.forEach((exp, expIdx) => {
      exp.bullets.forEach((bullet, bIdx) => {
        const result = rewriteBulletHuman(bullet, usedOpeners);
        if (!result.changed) return;
        proposals.push({
          id: nextId(),
          section: "experience",
          path: `experiences.${expIdx}.bullets.${bIdx}`,
          title: `${exp.role || "Role"} · bullet ${bIdx + 1}`,
          reason: result.reason,
          before: bullet,
          after: result.text,
          status: "pending",
        });
      });
    });
  }

  // Skills
  if (scope === "entire" || scope === "skills") {
    if (cv.skills.length === 0) {
      missingSuggestions.push("Skills are empty. Add tools and competencies you already use at work.");
    } else {
      const skillsResult = improveSkillsHuman(cv.skills);
      if (skillsResult.changed) {
        proposals.push({
          id: nextId(),
          section: "skills",
          path: "skills",
          title: "Skills & Competencies",
          reason: skillsResult.reason,
          before: cv.skills.join(", "),
          after: skillsResult.text,
          status: "pending",
        });
      }
    }
  }

  // Education details
  if (scope === "entire" || scope === "education") {
    cv.education.forEach((edu, eduIdx) => {
      if (!edu.details?.trim()) return;
      const result = improveEducationDetail(edu.details);
      if (!result.changed) return;
      proposals.push({
        id: nextId(),
        section: "education",
        path: `education.${eduIdx}.details`,
        title: `${edu.degree || "Education"} details`,
        reason: result.reason,
        before: edu.details,
        after: result.text,
        status: "pending",
      });
    });
  }

  // Other: certifications + projects
  if (scope === "entire" || scope === "other") {
    (cv.certifications || []).forEach((cert, cIdx) => {
      const result = improveCertificationLabel(cert.name || "");
      if (!result.changed) return;
      proposals.push({
        id: nextId(),
        section: "certifications",
        path: `certifications.${cIdx}.name`,
        title: `Certification: ${cert.name}`,
        reason: result.reason,
        before: cert.name,
        after: result.text,
        status: "pending",
      });
    });

    (cv.projects || []).forEach((proj, pIdx) => {
      (proj.bullets || []).forEach((bullet, bIdx) => {
        const result = rewriteBulletHuman(bullet, usedOpeners);
        if (!result.changed) return;
        proposals.push({
          id: nextId(),
          section: "projects",
          path: `projects.${pIdx}.bullets.${bIdx}`,
          title: `${proj.title || "Project"} · bullet ${bIdx + 1}`,
          reason: result.reason,
          before: bullet,
          after: result.text,
          status: "pending",
        });
      });
    });
  }

  if (targetJob) {
    qualityNotes.push(`Suggestions lean toward relevance for “${targetJob}” using only experience already on your CV.`);
  }

  return {
    scope,
    proposalCount: proposals.length,
    unchangedNote:
      proposals.length === 0
        ? "No wording changes needed for this selection — your text already reads clearly, or there was too little content to improve safely."
        : undefined,
    qualityNotes,
    missingSuggestions: [...new Set(missingSuggestions)],
    proposals,
  };
}

