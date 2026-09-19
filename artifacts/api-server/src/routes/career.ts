import { Router, type IRouter } from "express";
import {
  ApplyForCoachingBody,
  ApplyForCoachingResponse,
  AskSmokeyBody,
  AskSmokeyResponse,
  CreateDiagnosticResponse,
  CreateProfileBody,
  CreateProfileResponse,
  GetCareerOverviewResponse,
  GetInterviewPrepResponse,
  ListJobsQueryParams,
  ListJobsResponse,
} from "@workspace/api-zod";
import { db, adminUsersTable, applicationOutcomesTable, coachingApplicationsTable, diagnosticReportsTable, generatedCvsTable, jobsTable, profilesTable, programmesTable } from "@workspace/db";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { searchTrustedJobBoards, getTrustedBoardLabels } from "../lib/job-board-search";
import { requireUser, type AuthedUserRequest } from "../lib/user-sessions";
import { ensurePrimaryAdmin } from "../lib/admin-auth";
import { createAdminNotification } from "../lib/admin-ops";
import {
  PLAN_CATALOG,
  PROGRAMME,
  PROGRAMME_CURRICULUM,
  activateProgramme,
  resolveEntitlement,
  setSubscriptionPlan,
  type PlanId,
} from "../lib/billing";
import {
  DocumentExtractionError,
  extractTextFromUpload,
} from "../lib/extract-document-text";
import { resolveBonlistApkPath, streamBonlistApk } from "../lib/android-apk";
import { statSync } from "node:fs";
import {
  CV_STRUCTURES,
  STRUCTURE_META,
  buildGeneratedCv,
  improveBulletPoint,
  evaluateAts,
  evaluateQualityScore,
  generateRecruiterView,
  humanizeContent,
  matchJobDescription,
  extractCvDataFromText,
  answerAdvisorQuestion,
  auditAuthenticity,
  nextCvStructure,
  normalizeStructure,
  traceCvEvidence,
  runAiSelfReview,
  analyzeCareerPositioning,
  matchJobDescriptionAdvanced,
  discoverTransferableSkills,
  generateAchievementDiscoveryQuestions,
  incorporateDiscoveredAchievement,
  runPreFlightQualityControl,
  improveCvContent,
  type CvStructure,
  type GeneratedCvDocument,
  type HumanizeTone,
  type ExtractedCvData,
  type ImproveCvScope,
} from "../lib/cv-builder";

const router: IRouter = Router();

function toProfileResponse(profile: typeof profilesTable.$inferSelect, profileCount: number) {
  return CreateProfileResponse.parse({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? undefined,
    location: profile.location ?? undefined,
    targetRole: profile.targetRole ?? undefined,
    createdAt: profile.createdAt.toISOString(),
    profileCount,
  });
}

/** Resolve a career profile for CV ops; upsert by email when an old/stale id is sent. */
async function resolveOrUpsertCvProfile(body: Record<string, unknown> | undefined) {
  const profileId = Number(body?.profileId);
  if (Number.isFinite(profileId) && profileId > 0) {
    const [existing] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.id, profileId))
      .limit(1);
    if (existing) return existing;
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const name = String(body?.name || "").trim();
  if (!email || !name) return null;

  const [byEmail] = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.email, email))
    .limit(1);
  if (byEmail) return byEmail;

  const [created] = await db
    .insert(profilesTable)
    .values({
      name,
      email,
      phone: body?.phone != null ? String(body.phone).trim() || undefined : undefined,
      location: body?.location != null ? String(body.location).trim() || undefined : undefined,
      targetRole: body?.targetRole != null ? String(body.targetRole).trim() || undefined : undefined,
    })
    .returning();
  return created ?? null;
}

const seededJobs = [
  {
    title: "Product Marketing Manager",
    company: "Yoco",
    location: "Western Cape · Hybrid",
    sector: "Marketing",
    salary: "R52k – R68k / month",
    match: 94,
    posted: "2 days ago",
    tags: ["Go-to-market", "B2B SaaS", "Campaigns"],
  },
  {
    title: "Brand & Content Lead",
    company: "Takealot",
    location: "Western Cape · Cape Town",
    sector: "Marketing",
    salary: "R45k – R58k / month",
    match: 88,
    posted: "5 days ago",
    tags: ["Content strategy", "SEO", "Retail"],
  },
  {
    title: "Growth Marketing Specialist",
    company: "Discovery",
    location: "Gauteng · Hybrid",
    sector: "Marketing",
    salary: "R38k – R48k / month",
    match: 81,
    posted: "1 week ago",
    tags: ["Performance", "Analytics", "Lifecycle"],
  },
  {
    title: "Marketing Operations Manager",
    company: "Old Mutual",
    location: "Gauteng · Johannesburg",
    sector: "Financial Services",
    salary: "R50k – R65k / month",
    match: 76,
    posted: "1 week ago",
    tags: ["CRM", "Reporting", "Stakeholders"],
  },
  {
    title: "Senior Communications Manager",
    company: "Nedbank",
    location: "KZN · Durban",
    sector: "Financial Services",
    salary: "R46k – R60k / month",
    match: 72,
    posted: "2 weeks ago",
    tags: ["Comms", "Reputation", "Leadership"],
  },
  {
    title: "Digital Marketing Manager",
    company: "Mr D Food",
    location: "Western Cape · Cape Town",
    sector: "Marketing",
    salary: "R42k – R55k / month",
    match: 86,
    posted: "1 day ago",
    tags: ["Paid media", "Brand", "E-commerce"],
  },
  {
    title: "Lifecycle Marketing Lead",
    company: "TymeBank",
    location: "Gauteng · Johannesburg",
    sector: "Marketing",
    salary: "R48k – R62k / month",
    match: 90,
    posted: "3 days ago",
    tags: ["CRM", "Lifecycle", "Fintech"],
  },
  {
    title: "Operations Coordinator",
    company: "SweepSouth",
    location: "Western Cape · Hybrid",
    sector: "Operations",
    salary: "R28k – R36k / month",
    match: 79,
    posted: "4 days ago",
    tags: ["Ops", "Vendor management", "Process"],
  },
  {
    title: "Business Operations Analyst",
    company: "Standard Bank",
    location: "Gauteng · Johannesburg",
    sector: "Operations",
    salary: "R40k – R52k / month",
    match: 77,
    posted: "6 days ago",
    tags: ["Analysis", "Process", "Stakeholders"],
  },
  {
    title: "Frontend Engineer",
    company: "OfferZen",
    location: "Western Cape · Remote",
    sector: "Technology",
    salary: "R55k – R75k / month",
    match: 84,
    posted: "2 days ago",
    tags: ["React", "TypeScript", "Product"],
  },
  {
    title: "Full Stack Developer",
    company: "Shopify SA partners",
    location: "Gauteng · Hybrid",
    sector: "Technology",
    salary: "R50k – R70k / month",
    match: 80,
    posted: "5 days ago",
    tags: ["Node", "React", "APIs"],
  },
  {
    title: "Finance Business Partner",
    company: "Woolworths",
    location: "Western Cape · Cape Town",
    sector: "Finance",
    salary: "R55k – R72k / month",
    match: 75,
    posted: "1 week ago",
    tags: ["FP&A", "Retail", "Reporting"],
  },
];

function inferSector(role?: string): string {
  const value = (role || "").toLowerCase();
  if (/engineer|developer|software|tech|data/.test(value)) return "Technology";
  if (/ops|operations|coordinator|logistics/.test(value)) return "Operations";
  if (/finance|accountant|analyst|fp&a/.test(value)) return "Finance";
  if (/comms|communication|pr|reputation/.test(value)) return "Financial Services";
  return "Marketing";
}

function scoreJobRelevance(
  job: (typeof seededJobs)[number],
  role: string,
  location?: string,
): number {
  let score = job.match;
  const roleWords = role.toLowerCase().split(/\s+/).filter(Boolean);
  for (const word of roleWords) {
    if (job.title.toLowerCase().includes(word)) score += 8;
    if (job.tags.some((tag) => tag.toLowerCase().includes(word))) score += 4;
  }
  if (location && job.location.toLowerCase().includes(location.toLowerCase())) {
    score += 12;
  }
  const sector = inferSector(role);
  if (job.sector.toLowerCase().includes(sector.toLowerCase()) || sector.toLowerCase().includes(job.sector.toLowerCase())) {
    score += 10;
  }
  return score;
}

async function ensureJobs() {
  const existing = await db.select().from(jobsTable);
  if (existing.length === 0) {
    await db.insert(jobsTable).values(seededJobs);
    return;
  }
  const titles = new Set(existing.map((job) => job.title));
  const missing = seededJobs.filter((job) => !titles.has(job.title));
  if (missing.length > 0) {
    await db.insert(jobsTable).values(missing);
  }
}

