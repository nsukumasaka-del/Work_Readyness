import {
  auditAuthenticity,
  evaluateAts,
  evaluateQualityScore,
  type ExtractedCvData,
  type GeneratedCvDocument,
} from "../artifacts/api-server/src/lib/cv-builder";
import { searchTrustedJobBoards } from "../artifacts/api-server/src/lib/job-board-search";
import { buildCareerAlignmentReport } from "../artifacts/api-server/src/lib/career-alignment";
import { getAuthenticatedUser, type D1Env } from "./d1/auth";
import { handleCvParseUpload } from "./cv-parse";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function value(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

type DiagnosticReport = Awaited<ReturnType<typeof buildReport>>;

function reportForViewer(report: DiagnosticReport, isAdmin: boolean): DiagnosticReport {
  if (isAdmin) return report;
  return {
    ...report,
    relatedJobs: report.relatedJobs.map((job, index) => job.match < 90 ? job : {
      id: -(index + 1),
      title: "Premium job match",
      company: "",
      location: "",
      sector: "",
      salary: "",
      match: job.match,
      posted: "",
      tags: [],
      source: "",
      url: "",
      description: "",
    }),
  };
}

function analysisDocument(extracted: ExtractedCvData, role: string): GeneratedCvDocument {
  const personal = extracted.personal;
  return {
    structure: "classic",
    structureLabel: "Classic",
    structureDescription: "CV review document",
    templateType: "single_column",
    fullName: personal?.fullName || "Candidate",
    headline: personal?.professionalTitle || role,
    contactLine: [personal?.email, personal?.phone, personal?.location].filter(Boolean).join(" · "),
    email: personal?.email || "",
    phone: personal?.phone,
    location: personal?.location,
    linkedin: personal?.linkedin,
    website: personal?.website,
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

async function buildReport(extracted: ExtractedCvData, fileName: string, role: string, location: string, env: D1Env) {
  const doc = analysisDocument(extracted, role);
  const ats = evaluateAts(doc, role);
  const quality = evaluateQualityScore(doc, role);
  const authenticity = auditAuthenticity(doc, { userProvidedMetrics: true });
  const bulletCount = doc.experiences.reduce((count, experience) => count + experience.bullets.length, 0);
  const scores = {
    clarity: quality.pillars.clarity.score,
    impact: Math.round((ats.categories.quantifiedMetrics + ats.categories.actionVerbs) / 2),
    structure: quality.pillars.presentation.score,
    keywordFit: ats.categories.keywordMatch,
    authenticity: authenticity.score,
    ats: ats.overallScore,
  };
  const strengths = [
    ...(doc.summary.length >= 80 ? [{ title: "Professional summary present", detail: "Your summary gives recruiters a readable opening for your story." }] : []),
    ...(doc.experiences.length ? [{ title: "Work history detected", detail: `${doc.experiences.length} role${doc.experiences.length === 1 ? "" : "s"} parsed from your upload.` }] : []),
    ...(doc.skills.length >= 4 ? [{ title: "Skills section readable", detail: `${doc.skills.length} skills indexed for ATS and keyword matching.` }] : []),
    ...(authenticity.score >= 85 ? [{ title: "Authentic voice", detail: "Your wording shows little template filler." }] : []),
  ];
  if (!strengths.length) strengths.push({ title: "Document accepted", detail: "We could read your CV. Focus next on evidence and role keywords." });
  const improvements = [
    ...ats.recommendedFixes.slice(0, 3).map((fix) => ({ title: "ATS improvement", detail: fix, priority: "high" })),
    ...authenticity.inquiries.slice(0, 2).map((item) => ({ title: item.field, detail: item.question, priority: "medium" })),
  ];
  if (!improvements.length) improvements.push({ title: "Role language", detail: `Use ${role} keywords only where your CV can prove them.`, priority: "medium" });

  // Board search is optional: the review must still work when an external board is down.
  const search = await searchTrustedJobBoards({
    role, location, limit: 6,
    experienceRoles: doc.experiences.map((experience) => experience.role),
    expertise: doc.skills,
    languages: doc.languages,
    adzunaAppId: env.ADZUNA_APP_ID,
    adzunaAppKey: env.ADZUNA_APP_KEY,
  }).catch(() => ({
    jobs: [], queriedBoards: [], liveResults: false, query: `${role} · ${location}`,
    boardSearchLinks: [],
  }));
  const careerAdvisory = buildCareerAlignmentReport(role, location, extracted, search.jobs);
  const flaggedPhrases = authenticity.flaggedItems.map((item) => {
    const quoted = /"([^"]+)"/.exec(item.reason);
    return quoted?.[1] || item.text.slice(0, 40);
  }).filter(Boolean).slice(0, 8);
  return {
    id: 0,
    fileName,
    targetRole: role,
    summary: `We analysed your uploaded CV for ${role}. Overall readiness combines authenticity (${authenticity.score}) and ATS fit (${ats.overallScore}). Focus on stronger evidence and relevant role language${location === "South Africa" ? "" : ` for ${location}`}.${search.liveResults ? " Recent listings from trusted boards are shown below." : " Live board matches were unavailable during this review."}`,
    overallScore: Math.round(Object.values(scores).reduce((total, score) => total + score, 0) / 6),
    authenticityScore: authenticity.score,
    atsScore: ats.overallScore,
    scores,
    strengths,
    improvements,
    sectionReviews: [
      { section: "Professional summary", score: doc.summary.length >= 120 ? 82 : doc.summary.length >= 40 ? 64 : 45, status: doc.summary.length >= 80 ? "Solid" : "Needs sharpening", findings: [doc.summary.length >= 80 ? "Summary is readable." : "Add your specialisation and a supported proof point."] },
      { section: "Experience bullets", score: Math.round((ats.categories.actionVerbs + ats.categories.quantifiedMetrics) / 2), status: ats.weakBullets.length ? "Priority rewrite" : "Solid", findings: [`${bulletCount} experience bullets detected.`, `${ats.weakBullets.length} bullets could use stronger evidence or wording.`] },
      { section: "Skills & tools", score: Math.min(100, 40 + doc.skills.length * 6), status: doc.skills.length >= 5 ? "Solid" : "Expand", findings: [`${doc.skills.length} skills extracted.`, ats.missingKeywords.length ? `Consider proving: ${ats.missingKeywords.slice(0, 3).join(", ")}.` : "Keyword coverage looks reasonable."] },
      { section: "Formatting & ATS", score: ats.categories.formatCompliance, status: ats.overallScore >= 75 ? "Competitive" : "Improve parseability", findings: [`ATS grade: ${ats.grade}.`, "Keep standard section labels and selectable text."] },
    ],
    flaggedPhrases,
    missingKeywords: ats.missingKeywords.slice(0, 8),
    rewriteExamples: ats.weakBullets.slice(0, 3).map((item) => ({ before: item.bullet, after: item.suggestedImprovement || item.bullet })),
    prompts: [
      "What changed because of your work? Add a measurable result only if you can verify it.",
      "Name the audience, tools, team size, or stakeholders you worked with.",
      authenticity.inquiries[0]?.question || "Replace a general claim with a concrete example.",
      `Which keyword from a ${role} listing can your experience substantiate?`,
    ],
    relatedJobs: search.jobs,
    careerAdvisory,
    jobSearch: {
      query: search.query,
      queriedBoards: search.queriedBoards,
      liveResults: search.liveResults,
      boardSearchLinks: search.boardSearchLinks,
    },
  };
}

export async function handleCvDiagnostic(request: Request, env: D1Env): Promise<Response | null> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (path !== "/api/career/diagnostic" && path !== "/api/career/diagnostic/latest") return null;
  if (!env.DB) return json(503, { error: "The BonList database is unavailable." });
  const user = await getAuthenticatedUser(request, env.DB);

  if (path.endsWith("/latest")) {
    if (request.method !== "GET") return json(405, { error: "Method not allowed" });
    if (!user) return json(401, { error: "Sign in to retrieve a saved CV review." });
    const row = await env.DB.prepare("SELECT id, report_json FROM cv_reports WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
      .bind(user.id).first<{ id: number; report_json: string }>();
    if (!row) return json(404, { error: "No CV review found yet." });
    const report = JSON.parse(row.report_json) as DiagnosticReport;
    return json(200, { ...reportForViewer(report, user.isAdmin), id: row.id });
  }

  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 14_000_000) return json(413, { error: "The CV is too large. Please upload a file under 10MB." });
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid CV review request." });
  }
  const fileName = value(body.fileName).slice(0, 255);
  if (!fileName) return json(400, { error: "A CV file is required." });
  const parse = await handleCvParseUpload(new Request(request.url.replace("/diagnostic", "/cv/parse-upload"), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileName, text: body.text, fileData: body.fileData }),
  }));
  if (!parse.ok) return parse;
  const extracted = await parse.json() as ExtractedCvData;
  const role = value(body.role) || value(body.targetRole) || extracted.personal?.professionalTitle || "Professional";
  const location = value(body.location) || extracted.personal?.location || "South Africa";
  try {
    const report = await buildReport(extracted, fileName, role, location, env);
    if (!user) return json(200, { ...reportForViewer(report, false), message: "Preview generated. Sign in to save and retrieve your review." });
    const result = await env.DB.prepare("INSERT INTO cv_reports (user_id, report_json) VALUES (?, ?)")
      .bind(user.id, JSON.stringify(report)).run();
    return json(201, { ...reportForViewer(report, user.isAdmin), id: result.meta.last_row_id });
  } catch (error) {
    console.error("CV review failed", error);
    return json(500, { error: "Could not complete CV review. Please try again." });
  }
}