function documentFromExtracted(extracted: ExtractedCvData, targetRole: string): GeneratedCvDocument {
  return {
    structure: "classic",
    structureLabel: "Classic",
    structureDescription: "Diagnostic analysis document",
    templateType: "single_column",
  fullName: extracted.personal?.fullName || "",
  headline: extracted.personal?.professionalTitle || targetRole || "",
    contactLine: [extracted.personal?.email, extracted.personal?.phone, extracted.personal?.location]
      .filter(Boolean)
      .join(" · "),
    email: extracted.personal?.email || "",
    phone: extracted.personal?.phone,
    location: extracted.personal?.location,
    linkedin: extracted.personal?.linkedin,
    website: extracted.personal?.website,
    summary: extracted.summary || "",
    experiences: extracted.experiences || [],
    education: extracted.education || [],
    skillGroups: [],
    skills: extracted.skills || [],
    projects: extracted.projects,
    certifications: extracted.certifications,
    languages: extracted.languages,
    references: extracted.references,
    keywords: extracted.skills || [],
    sections: [],
    footerNote: "",
    authenticityScore: 80,
    aiFeedback: extracted.ai_feedback,
  };
}

function buildDiagnosticPayload(input: {
  fileName: string;
  role?: string;
  location?: string;
  reportId: number;
  relatedJobs: Array<{
    id: number;
    title: string;
    company: string;
    location: string;
    sector: string;
    salary: string;
    match: number;
    posted: string;
    tags: string[];
    source?: string;
    url?: string;
    description?: string;
  }>;
  jobSearch: {
    query: string;
    queriedBoards: string[];
    liveResults: boolean;
  };
  analysis?: {
    authenticityScore: number;
    atsScore: number;
    overallScore: number;
    scores: {
      clarity: number;
      impact: number;
      structure: number;
      keywordFit: number;
      authenticity: number;
      ats: number;
    };
    strengths: Array<{ title: string; detail: string; priority?: string }>;
    improvements: Array<{ title: string; detail: string; priority?: string }>;
    sectionReviews: Array<{ section: string; score: number; status: string; findings: string[] }>;
    flaggedPhrases: string[];
    missingKeywords: string[];
    rewriteExamples: Array<{ before: string; after: string }>;
    prompts: string[];
    summary: string;
  };
}) {
  const targetRole = input.role?.trim() || "Marketing & Growth";
  const locationLabel = input.location?.trim() || "South Africa";
  const scores = input.analysis?.scores ?? {
    clarity: 74,
    impact: 61,
    structure: 79,
    keywordFit: 66,
    authenticity: 82,
    ats: 68,
  };
  const overallScore =
    input.analysis?.overallScore ??
    Math.round(
      (scores.clarity + scores.impact + scores.structure + scores.keywordFit + scores.authenticity + scores.ats) / 6,
    );
  const searchNote = input.jobSearch.liveResults
    ? ` We also searched trusted boards (${input.jobSearch.queriedBoards.slice(0, 4).join(", ")}) for recently listed ${targetRole} roles in ${locationLabel}.`
    : ` Live board search was limited just now, so recommendations use verified BonList matches while we keep querying trusted SA boards.`;

  const defaultSummary = `Your CV reads as credible for ${targetRole}, with solid structure and authentic voice. Impact language is the main gap — recruiters in ${locationLabel} need clearer proof of what changed because of your work.${searchNote}`;

  return {
    id: input.reportId,
    fileName: input.fileName,
    targetRole,
    summary: input.analysis?.summary ? `${input.analysis.summary}${searchNote}` : defaultSummary,
    overallScore,
    authenticityScore: input.analysis?.authenticityScore ?? scores.authenticity,
    atsScore: input.analysis?.atsScore ?? scores.ats,
    scores,
    strengths: input.analysis?.strengths ?? [
      {
        title: "Clear professional through-line",
        detail: "Your experience progression is easy to follow and supports a coherent career story.",
      },
      {
        title: "Authentic tone",
        detail: "Most sections sound like a real person rather than a template — that helps trust.",
      },
      {
        title: "Useful section hierarchy",
        detail: "Headings and ordering help both humans and ATS parsers scan quickly.",
      },
    ],
    improvements: input.analysis?.improvements ?? [
      {
        priority: "high",
        title: "Quantify outcomes, not activity",
        detail: "Replace task lists with before/after metrics: conversion, pipeline, retention, cost, or time saved.",
      },
      {
        priority: "high",
        title: "Name ownership scope",
        detail: "State budgets, channels, team size, or stakeholders you owned so seniority is obvious.",
      },
      {
        priority: "medium",
        title: "Cut polished filler phrases",
        detail: "Words like “results-driven” and “spearheaded” hide contribution. Prefer concrete verbs and proof.",
      },
      {
        priority: "medium",
        title: "Align keywords to the target role",
        detail: `Mirror language from live ${targetRole} postings only where your experience can prove it.`,
      },
    ],
    sectionReviews: input.analysis?.sectionReviews ?? [
      {
        section: "Professional summary",
        score: 71,
        status: "Needs sharpening",
        findings: [
          "Summary is pleasant but generic for the target role.",
          "Lead with your strongest proof point and the market you know.",
        ],
      },
      {
        section: "Experience bullets",
        score: 63,
        status: "Priority rewrite",
        findings: [
          "Several bullets describe duties instead of decisions and outcomes.",
          "Add baselines and timeframes so impact is measurable.",
        ],
      },
      {
        section: "Skills & tools",
        score: 78,
        status: "Solid",
        findings: [
          "Tooling is readable, but role-critical keywords are underweighted.",
          "Group skills by capability rather than a flat list.",
        ],
      },
      {
        section: "Formatting & ATS",
        score: 68,
        status: "Improve parseability",
        findings: [
          "Avoid complex tables or text boxes if present.",
          "Keep standard section labels ATS systems expect.",
        ],
      },
    ],
    flaggedPhrases: input.analysis?.flaggedPhrases ?? [
      "results-driven",
      "spearheaded",
      "delve",
      "passionate about",
      "team player",
    ],
    missingKeywords: input.analysis?.missingKeywords ?? [
      "Lifecycle marketing",
      "Go-to-market",
      "CRM",
      "Stakeholder management",
      "Campaign analytics",
    ],
    rewriteExamples: input.analysis?.rewriteExamples ?? [
      {
        before: "Spearheaded campaigns to drive engagement across channels.",
        after:
          "Owned a 3-channel lifecycle campaign that lifted email click-through from 2.1% to 3.4% in one quarter.",
      },
      {
        before: "Results-driven marketer with strong communication skills.",
        after: `${targetRole} candidate who improved qualified lead volume by 20% through clearer messaging and tighter CRM handoffs.`,
      },
    ],
    prompts: input.analysis?.prompts ?? [
      "What changed because of your work? Add a measurable outcome with a baseline.",
      "Name the audience, channel, budget, or team size you owned.",
      "Replace one general claim with a single real example a hiring manager can verify.",
      "Which keyword from recent trusted board listings can you prove in one sentence?",
    ],
    relatedJobs: input.relatedJobs,
    jobSearch: input.jobSearch,
  };
}

function analyzeUploadedCv(params: {
  extracted: ExtractedCvData;
  targetRole: string;
  locationLabel: string;
}) {
  const { extracted, targetRole, locationLabel } = params;
  const doc = documentFromExtracted(extracted, targetRole);
  const ats = evaluateAts(doc, targetRole);
  const quality = evaluateQualityScore(doc, targetRole);
  const authenticity = auditAuthenticity(doc, { userProvidedMetrics: true });

  const allBullets = doc.experiences.flatMap((e) => e.bullets);
  const rewriteExamples = (ats.weakBullets || [])
    .slice(0, 3)
    .map((item) => ({
      before: item.bullet,
      after: item.suggestedImprovement || item.bullet,
    }));

  const flaggedPhrases = authenticity.flaggedItems
    .map((item) => {
      const match = /"([^"]+)"/.exec(item.reason);
      return match?.[1] || item.text.slice(0, 40);
    })
    .filter(Boolean)
    .slice(0, 8);

  const strengths: Array<{ title: string; detail: string }> = [];
  if (doc.summary.length >= 80) {
    strengths.push({
      title: "Professional summary present",
      detail: "Your summary gives recruiters a readable opening for your story.",
    });
  }
  if (doc.experiences.length >= 1) {
    strengths.push({
      title: "Work history detected",
      detail: `${doc.experiences.length} role${doc.experiences.length === 1 ? "" : "s"} parsed from your upload.`,
    });
  }
  if (doc.skills.length >= 4) {
    strengths.push({
      title: "Skills section readable",
      detail: `${doc.skills.length} skills indexed for ATS and keyword matching.`,
    });
  }
  if (authenticity.score >= 85) {
    strengths.push({
      title: "Authentic voice",
      detail: "Low buzzword density — your wording reads closer to real experience than template filler.",
    });
  }
  if (strengths.length === 0) {
    strengths.push({
      title: "Document accepted",
      detail: "We could read your CV text. Next edits should focus on proof and role keywords.",
    });
  }

  const improvements: Array<{ title: string; detail: string; priority: string }> = [];
  for (const fix of (ats.recommendedFixes || []).slice(0, 3)) {
    improvements.push({ priority: "high", title: "ATS improvement", detail: fix });
  }
  for (const inquiry of authenticity.inquiries.slice(0, 2)) {
    improvements.push({
      priority: "medium",
      title: inquiry.field,
      detail: inquiry.question,
    });
  }
  if (improvements.length === 0) {
    improvements.push({
      priority: "medium",
      title: "Align to target role language",
      detail: `Mirror phrasing from live ${targetRole} postings in ${locationLabel} only where you can prove it.`,
    });
  }

  const sectionReviews = [
    {
      section: "Professional summary",
      score: Math.min(100, Math.round(doc.summary.length >= 120 ? 82 : doc.summary.length >= 40 ? 64 : 45)),
      status: doc.summary.length >= 80 ? "Solid" : "Needs sharpening",
      findings: [
        doc.summary.length >= 80
          ? "Summary length is in a useful range for recruiters."
          : "Expand the summary with domain focus and one proof point.",
        doc.headline && doc.headline !== "Professional"
          ? `Headline "${doc.headline}" helps indexing.`
          : "Add a specific professional headline aligned to your target role.",
      ],
    },
    {
      section: "Experience bullets",
      score: Math.min(100, Math.round(ats.categories.actionVerbs * 0.5 + ats.categories.quantifiedMetrics * 0.5)),
      status: allBullets.length >= 4 ? "Priority rewrite" : "Needs more detail",
      findings: [
        `${allBullets.length} experience bullets detected.`,
        ats.weakBullets.length
          ? `${ats.weakBullets.length} bullets need stronger verbs or metrics.`
          : "Bullets already lean on action and proof.",
      ],
    },
    {
      section: "Skills & tools",
      score: Math.min(100, 40 + doc.skills.length * 6),
      status: doc.skills.length >= 5 ? "Solid" : "Expand",
      findings: [
        `${doc.skills.length} skills extracted.`,
        ats.missingKeywords.length
          ? `Consider proving: ${ats.missingKeywords.slice(0, 3).join(", ")}.`
          : "Keyword coverage looks reasonable for the target role.",
      ],
    },
    {
      section: "Formatting & ATS",
      score: ats.categories.formatCompliance,
      status: ats.overallScore >= 75 ? "Competitive" : "Improve parseability",
      findings: [
        `ATS grade: ${ats.grade}.`,
        "Keep standard section labels and avoid image-only text.",
      ],
    },
  ];

  const scores = {
    clarity: quality.pillars.clarity.score,
    impact: Math.round((ats.categories.quantifiedMetrics + ats.categories.actionVerbs) / 2),
    structure: quality.pillars.presentation.score,
    keywordFit: ats.categories.keywordMatch,
    authenticity: authenticity.score,
    ats: ats.overallScore,
  };

  return {
    authenticityScore: authenticity.score,
    atsScore: ats.overallScore,
    overallScore: Math.round(
      (scores.clarity + scores.impact + scores.structure + scores.keywordFit + scores.authenticity + scores.ats) / 6,
    ),
    scores,
    strengths,
    improvements,
    sectionReviews,
    flaggedPhrases: flaggedPhrases.length
      ? flaggedPhrases
      : ["results-driven", "spearheaded", "passionate about"],
    missingKeywords: (ats.missingKeywords || []).slice(0, 8),
    rewriteExamples:
      rewriteExamples.length > 0
        ? rewriteExamples
        : [
            {
              before: "Responsible for daily operations and stakeholder updates.",
              after: `Coordinated ${targetRole} delivery across stakeholders, cutting turnaround time by a measurable weekly target.`,
            },
          ],
    prompts: [
      "What changed because of your work? Add a measurable outcome with a baseline.",
      "Name the audience, channel, budget, or team size you owned.",
      authenticity.inquiries[0]?.question ||
        "Replace one general claim with a single real example a hiring manager can verify.",
      `Which keyword from recent ${targetRole} listings can you prove in one sentence?`,
    ],
    summary: `We analysed your uploaded CV for ${targetRole}. Overall readiness sits at a composite view of authenticity (${authenticity.score}) and ATS fit (${ats.overallScore}). Focus next on stronger proof language and role-aligned keywords for ${locationLabel}.`,
  };
}


function smokeyReply(message: string, role?: string, fileName?: string, cvDocument?: any) {
  const lower = message.toLowerCase();
  const roleLabel = role?.trim() || "your target role";
  const fileNote = fileName ? ` I can see you uploaded ${fileName}.` : "";

  // Dedicated CV Builder agent capabilities
  if (/ats|score|pass|checker|rating/.test(lower)) {
    return {
      reply: `Our ATS analyzer runs 27 checks covering active verbs, quantified metrics, keyword density, and clean text-layer formatting. For ${roleLabel}, ensure at least 50% of your experience bullets contain quantifiable metrics (%, Rands, time saved). Try the "Run Live ATS Check" button in your builder toolbar for real-time scores!`,
      suggestions: [
        "What keywords am I missing?",
        "Rewrite my weakest bullet for impact",
        "Which template gives the highest ATS score?",
      ],
    };
  }

  if (/rewrite|bullet|improve bullet|quantif|weak bullet/.test(lower)) {
    return {
      reply: `Here is the golden ATS formula for bullet points: [Power Action Verb] + [Specific Task / Project Scope] + [Quantified Metric & Business Result]. For instance: "Overhauled sprint workflows across 3 teams, cutting delivery cycles from 5 days to 48 hours." You can also click the magic wand icon next to any bullet in your builder!`,
      suggestions: [
        "Give me power action verbs for my role",
        "How do I quantify if I have no exact numbers?",
        "Tailor my CV for a specific job ad",
      ],
    };
  }

  if (/tailor|job ad|job description|paste/.test(lower)) {
    return {
      reply: `To tailor your CV for a specific opening: Paste the job description into the "Job Tailoring" tab on the right of the CV Builder. I will instantly cross-reference keywords, flag missing skills, and calculate your custom match percentage so you can submit with total confidence!`,
      suggestions: [
        "What are the top 5 keywords recruiters look for?",
        "Which template should I use?",
        "Run live ATS review",
      ],
    };
  }

  if (/template|design|layout|double column|enhancv/.test(lower)) {
    return {
      reply: `We provide 5 ATS-tested designer templates inspired by modern standards: Modern Double Column (ideal for fitting 1-page density), Executive Classic (timeless leadership), Contemporary Hybrid, Technical Minimal (100% indexing priority), and Impact High-Performer. You can switch templates and accent colors anytime without losing your content!`,
      suggestions: [
        "Show me the ATS score breakdown",
        "How do I export to clean PDF?",
        "Prep me for an interview",
      ],
    };
  }

  if (/hello|hi|hey|smokey/.test(lower)) {
    return {
      reply: `Hey — I'm Smokey, your BonList CV & Career copilot.${fileNote} I can optimize your resume for ATS parsers, rewrite bullets with active verbs, tailor your CV against job ads, or prep you for interviews for ${roleLabel}. What are we working on?`,
      suggestions: [
        "How do I increase my ATS score above 85%?",
        "Rewrite my experience bullets for impact",
        "Tailor my CV to a job posting",
      ],
    };
  }
  if (/summary|profile|intro/.test(lower)) {
    return {
      reply: `For ${roleLabel}, open with one proof point, one domain, and one outcome. Example shape: “${roleLabel} professional who delivered 28% efficiency gains through structured execution and stakeholder alignment.” Skip generic buzzwords like “results-driven” or “hardworking”.`,
      suggestions: [
        "Rewrite this bullet for impact",
        "Which keywords should I add?",
        "Show me interview questions",
      ],
    };
  }
  if (/keyword|ats|scan/.test(lower)) {
    return {
      reply: `ATS care about exact role language, but humans care about proof. Mirror ${roleLabel} keywords only where your experience is real — then show the metric beside each one.`,
      suggestions: [
        "What phrases should I remove?",
        "How do I improve impact bullets?",
        "Find roles that fit me",
      ],
    };
  }
  if (/interview|question|star/.test(lower)) {
    return {
      reply: `Interview well by rehearsing 3 STAR stories tied to claims already on your CV. For ${roleLabel}, prioritise stories about stakeholder alignment, measurable growth, and a hard trade-off you owned.`,
      suggestions: [
        "Help me structure a STAR answer",
        "What makes a weak interview answer?",
        "How do I talk about career gaps?",
      ],
    };
  }
  if (/job|role|match|hiring|apply/.test(lower)) {
    return {
      reply: `Focus on recently listed roles that share your strongest evidence, not every open seat. Use your diagnostic gaps as a checklist before each application for ${roleLabel}.`,
      suggestions: [
        "What should I fix before applying?",
        "How do I tailor my CV per role?",
        "Should I apply for coaching?",
      ],
    };
  }

  return {
    reply: `I can help you sharpen proof, choose better wording, or prep interviews for ${roleLabel}.${fileNote} Tell me whether you want CV edits, keywords, or interview practice next.`,
    suggestions: [
      "How do I strengthen my CV summary?",
      "What should I quantify on my CV?",
      "How do I prep for interviews?",
    ],
  };
}

router.get("/career/overview", async (req, res) => {
  await ensureJobs();
  const jobs = await db.select().from(jobsTable);
  const latestReport = await db.select().from(diagnosticReportsTable).limit(1);
  const [{ value: profileCount }] = await db.select({ value: count() }).from(profilesTable);
  const data = GetCareerOverviewResponse.parse({
    diagnosticScore: latestReport[0]?.authenticityScore ?? 82,
    jobMatchCount: jobs.length,
    interviewProgress: 2,
    latestRole: "Marketing & Growth",
    profileCount,
  });
  req.log.info({ jobMatchCount: jobs.length, profileCount }, "Career overview requested");
  res.json(data);
});

router.post("/career/profile", async (req, res) => {
  const input = CreateProfileBody.parse(req.body);
  const existing = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.email, input.email.toLowerCase().trim()))
    .limit(1);

  let profile = existing[0];
  if (!profile) {
    const [created] = await db
      .insert(profilesTable)
      .values({
        name: input.name.trim(),
        email: input.email.toLowerCase().trim(),
        phone: input.phone?.trim() || undefined,
        location: input.location?.trim() || undefined,
        targetRole: input.targetRole?.trim() || undefined,
      })
      .returning();
    profile = created;
  }

  const [{ value: profileCount }] = await db.select({ value: count() }).from(profilesTable);
  const data = toProfileResponse(profile, profileCount);
  req.log.info({ profileId: profile.id, profileCount }, "Profile created or restored");
  res.status(201).json(data);
});

router.patch("/career/profile", async (req, res) => {
  const rawId = req.body?.id;
  const numericId = Number(rawId);
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const phone = req.body?.phone != null ? String(req.body.phone).trim() : undefined;
  const location = req.body?.location != null ? String(req.body.location).trim() : undefined;
  const targetRole = req.body?.targetRole != null ? String(req.body.targetRole).trim() : undefined;

  if (!name || name.length < 2) {
    res.status(400).json({ error: "Please enter your full name" });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Please enter a valid email address" });
    return;
  }

  // D1 auth uses UUID string ids; career profiles on Render use integer ids.
  // Accept either a numeric profile id or look up / create by email.
  let current:
    | (typeof profilesTable.$inferSelect)
    | undefined;

  if (Number.isFinite(numericId) && numericId > 0) {
    const [byId] = await db.select().from(profilesTable).where(eq(profilesTable.id, numericId)).limit(1);
    current = byId;
  }

  if (!current) {
    const [byEmail] = await db
      .select()
      .from(profilesTable)
      .where(eq(profilesTable.email, email))
      .limit(1);
    current = byEmail;
  }

  if (!current) {
    const [created] = await db
      .insert(profilesTable)
      .values({
        name,
        email,
        phone: phone || undefined,
        location: location || undefined,
        targetRole: targetRole || undefined,
      })
      .returning();
    current = created;
  }

  if (!current) {
    res.status(400).json({ error: "A valid profile id is required" });
    return;
  }
  if (current.status && current.status !== "active") {
    res.status(403).json({ error: "This account is inactive and cannot be updated." });
    return;
  }

  if (email !== current.email.toLowerCase()) {
    const [emailTaken] = await db
      .select()
      .from(profilesTable)
      .where(and(eq(profilesTable.email, email), ne(profilesTable.id, current.id)))
      .limit(1);
    if (emailTaken) {
      res.status(409).json({ error: "That email is already used by another account." });
      return;
    }
  }

  const [updated] = await db
    .update(profilesTable)
    .set({
      name,
      email,
      phone: phone || null,
      location: location || null,
      targetRole: targetRole || null,
    })
    .where(eq(profilesTable.id, current.id))
    .returning();

  if (email !== current.email.toLowerCase() || name !== current.name) {
    const [admin] = await db
      .select()
      .from(adminUsersTable)
      .where(eq(adminUsersTable.email, current.email.toLowerCase()))
      .limit(1);
    if (admin) {
      await db
        .update(adminUsersTable)
        .set({
          name,
          email,
        })
        .where(eq(adminUsersTable.id, admin.id));
    }

    if (email !== current.email.toLowerCase()) {
      await db
        .update(diagnosticReportsTable)
        .set({ profileEmail: email })
        .where(eq(diagnosticReportsTable.profileEmail, current.email.toLowerCase()));
      await db
        .update(coachingApplicationsTable)
        .set({ email })
        .where(eq(coachingApplicationsTable.email, current.email.toLowerCase()));
    }
  }

  const [{ value: profileCount }] = await db.select({ value: count() }).from(profilesTable);
  req.log.info({ profileId: updated.id }, "Profile updated");
  res.json(toProfileResponse(updated, profileCount));
});

router.get("/career/jobs", async (req, res) => {
  await ensureJobs();
  const query = ListJobsQueryParams.parse(req.query);
  const jobs = await db.select().from(jobsTable);
  const filtered = jobs
    .filter((job) => !job.status || job.status === "published")
    .filter((job) => {
      const matchesLocation =
        !query.location ||
        job.location.toLowerCase().includes(query.location.toLowerCase());
      const matchesSector =
        !query.sector ||
        job.sector.toLowerCase().includes(query.sector.toLowerCase());
      return matchesLocation && matchesSector;
    })
    .map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      sector: job.sector,
      salary: job.salary,
      match: job.match,
      posted: job.posted,
      tags: job.tags,
    }));
  res.json(ListJobsResponse.parse(filtered));
});

router.post("/career/diagnostic", requireUser, async (req: AuthedUserRequest, res) => {
  try {
    await ensureJobs();
    const body = (req.body || {}) as Record<string, unknown>;
    const fileName = String(body.fileName || "").trim();
    if (!fileName) {
      res.status(400).json({ error: "fileName is required" });
      return;
    }

    const profile = req.userProfile!;

    const roleFromBody = typeof body.role === "string" ? body.role.trim() : "";
    const locationFromBody = typeof body.location === "string" ? body.location.trim() : "";
    const targetRole = roleFromBody || profile.targetRole || "Marketing & Growth";
    const locationLabel = locationFromBody || profile.location || "South Africa";

    const fileData = typeof body.fileData === "string" ? body.fileData : undefined;
    const pastedText = typeof body.text === "string" ? body.text : undefined;

    let analysis: ReturnType<typeof analyzeUploadedCv> | undefined;
    if (fileData || pastedText) {
      try {
        const extractedDoc = await extractTextFromUpload({
          text: pastedText,
          fileName,
          fileData,
        });
        if (!extractedDoc.text || extractedDoc.text.trim().length < 10) {
          res.status(400).json({
            error:
              "No readable CV text was found. Scanned/image-only PDFs are not supported — upload a text PDF, Word (.docx), or paste the CV text.",
          });
          return;
        }
        const extracted = extractCvDataFromText(extractedDoc.text, fileName);
        analysis = analyzeUploadedCv({
          extracted,
          targetRole,
          locationLabel,
        });
      } catch (extractErr) {
        const message =
          extractErr instanceof DocumentExtractionError
            ? extractErr.message
            : "Failed to read the uploaded document. Please upload a text-based PDF, Word (.docx), or .txt file.";
        req.log.warn({ err: extractErr, fileName }, "CV diagnostic text extraction failed");
        res.status(400).json({ error: message });
        return;
      }
    }

    const MATCH_LIMIT = 6;
    const liveSearch = await searchTrustedJobBoards({
      role: targetRole,
      location: locationLabel,
      limit: MATCH_LIMIT,
    });

    const relatedJobs = liveSearch.jobs;
    const jobSearch = {
      query: liveSearch.query,
      queriedBoards: liveSearch.queriedBoards,
      liveResults: liveSearch.liveResults,
      boardSearchLinks: liveSearch.boardSearchLinks,
    };

    const draftPayload = buildDiagnosticPayload({
      fileName,
      role: targetRole,
      location: locationLabel,
      reportId: 0,
      relatedJobs: relatedJobs.slice(0, MATCH_LIMIT),
      jobSearch,
      analysis,
    });

    const [report] = await db
      .insert(diagnosticReportsTable)
      .values({
        fileName,
        authenticityScore: draftPayload.authenticityScore,
        atsScore: draftPayload.atsScore,
        flaggedPhrases: draftPayload.flaggedPhrases,
        missingKeywords: draftPayload.missingKeywords,
        prompts: draftPayload.prompts,
        profileId: profile.id,
        profileEmail: profile.email.toLowerCase(),
        targetRole,
        status: "completed",
        reportJson: JSON.stringify({ ...draftPayload, id: undefined }),
      })
      .returning();

    const data = CreateDiagnosticResponse.parse(
      buildDiagnosticPayload({
        fileName: report.fileName,
        role: targetRole,
        location: locationLabel,
        reportId: report.id,
        relatedJobs: relatedJobs.slice(0, MATCH_LIMIT),
        jobSearch,
        analysis,
      }),
    );

    await db
      .update(diagnosticReportsTable)
      .set({ reportJson: JSON.stringify(data) })
      .where(eq(diagnosticReportsTable.id, report.id));

    try {
      await createAdminNotification({
        type: "diagnostic.created",
        title: "New CV review",
        body: `${report.fileName} · ATS ${report.atsScore} · Authenticity ${report.authenticityScore} · ${profile.email}`,
        entityType: "diagnostic",
        entityId: report.id,
      });
    } catch {
      /* ignore */
    }

    req.log.info(
      {
        reportId: report.id,
        profileId: profile.id,
        fileName: report.fileName,
        analyzed: Boolean(analysis),
        liveResults: jobSearch.liveResults,
        relatedJobs: relatedJobs.length,
      },
      "CV diagnostic created with trusted board search",
    );
    res.status(201).json(data);
  } catch (err) {
    req.log.error({ err }, "Error in /career/diagnostic");
    if (err && typeof err === "object" && "issues" in err) {
      res.status(400).json({ error: "Invalid diagnostic request" });
      return;
    }
    res.status(500).json({ error: "Could not complete CV review. Please try again." });
  }
});

router.get("/career/diagnostic/latest", requireUser, async (req: AuthedUserRequest, res) => {
  const profileId = req.userProfile!.id;

  const [row] = await db
    .select()
    .from(diagnosticReportsTable)
    .where(eq(diagnosticReportsTable.profileId, profileId))
    .orderBy(desc(diagnosticReportsTable.createdAt))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "No CV review found yet" });
    return;
  }

  if (row.reportJson) {
    try {
      const parsed = JSON.parse(row.reportJson);
      res.json(CreateDiagnosticResponse.parse({ ...parsed, id: row.id }));
      return;
    } catch {
      // fall through to rebuild
    }
  }

  res.json(
    CreateDiagnosticResponse.parse(
      buildDiagnosticPayload({
        fileName: row.fileName,
        role: row.targetRole || undefined,
        reportId: row.id,
        relatedJobs: [],
        jobSearch: {
          query: row.targetRole || "South Africa",
          queriedBoards: getTrustedBoardLabels(),
          liveResults: false,
        },
        analysis: {
          authenticityScore: row.authenticityScore,
          atsScore: row.atsScore,
          overallScore: Math.round((row.authenticityScore + row.atsScore) / 2),
          scores: {
            clarity: row.authenticityScore,
            impact: row.atsScore,
            structure: 70,
            keywordFit: 65,
            authenticity: row.authenticityScore,
            ats: row.atsScore,
          },
          strengths: [],
          improvements: [],
          sectionReviews: [],
          flaggedPhrases: row.flaggedPhrases || [],
          missingKeywords: row.missingKeywords || [],
          rewriteExamples: [],
          prompts: row.prompts || [],
          summary: `Saved review for ${row.fileName}.`,
        },
      }),
    ),
  );
});

router.post("/career/smokey", (req, res) => {
  const input = AskSmokeyBody.parse(req.body);
  const data = AskSmokeyResponse.parse(smokeyReply(input.message, input.role, input.fileName, (req.body as any)?.cvDocument));
  req.log.info({ messageLength: input.message.length }, "Smokey consulted");
  res.json(data);
});

router.get("/career/interview", (_req, res) => {
  res.json(
    GetInterviewPrepResponse.parse({
      completed: 2,
      total: 5,
      questions: [
        {
          id: 1,
          question: "Tell me about a campaign you improved using customer or performance data.",
          context: "Your CV mentions a 20% increase in qualified leads.",
          hint: "Use STAR: situation, task, action, result. Include the baseline and what you personally changed.",
        },
        {
          id: 2,
          question: "How did you align stakeholders when a launch timeline changed?",
          context: "Your experience shows cross-functional launch ownership.",
          hint: "Focus on the decision you made, the trade-off, and how you kept people moving.",
        },
        {
          id: 3,
          question: "Which metric would you use to judge whether your next campaign worked?",
          context: "Recruiters want to hear how you connect activity to business value.",
          hint: "Choose one primary metric and explain why it matters for the role.",
        },
      ],
    }),
  );
});

router.post("/career/coaching", async (req, res) => {
  const input = ApplyForCoachingBody.parse(req.body);
  const [application] = await db
    .insert(coachingApplicationsTable)
    .values({
      ...input,
      status: "pending",
      priority: "normal",
    })
    .returning();
  try {
    await createAdminNotification({
      type: "coaching.submitted",
      title: "New coaching application",
      body: `${application.name} (${application.email}) · ${application.paymentPlan}`,
      entityType: "coaching",
      entityId: application.id,
    });
  } catch {
    /* ignore */
  }
  const data = ApplyForCoachingResponse.parse({
    id: application.id,
    status: application.status === "received" ? "pending" : application.status,
    message: "Thanks — your application is in. We’ll be in touch within one business day.",
  });
  req.log.info({ applicationId: application.id }, "Coaching application received");
  res.status(201).json(data);
});

router.get("/career/pricing", (_req, res) => {
  res.json({
    plans: PLAN_CATALOG,
    programme: PROGRAMME,
    curriculum: PROGRAMME_CURRICULUM.map(({ id, month, week, title, type, summary }) => ({
      id,
      month,
      week,
      title,
      type,
      summary,
    })),
  });
});

router.get("/career/entitlements", async (req, res) => {
  const profileId = Number(req.query.profileId);
  if (!Number.isFinite(profileId) || profileId <= 0) {
    res.status(400).json({ error: "profileId is required" });
    return;
  }
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, profileId)).limit(1);
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  const entitlement = await resolveEntitlement(profileId);
  res.json(entitlement);
});

router.post("/career/subscribe", async (req, res) => {
  const profileId = Number(req.body?.profileId);
  const plan = String(req.body?.plan || "").trim() as PlanId;
  if (!Number.isFinite(profileId) || profileId <= 0) {
    res.status(400).json({ error: "profileId is required" });
    return;
  }
  if (!["free", "job_seeker", "career_pro"].includes(plan)) {
    res.status(400).json({ error: "Invalid plan. Choose free, job_seeker, or career_pro." });
    return;
  }
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, profileId)).limit(1);
  if (!profile) {
    res.status(404).json({ error: "Profile not found. Please log in again." });
    return;
  }

  const entitlementBefore = await resolveEntitlement(profileId);
  if (entitlementBefore.programme?.status === "active") {
    res.status(409).json({
      error:
        "You already have full platform access through the active 3-month programme. No subscription is required until it ends.",
      entitlement: entitlementBefore,
    });
    return;
  }

  await setSubscriptionPlan(profileId, plan);
  const entitlement = await resolveEntitlement(profileId);
  try {
    await createAdminNotification({
      type: "billing.subscription",
      title: `Subscription: ${PLAN_CATALOG.find((p) => p.id === plan)?.name || plan}`,
      body: `${profile.name} (${profile.email}) selected ${plan}`,
      entityType: "profile",
      entityId: profileId,
    });
  } catch {
    /* ignore */
  }
  req.log.info({ profileId, plan }, "Subscription plan updated");
  res.json({ ok: true, entitlement });
});

router.post("/career/programme/purchase", async (req, res) => {
  const profileId = Number(req.body?.profileId);
  if (!Number.isFinite(profileId) || profileId <= 0) {
    res.status(400).json({ error: "profileId is required" });
    return;
  }
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, profileId)).limit(1);
  if (!profile) {
    res.status(404).json({ error: "Profile not found. Please log in again." });
    return;
  }

  const existing = await resolveEntitlement(profileId);
  if (existing.programme?.status === "active") {
    res.status(409).json({
      error: "You already have an active Career Accelerator programme.",
      entitlement: existing,
    });
    return;
  }

  const programme = await activateProgramme(profileId);
  const entitlement = await resolveEntitlement(profileId);
  try {
    await createAdminNotification({
      type: "billing.programme",
      title: "Programme purchased — Career Accelerator",
      body: `${profile.name} (${profile.email}) · R${PROGRAMME.priceZar} once-off · ends ${programme.endDate.toISOString().slice(0, 10)}`,
      entityType: "programme",
      entityId: programme.id,
    });
  } catch {
    /* ignore */
  }
  req.log.info({ profileId, programmeId: programme.id }, "Programme activated");
  res.status(201).json({
    ok: true,
    message:
      "Programme activated. You now have full platform access for 3 months — no additional subscription required.",
    programme: entitlement.programme,
    entitlement,
  });
});

router.get("/career/programme", async (req, res) => {
  const profileId = Number(req.query.profileId);
  if (!Number.isFinite(profileId) || profileId <= 0) {
    res.status(400).json({ error: "profileId is required" });
    return;
  }
  const entitlement = await resolveEntitlement(profileId);
  const monthLabels = {
    1: "Month 1 — Build Your Foundation",
    2: "Month 2 — Stand Out From The Crowd",
    3: "Month 3 — Interview & Job-Search Mastery",
  } as const;

  const completed = new Set(entitlement.programme?.completedLessons || []);
  const lessons = PROGRAMME_CURRICULUM.map((lesson) => ({
    ...lesson,
    completed: completed.has(lesson.id),
  }));
  const currentMonth = entitlement.programme?.currentMonth || 1;
  const upcoming = lessons.filter((l) => !l.completed).slice(0, 5);
  const currentModule =
    lessons.find((l) => l.id === entitlement.programme?.currentLessonId) ||
    upcoming[0] ||
    lessons[0] ||
    null;

  res.json({
    programme: entitlement.programme,
    access: entitlement.features,
    headline: "YOUR 3-MONTH CAREER ACCELERATOR",
    differentiator: {
      title: PROGRAMME.headline,
      philosophy: "Use AI as a tool. Don't let AI become your voice.",
      goal: "Become a stronger, more confident and more differentiated candidate.",
    },
    currentMonthLabel: monthLabels[currentMonth],
    currentModule,
    progressPercent: entitlement.programme?.progressPercent || 0,
    completedCount: completed.size,
    totalLessons: PROGRAMME_CURRICULUM.length,
    upcoming,
    lessons,
    months: [1, 2, 3].map((month) => ({
      month,
      label: monthLabels[month as 1 | 2 | 3],
      lessons: lessons.filter((l) => l.month === month),
    })),
    disclaimer: PROGRAMME.disclaimer,
  });
});

router.post("/career/programme/progress", async (req, res) => {
  const profileId = Number(req.body?.profileId);
  const lessonId = String(req.body?.lessonId || "").trim();
  const completed = Boolean(req.body?.completed ?? true);
  if (!Number.isFinite(profileId) || profileId <= 0 || !lessonId) {
    res.status(400).json({ error: "profileId and lessonId are required" });
    return;
  }
  if (!PROGRAMME_CURRICULUM.some((l) => l.id === lessonId)) {
    res.status(400).json({ error: "Unknown lesson" });
    return;
  }
  const entitlement = await resolveEntitlement(profileId);
  if (!entitlement.programme || entitlement.programme.status !== "active") {
    res.status(403).json({ error: "An active programme is required to track progress." });
    return;
  }

  const set = new Set(entitlement.programme.completedLessons);
  if (completed) set.add(lessonId);
  else set.delete(lessonId);
  const completedLessons = Array.from(set);
  const nextLesson =
    PROGRAMME_CURRICULUM.find((l) => !set.has(l.id))?.id || lessonId;

  const [updated] = await db
    .update(programmesTable)
    .set({
      completedLessons,
      currentLessonId: nextLesson,
      updatedAt: new Date(),
    })
    .where(eq(programmesTable.id, entitlement.programme.id))
    .returning();

  res.json({
    ok: true,
    completedLessons: updated.completedLessons,
    currentLessonId: updated.currentLessonId,
    progressPercent: Math.round((completedLessons.length / PROGRAMME_CURRICULUM.length) * 100),
  });
});

router.get("/career/cv/structures", (_req, res) => {
  res.json({
    structures: CV_STRUCTURES.map((id) => {
      const sample = buildGeneratedCv({
        profile: { name: "Candidate", email: "you@example.com", targetRole: "Target role" },
        structure: id,
      });
      return {
        id,
        label: sample.structureLabel,
        description: sample.structureDescription,
      };
    }),
  });
});

router.post("/career/cv/generate", requireUser, async (req: AuthedUserRequest, res) => {
  const regenerate = Boolean(req.body?.regenerate);
  let structure = String(req.body?.structure || "").trim() as CvStructure | "";

  const profile = req.userProfile;
  if (!profile) {
    res.status(401).json({ error: "Authentication is required to generate a CV." });
    return;
  }
  const profileId = profile.id;
  const diagnosticId = req.body?.diagnosticId != null ? Number(req.body.diagnosticId) : undefined;

  let diagnosticRow =
    diagnosticId && Number.isFinite(diagnosticId)
      ? (
          await db
            .select()
            .from(diagnosticReportsTable)
            .where(eq(diagnosticReportsTable.id, diagnosticId))
            .limit(1)
        )[0]
      : undefined;

  if (!diagnosticRow) {
    const [latest] = await db
      .select()
      .from(diagnosticReportsTable)
      .where(
        profile.email
          ? eq(diagnosticReportsTable.profileEmail, profile.email.toLowerCase())
          : eq(diagnosticReportsTable.profileId, profileId),
      )
      .orderBy(desc(diagnosticReportsTable.createdAt))
      .limit(1);
    diagnosticRow = latest;
  }

  const [previous] = await db
    .select()
    .from(generatedCvsTable)
    .where(eq(generatedCvsTable.profileId, profileId))
    .orderBy(desc(generatedCvsTable.createdAt))
    .limit(1);

  if (!structure || !CV_STRUCTURES.includes(structure as CvStructure)) {
    structure = regenerate ? nextCvStructure(previous?.structure) : "classic";
  }

  const diagnosticHints = diagnosticRow
    ? {
        targetRole: diagnosticRow.targetRole || profile.targetRole || undefined,
        missingKeywords: diagnosticRow.missingKeywords || [],
        flaggedPhrases: diagnosticRow.flaggedPhrases || [],
        strengths: [
          {
            title: "Clear professional through-line",
            detail: "Your experience progression is easy to follow and supports a coherent career story.",
          },
          {
            title: "Authentic tone",
            detail: "Most sections sound like a real person rather than a template.",
          },
        ],
        improvements: [
          {
            priority: "high",
            title: "Quantify outcomes, not activity",
            detail: "Replace task lists with before/after metrics.",
          },
          {
            priority: "high",
            title: "Name ownership scope",
            detail: "State budgets, channels, team size, or stakeholders you owned.",
          },
          {
            priority: "medium",
            title: "Cut polished filler phrases",
            detail: "Prefer concrete verbs and proof over filler.",
          },
        ],
        rewriteExamples: [
          {
            before: "Spearheaded campaigns to drive engagement across channels.",
            after:
              "Owned a 3-channel lifecycle campaign that lifted email click-through from 2.1% to 3.4% in one quarter.",
          },
          {
            before: "Results-driven marketer with strong communication skills.",
            after: `${diagnosticRow.targetRole || profile.targetRole || "Professional"} candidate who improved qualified lead volume by 20% through clearer messaging and tighter CRM handoffs.`,
          },
        ],
      }
    : {
        targetRole: profile.targetRole || undefined,
        missingKeywords: [],
        strengths: [],
        improvements: [],
        rewriteExamples: [],
      };

  // Prefer client-supplied diagnostic snapshot when present (full report lives in session).
  const clientDiagnostic = req.body?.diagnostic;
  if (clientDiagnostic && typeof clientDiagnostic === "object") {
    Object.assign(diagnosticHints, {
      targetRole: clientDiagnostic.targetRole || diagnosticHints.targetRole,
      summary: clientDiagnostic.summary,
      strengths: clientDiagnostic.strengths || diagnosticHints.strengths,
      improvements: clientDiagnostic.improvements || diagnosticHints.improvements,
      rewriteExamples: clientDiagnostic.rewriteExamples || diagnosticHints.rewriteExamples,
      missingKeywords: clientDiagnostic.missingKeywords || diagnosticHints.missingKeywords,
      flaggedPhrases: clientDiagnostic.flaggedPhrases || diagnosticHints.flaggedPhrases,
      sectionReviews: clientDiagnostic.sectionReviews,
    });
  }

  const extracted = req.body?.extracted as ExtractedCvData | undefined;

  const document = buildGeneratedCv({
    profile,
    diagnostic: diagnosticHints,
    structure,
    extracted,
  });

  const version = (previous?.version || 0) + 1;
  const title = `${profile.name} · ${document.headline} CV (${document.structureLabel})`;

  const [saved] = await db
    .insert(generatedCvsTable)
    .values({
      profileId,
      diagnosticId: diagnosticRow?.id,
      structure: document.structure,
      title,
      contentJson: JSON.stringify(document),
      version,
    })
    .returning();

  req.log.info(
    { profileId, cvId: saved.id, structure: document.structure, version },
    "CV generated",
  );

  res.status(201).json({
    id: saved.id,
    version: saved.version,
    structure: document.structure,
    title: saved.title,
    createdAt: saved.createdAt.toISOString(),
    document,
    cv_content: {
      personal: {
        fullName: document.fullName,
        headline: document.headline,
        email: document.email,
        phone: document.phone,
        location: document.location,
      },
      summary: document.summary,
      experiences: document.experiences,
      education: document.education,
      skills: document.skills,
    },
    ai_feedback: document.aiFeedback,
    message: regenerate
      ? `New CV ready using the ${document.structureLabel} structure.`
      : "Your improved CV is ready.",
  });
});

router.get("/career/cv/latest", requireUser, async (req: AuthedUserRequest, res) => {
  const profileId = req.userProfile!.id;
  const [row] = await db
    .select()
    .from(generatedCvsTable)
    .where(eq(generatedCvsTable.profileId, profileId))
    .orderBy(desc(generatedCvsTable.createdAt))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "No generated CV yet" });
    return;
  }
  let document;
  try {
    document = JSON.parse(row.contentJson);
  } catch {
    document = null;
  }
  res.json({
    id: row.id,
    version: row.version,
    structure: row.structure,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    document,
  });
});

router.get("/career/cv/structures", (_req, res) => {
  const coreTemplates = [
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
  const structures = coreTemplates.map((key) => ({
    id: key,
    ...STRUCTURE_META[key as CvStructure],
  }));
  res.json({ structures });
});

router.post("/career/cv/parse-upload", requireUser, async (req, res) => {
  try {
    const fileName = req.body?.fileName ? String(req.body.fileName) : undefined;
    const fileData = req.body?.fileData ? String(req.body.fileData) : undefined;
    const pastedText = req.body?.text ? String(req.body.text) : undefined;

    req.log.info({ fileName, hasFileData: !!fileData, hasPastedText: !!pastedText }, "CV parse-upload request received");

    let text = "";
    try {
      const extractedDoc = await extractTextFromUpload({
        text: pastedText,
        fileName,
        fileData,
      });
      text = extractedDoc.text;
      req.log.info({ 
        fileName, 
        textLength: text.length, 
        kind: extractedDoc.kind 
      }, "CV text extraction successful");
    } catch (extractErr) {
      const message =
        extractErr instanceof DocumentExtractionError
          ? extractErr.message
          : "Failed to read the uploaded document. Please upload a text-based PDF, Word (.docx), or .txt file.";
      req.log.warn({ err: extractErr, fileName }, "CV document text extraction failed");
      res.status(400).json({ error: message });
      return;
    }

    if (!text || text.trim().length < 10) {
      req.log.warn({ fileName, textLength: text?.length || 0 }, "Extracted text too short");
      res.status(400).json({
        error:
          "No readable CV text was found. Scanned/image-only PDFs are not supported — upload a text PDF, Word (.docx), or paste the CV text.",
      });
      return;
    }

    const extracted = extractCvDataFromText(text, fileName);
    req.log.info({ 
      fileName, 
      experienceCount: extracted.experiences?.length || 0,
      educationCount: extracted.education?.length || 0,
      skillsCount: extracted.skills?.length || 0
    }, "CV data extraction successful");
    res.json(extracted);
  } catch (err) {
    req.log.error({ err }, "Error in /career/cv/parse-upload");
    res.status(500).json({ error: "Failed to parse CV document" });
  }
});

router.post("/career/cv/ats-check", (req, res) => {
  const cvDocument = req.body?.cvDocument as GeneratedCvDocument;
  const jobDescription = req.body?.jobDescription ? String(req.body.jobDescription) : undefined;
  if (!cvDocument || !cvDocument.summary) {
    res.status(400).json({ error: "cvDocument is required" });
    return;
  }
  const report = evaluateAts(cvDocument, jobDescription);
  res.json(report);
});

router.post("/career/cv/quality-score", (req, res) => {
  const cvDocument = req.body?.cvDocument as GeneratedCvDocument;
  const jobDescription = req.body?.jobDescription ? String(req.body.jobDescription) : undefined;
  if (!cvDocument || !cvDocument.summary) {
    res.status(400).json({ error: "cvDocument is required" });
    return;
  }
  const report = evaluateQualityScore(cvDocument, jobDescription);
  res.json(report);
});

router.post("/career/cv/recruiter-view", (req, res) => {
  const cvDocument = req.body?.cvDocument as GeneratedCvDocument;
  if (!cvDocument) {
    res.status(400).json({ error: "cvDocument is required" });
    return;
  }
  const report = generateRecruiterView(cvDocument);
  res.json(report);
});

router.post("/career/cv/humanize", (req, res) => {
  const text = String(req.body?.text || "").trim();
  const tone = (req.body?.tone || "professional") as HumanizeTone;
  const role = req.body?.role ? String(req.body.role) : undefined;
  const name = req.body?.name ? String(req.body.name) : undefined;
  if (!text) {
    res.status(400).json({ error: "Text is required to humanize" });
    return;
  }
  const result = humanizeContent(text, tone, { role, name });
  res.json(result);
});

router.post("/career/cv/enhance-bullet", (req, res) => {
  const bullet = String(req.body?.bullet || "").trim();
  const role = req.body?.role ? String(req.body.role) : undefined;
  if (!bullet) {
    res.status(400).json({ error: "bullet text is required" });
    return;
  }
  const result = improveBulletPoint(bullet, role);
  res.json(result);
});

router.post("/career/cv/improve", (req, res) => {
  const cvDocument = req.body?.cvDocument as GeneratedCvDocument;
  const scope = (req.body?.scope || "entire") as ImproveCvScope;
  const targetJob = req.body?.targetJob ? String(req.body.targetJob).trim() : undefined;
  if (!cvDocument) {
    res.status(400).json({ error: "cvDocument is required" });
    return;
  }
  const allowed: ImproveCvScope[] = ["entire", "summary", "experience", "skills", "education", "other"];
  if (!allowed.includes(scope)) {
    res.status(400).json({ error: "Invalid improve scope" });
    return;
  }
  const result = improveCvContent(cvDocument, { scope, targetJob });
  res.json(result);
});

router.post("/career/cv/tailor", (req, res) => {
  const cvDocument = req.body?.cvDocument as GeneratedCvDocument;
  const jobDescription = String(req.body?.jobDescription || "").trim();
  if (!cvDocument || !jobDescription) {
    res.status(400).json({ error: "cvDocument and jobDescription are required" });
    return;
  }
  const result = matchJobDescription(cvDocument, jobDescription);
  res.json(result);
});

router.post("/career/cv/advisor", (req, res) => {
  const question = String(req.body?.question || "").trim();
  const cvDocument = req.body?.cvDocument as GeneratedCvDocument;
  const targetJob = req.body?.targetJob ? String(req.body.targetJob) : undefined;
  if (!question || !cvDocument) {
    res.status(400).json({ error: "question and cvDocument are required" });
    return;
  }
  const result = answerAdvisorQuestion(question, cvDocument, targetJob);
  res.json(result);
});

router.get("/career/cv/versions", async (req, res) => {
  const profileId = Number(req.query.profileId);
  if (!Number.isFinite(profileId) || profileId <= 0) {
    res.status(400).json({ error: "profileId is required" });
    return;
  }
  const rows = await db
    .select()
    .from(generatedCvsTable)
    .where(eq(generatedCvsTable.profileId, profileId))
    .orderBy(desc(generatedCvsTable.createdAt));

  res.json({
    versions: rows.map((r) => {
      let doc: GeneratedCvDocument | null = null;
      try {
        doc = JSON.parse(r.contentJson);
      } catch {}
      return {
        id: r.id,
        version: r.version,
        structure: r.structure,
        title: r.title,
        createdAt: r.createdAt.toISOString(),
        document: doc,
      };
    }),
  });
});

router.post("/career/cv/save", async (req, res) => {
  const document = req.body?.document as GeneratedCvDocument;
  const customTitle = req.body?.title ? String(req.body.title).trim() : undefined;
  if (!document) {
    res.status(400).json({ error: "profileId and document are required" });
    return;
  }
  const profile = await resolveOrUpsertCvProfile(req.body);
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  const profileId = profile.id;

  const [previous] = await db
    .select()
    .from(generatedCvsTable)
    .where(eq(generatedCvsTable.profileId, profileId))
    .orderBy(desc(generatedCvsTable.createdAt))
    .limit(1);

  const version = (previous?.version || 0) + 1;
  const title =
    customTitle ||
    document.versionName ||
    `${profile.name} · ${document.headline || "Professional"} CV (${document.structureLabel || "BonList Standard"})`;

  const [saved] = await db
    .insert(generatedCvsTable)
    .values({
      profileId,
      structure: document.structure || "professional",
      title,
      contentJson: JSON.stringify(document),
      version,
    })
    .returning();

  res.status(201).json({
    id: saved.id,
    version: saved.version,
    structure: saved.structure,
    title: saved.title,
    createdAt: saved.createdAt.toISOString(),
    document,
    message: "CV saved successfully to BonList cloud.",
  });
});

// ---------------------------------------------------------------------------
// SECTION 26 & 27: Evidence Traceability Endpoint
// ---------------------------------------------------------------------------
router.post("/career/cv/evidence-trace", (req, res) => {
  const cvDocument = req.body?.cvDocument as GeneratedCvDocument;
  const sourceText = req.body?.sourceText ? String(req.body.sourceText) : undefined;
  if (!cvDocument) {
    res.status(400).json({ error: "cvDocument is required" });
    return;
  }
  const report = traceCvEvidence(cvDocument, sourceText);
  res.json(report);
});

// ---------------------------------------------------------------------------
// SECTION 28: AI Self-Review Engine (7 Quality Gates) Endpoint
// ---------------------------------------------------------------------------
router.post("/career/cv/self-review", (req, res) => {
  const content = String(req.body?.content || "").trim();
  const role = req.body?.role ? String(req.body.role) : undefined;
  const candidateSourceText = req.body?.candidateSourceText ? String(req.body.candidateSourceText) : undefined;
  const section = req.body?.section ? String(req.body.section) : undefined;
  if (!content) {
    res.status(400).json({ error: "content string is required" });
    return;
  }
  const result = runAiSelfReview(content, { role, candidateSourceText, section });
  res.json(result);
});

// ---------------------------------------------------------------------------
// SECTION 30: Career Positioning Engine Endpoint
// ---------------------------------------------------------------------------
router.post("/career/cv/positioning", (req, res) => {
  const cvDocument = req.body?.cvDocument as GeneratedCvDocument;
  const targetJob = req.body?.targetJob ? String(req.body.targetJob) : undefined;
  if (!cvDocument) {
    res.status(400).json({ error: "cvDocument is required" });
    return;
  }
  const report = analyzeCareerPositioning(cvDocument, targetJob);
  res.json(report);
});

// ---------------------------------------------------------------------------
// SECTION 31 & 32: Advanced Job Match (6-Tier Taxonomy) & Keyword Intelligence
// ---------------------------------------------------------------------------
router.post("/career/cv/match-advanced", (req, res) => {
  const cvDocument = req.body?.cvDocument as GeneratedCvDocument;
  const jobDescription = String(req.body?.jobDescription || "").trim();
  if (!cvDocument || !jobDescription) {
    res.status(400).json({ error: "cvDocument and jobDescription are required" });
    return;
  }
  const report = matchJobDescriptionAdvanced(cvDocument, jobDescription);
  res.json(report);
});

// ---------------------------------------------------------------------------
// SECTION 33: Transferable Skills Engine Endpoint
// ---------------------------------------------------------------------------
router.post("/career/cv/transferable-skills", (req, res) => {
  const cvDocument = req.body?.cvDocument as GeneratedCvDocument;
  const targetRoleOrIndustry = req.body?.targetRoleOrIndustry ? String(req.body.targetRoleOrIndustry) : undefined;
  if (!cvDocument) {
    res.status(400).json({ error: "cvDocument is required" });
    return;
  }
  const report = discoverTransferableSkills(cvDocument, targetRoleOrIndustry);
  res.json(report);
});

// ---------------------------------------------------------------------------
// SECTION 34: Achievement Discovery Engine Endpoints
// ---------------------------------------------------------------------------
router.post("/career/cv/achievement-discovery", (req, res) => {
  const cvDocument = req.body?.cvDocument as GeneratedCvDocument;
  if (!cvDocument) {
    res.status(400).json({ error: "cvDocument is required" });
    return;
  }
  const questions = generateAchievementDiscoveryQuestions(cvDocument);
  res.json({ questions });
});

router.post("/career/cv/achievement-incorporate", (req, res) => {
  const originalBullet = String(req.body?.originalBullet || "").trim();
  const candidateAnswer = String(req.body?.candidateAnswer || "").trim();
  const category = (req.body?.category || "volume") as "volume" | "speed" | "quality" | "tools" | "sla";
  if (!originalBullet || !candidateAnswer) {
    res.status(400).json({ error: "originalBullet and candidateAnswer are required" });
    return;
  }
  const result = incorporateDiscoveredAchievement(originalBullet, candidateAnswer, category);
  res.json(result);
});

// ---------------------------------------------------------------------------
// SECTION 37: Pre-Flight CV Quality Control Endpoint
// ---------------------------------------------------------------------------
router.post("/career/cv/pre-flight-audit", (req, res) => {
  const cvDocument = req.body?.cvDocument as GeneratedCvDocument;
  if (!cvDocument) {
    res.status(400).json({ error: "cvDocument is required" });
    return;
  }
  const report = runPreFlightQualityControl(cvDocument);
  res.json(report);
});

// ---------------------------------------------------------------------------
// SECTION 41: Candidate-Approved Application Outcomes Tracking
// ---------------------------------------------------------------------------
router.post("/career/cv/outcomes", async (req, res) => {
  const profileId = Number(req.body?.profileId);
  const roleTitle = String(req.body?.roleTitle || "").trim();
  const company = String(req.body?.company || "").trim();
  const status = String(req.body?.status || "applied");
  const interviewCount = Number(req.body?.interviewCount) || 0;
  const cvStructure = req.body?.cvStructure ? String(req.body.cvStructure) : undefined;
  const notes = req.body?.notes ? String(req.body.notes) : undefined;
  const consentedToAnalytics = req.body?.consentedToAnalytics !== false;

  if (!Number.isFinite(profileId) || profileId <= 0 || !roleTitle || !company) {
    res.status(400).json({ error: "profileId, roleTitle, and company are required" });
    return;
  }

  const [created] = await db
    .insert(applicationOutcomesTable)
    .values({
      profileId,
      roleTitle,
      company,
      status,
      interviewCount,
      cvStructure,
      notes,
      consentedToAnalytics,
    })
    .returning();

  res.status(201).json({
    id: created.id,
    outcome: created,
    message: "Application outcome recorded. This empirical data helps improve future CV recommendations.",
  });
});

router.get("/career/cv/outcomes", async (req, res) => {
  const profileId = Number(req.query.profileId);
  if (!Number.isFinite(profileId) || profileId <= 0) {
    res.status(400).json({ error: "profileId is required" });
    return;
  }

  const outcomes = await db
    .select()
    .from(applicationOutcomesTable)
    .where(eq(applicationOutcomesTable.profileId, profileId))
    .orderBy(desc(applicationOutcomesTable.createdAt));

  res.json({ outcomes });
});

router.get("/career/android-apk", (_req, res) => {
  const filePath = resolveBonlistApkPath();
  if (!filePath) {
    res.status(404).json({
      error:
        "BonList Android APK is not available yet. Build it with pnpm mobile:sync and Android Studio, or run the GitHub Action “Build BonList Android APK”.",
    });
    return;
  }
  streamBonlistApk(res, filePath);
});

router.head("/career/android-apk", (_req, res) => {
  const filePath = resolveBonlistApkPath();
  if (!filePath) {
    res.status(404).end();
    return;
  }
  const size = statSync(filePath).size;
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", 'attachment; filename="BonList.apk"');
  res.setHeader("Content-Length", String(size));
  res.status(200).end();
});

export default router;
