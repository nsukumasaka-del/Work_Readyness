/**
 * Cloudflare-native career endpoints.
 *
 * The browser extracts PDF/DOCX text before sending it here. That keeps the
 * Worker small and avoids Node-only PDF parsers, while D1 owns the profile and
 * review records instead of depending on the legacy Render API.
 */
import {
  getAuthenticatedUser,
  type D1Env,
  type UserRow,
} from "./auth";
import { searchTrustedJobBoards } from "../../artifacts/api-server/src/lib/job-board-search";

type CareerProfileRow = {
  id: number;
  user_id: string;
  email: string;
  name: string;
  phone: string | null;
  location: string | null;
  target_role: string | null;
  created_at: string;
};

type ExtractedCv = {
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
  experiences: Array<{
    id: string;
    role: string;
    company: string;
    location?: string;
    startDate: string;
    endDate: string;
    bullets: string[];
    classification: "VERIFIED";
  }>;
  education: Array<{
    id: string;
    degree: string;
    institution: string;
    graduationYear: string;
    classification: "VERIFIED";
  }>;
  skills: string[];
  toolsAndSoftware: string[];
  certifications: Array<{ id: string; name: string; issuer: string; year?: string }>;
  languages: string[];
  projects: Array<{ id: string; title: string; subtitle?: string; bullets: string[] }>;
  references: string[];
  verificationBreakdown: {
    personal: { verified: boolean; missingFields: string[] };
    experience: { count: number; verifiedDates: boolean; verifiedCompanies: boolean };
    education: { count: number; verified: boolean };
    skills: { count: number };
  };
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function error(status: number, message: string): Response {
  return json({ error: message }, status);
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\u0000/g, "").trim();
}

/**
 * Best-effort extraction for the small class of uncompressed PDFs that can
 * reach the Worker when browser PDF.js cannot load the file. Normal PDFs are
 * still extracted in the browser; compressed/image-only PDFs need a text
 * export or pasted text because Workers do not provide OCR.
 */
function extractSimplePdfText(fileData: string): string {
  const encoded = fileData.includes(",") ? fileData.slice(fileData.indexOf(",") + 1) : fileData;
  try {
    const binary = atob(encoded);
    const blocks = binary.match(/BT[\s\S]*?ET/g) || [];
    const parts: string[] = [];
    for (const block of blocks) {
      const strings = block.match(/\((?:\\.|[^\\)])*\)\s*T[jJ]|<([0-9a-f]+)>\s*T[jJ]/gi) || [];
      for (const token of strings) {
        const hex = token.match(/<([0-9a-f]+)>/i)?.[1];
        if (hex) {
          let decoded = "";
          for (let i = 0; i + 1 < hex.length; i += 2) decoded += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
          parts.push(decoded);
          continue;
        }
        const value = token.slice(1, token.indexOf(")", 1));
        parts.push(
          value
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t")
            .replace(/\\([\\()])/g, "$1"),
        );
      }
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function profileResponse(profile: CareerProfileRow, profileCount: number) {
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    ...(profile.phone ? { phone: profile.phone } : {}),
    ...(profile.location ? { location: profile.location } : {}),
    ...(profile.target_role ? { targetRole: profile.target_role } : {}),
    createdAt: profile.created_at,
    profileCount,
  };
}

async function currentProfile(
  env: D1Env,
  user: UserRow,
): Promise<CareerProfileRow | null> {
  return (
    (await env.DB.prepare(
      `SELECT id, user_id, email, name, phone, location, target_role, created_at
       FROM career_profiles WHERE user_id = ? LIMIT 1`,
    )
      .bind(user.id)
      .first<CareerProfileRow>()) || null
  );
}

async function saveProfile(
  request: Request,
  env: D1Env,
  user: UserRow,
  partial: Record<string, unknown>,
): Promise<Response> {
  const existing = await currentProfile(env, user);
  const name = clean(partial.name) || existing?.name || user.name || "Professional Candidate";
  const email = (clean(partial.email) || existing?.email || user.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return error(400, "Please enter a valid email address.");
  }
  const phone = clean(partial.phone) || existing?.phone || null;
  const location = clean(partial.location) || existing?.location || null;
  const targetRole = clean(partial.targetRole) || existing?.target_role || null;

  if (existing) {
    await env.DB.prepare(
      `UPDATE career_profiles
       SET email = ?, name = ?, phone = ?, location = ?, target_role = ?
       WHERE user_id = ?`,
    )
      .bind(email, name, phone, location, targetRole, user.id)
      .run();
  } else {
    await env.DB.prepare(
      `INSERT INTO career_profiles
       (user_id, email, name, phone, location, target_role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
      .bind(user.id, email, name, phone, location, targetRole)
      .run();
  }

  const profile = await currentProfile(env, user);
  if (!profile) return error(500, "Could not save your BonList profile.");
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM career_profiles").first<{ count: number }>();
  return json(profileResponse(profile, Number(countRow?.count || 0)), 201);
}

type CvSectionKey = "summary" | "impact" | "experience" | "education" | "skills" | "systems" | "certifications" | "projects" | "languages" | "references";

type ParsedLine = { text: string; bullet: boolean };

function normalisePdfLine(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .trim();
}

function parsedLines(value: string): ParsedLine[] {
  return value
    .split(/\r?\n/)
    .map((raw) => {
      const trimmed = raw.trim();
      const bullet = /^[•▪●◦◆◇►▶*\-]|^\uFFFD\s+/.test(trimmed);
      return {
        bullet,
        text: normalisePdfLine(trimmed.replace(/^[•▪●◦◆◇►▶*\-\uFFFD]+\s*/, "")),
      };
    })
    .filter((line) => Boolean(line.text));
}

function sectionKey(line: string): CvSectionKey | null {
  const heading = normalisePdfLine(line).replace(/[:\-]+$/, "").toLowerCase();
  if (/^(professional|executive) summary$|^summary$|^profile$|^career objective$/.test(heading)) return "summary";
  if (/^key (impact|achievements|highlights)(?: at .+)?$|^career highlights$/.test(heading)) return "impact";
  if (/^(work|professional|relevant) experience$|^employment history$|^career history$|^previous employment$/.test(heading)) return "experience";
  if (/^education(?: and qualifications)?$|^qualifications$|^academic (history|background)$/.test(heading)) return "education";
  if (/^(professional|technical|key) skills$|^skills$|^core competencies$/.test(heading)) return "skills";
  if (/^systems$|^tools(?: and| &) technologies$|^tools(?: and| &) software$/.test(heading)) return "systems";
  if (/^(professional )?certifications(?: and licences)?$|^licenses and certifications$/.test(heading)) return "certifications";
  if (/^(key|notable|selected) projects$|^projects$/.test(heading)) return "projects";
  if (/^languages$|^language skills$/.test(heading)) return "languages";
  if (/^references$|^referees$/.test(heading)) return "references";
  return null;
}

function splitCvSections(text: string): { preamble: string[]; sections: Partial<Record<CvSectionKey, string[]>>; headings: Partial<Record<CvSectionKey, string>> } {
  const preamble: string[] = [];
  const sections: Partial<Record<CvSectionKey, string[]>> = {};
  const headings: Partial<Record<CvSectionKey, string>> = {};
  let current: CvSectionKey | null = null;

  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = normalisePdfLine(raw);
    if (!line) continue;
    const next = sectionKey(line);
    if (next) {
      current = next;
      headings[next] ||= line;
      sections[next] ||= [];
      continue;
    }
    if (current) sections[current]!.push(raw.trim());
    else preamble.push(raw.trim());
  }
  return { preamble, sections, headings };
}

const MONTH_DATE_SOURCE = "(?:\\d{1,2}\\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+(?:19|20)\\d{2}";
const DATE_TOKEN_RE = new RegExp(`${MONTH_DATE_SOURCE}|(?:19|20)\\d{2}|Present|Current|In progress`, "gi");

function datesIn(line: string): string[] {
  return Array.from(line.matchAll(new RegExp(DATE_TOKEN_RE.source, "gi")), (match) => normalisePdfLine(match[0]));
}

function withoutDates(line: string): string {
  const firstDate = line.search(new RegExp(DATE_TOKEN_RE.source, "i"));
  return normalisePdfLine((firstDate >= 0 ? line.slice(0, firstDate) : line).replace(/[|·\uFFFD\-\s]+$/, ""));
}

function joinWrappedLines(value: string): string {
  return parsedLines(value).map((line) => line.text).join(" ").replace(/\s+/g, " ").trim();
}

function parseExperience(value: string): ExtractedCv["experiences"] {
  const source = parsedLines(value);
  const entries: ExtractedCv["experiences"] = [];
  let index = 0;
  while (index < source.length) {
    const line = source[index];
    const dates = datesIn(line.text);
    const role = !line.bullet && dates.length ? withoutDates(line.text) : "";
    if (!role) {
      index += 1;
      continue;
    }

    index += 1;
    let company = "";
    if (index < source.length && !source[index].bullet && datesIn(source[index].text).length === 0) {
      company = source[index].text;
      index += 1;
    }
    const bullets: string[] = [];
    while (index < source.length) {
      const next = source[index];
      if (!next.bullet && datesIn(next.text).length && withoutDates(next.text)) break;
      if (next.bullet || bullets.length === 0) bullets.push(next.text);
      else bullets[bullets.length - 1] = `${bullets[bullets.length - 1]} ${next.text}`.replace(/\s+/g, " ");
      index += 1;
    }
    const companyParts = company.split(/\s+[·•|\uFFFD]\s+/).map(normalisePdfLine).filter(Boolean);
    entries.push({
      id: `exp-${entries.length + 1}`,
      role,
      company: companyParts[0] || company || "Employer not specified",
      ...(companyParts.length > 1 ? { location: companyParts.slice(1).join(", ") } : {}),
      startDate: dates.length > 1 ? dates[0] : "Not specified",
      endDate: dates.length > 1 ? dates[dates.length - 1] : dates[0] || "Not specified",
      bullets: bullets.filter(Boolean),
      classification: "VERIFIED",
    });
  }
  return entries;
}

function parseEducation(value: string): ExtractedCv["education"] {
  const source = parsedLines(value);
  const entries: ExtractedCv["education"] = [];
  let index = 0;
  while (index < source.length) {
    const line = source[index];
    const dates = datesIn(line.text);
    const degree = dates.length ? withoutDates(line.text) : "";
    if (!degree) {
      index += 1;
      continue;
    }
    const institution = source[index + 1] && datesIn(source[index + 1].text).length === 0
      ? source[index + 1].text
      : "Institution not specified";
    index += institution === "Institution not specified" ? 1 : 2;
    const details: string[] = [];
    while (index < source.length && datesIn(source[index].text).length === 0) {
      details.push(source[index].text);
      index += 1;
    }
    entries.push({
      id: `edu-${entries.length + 1}`,
      degree: details.length ? `${degree} (${details.join(" ")})` : degree,
      institution,
      graduationYear: dates.join(" - ") || "Not specified",
      classification: "VERIFIED",
    });
  }
  return entries;
}

function listItems(value: string): string[] {
  return parsedLines(value)
    .flatMap((line) => line.text.split(/\s*[;|]\s*/))
    .map(normalisePdfLine)
    .filter((item) => item.length > 1);
}

function groupedBulletItems(value: string): string[] {
  const result: string[] = [];
  for (const line of parsedLines(value)) {
    if (line.bullet || result.length === 0) result.push(line.text);
    else result[result.length - 1] = `${result[result.length - 1]} ${line.text}`.replace(/\s+/g, " ");
  }
  return result.filter(Boolean);
}

export function parseCvText(rawText: string, fileName: string): ExtractedCv {
  const text = rawText.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  const { preamble, sections, headings } = splitCvSections(text);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || "";
  const phone = text.match(/(?:\+27|0)\s*(?:\d[\s-]*){9,10}/)?.[0]?.replace(/\s+/g, " ").trim();
  const linkedin = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0];
  const url = text.match(/https?:\/\/(?!www\.linkedin\.com)[^\s)]+/i)?.[0];
  const headerLines = preamble.map(normalisePdfLine).filter(Boolean);
  const filenameName = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/\b(?:curriculum vitae|resume|cv|main|updated|latest|copy)\b/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const nameCandidates = headerLines.filter((line) => {
    const words = line.split(/\s+/);
    return line.length >= 3 && line.length <= 70 && words.length >= 2 && words.length <= 6 &&
      !/[.:@/|\d]/.test(line) && !/\b(cv|resume|curriculum vitae)\b/i.test(line) &&
      !/\b(manager|developer|designer|analyst|assistant|officer|specialist|consultant|engineer|administrator|controller|representative|customer service)\b/i.test(line);
  });
  const fullName = nameCandidates.find((line) => line === line.toUpperCase()) || nameCandidates[0] || filenameName || "Candidate";
  const title = headerLines.find((line) => line !== fullName && /\b(manager|developer|designer|analyst|assistant|officer|specialist|consultant|engineer|administrator|controller|representative|customer service|broker)\b/i.test(line)) || "Professional";
  const contactLine = headerLines.find((line) => line.includes(email) || (phone && line.includes(phone))) || "";
  const location = email && contactLine.includes(email)
    ? normalisePdfLine(contactLine.slice(contactLine.indexOf(email) + email.length).replace(/^[\s|•·\uFFFD-]+/, ""))
    : "";
  const summary = joinWrappedLines((sections.summary || []).join("\n"));
  const experienceText = (sections.experience || []).join("\n");
  const educationText = (sections.education || []).join("\n");
  const skills = listItems((sections.skills || []).join("\n")).filter((item) => item.length < 80).slice(0, 50);
  const toolsAndSoftware = listItems((sections.systems || []).join("\n")).filter((item) => item.length < 80).slice(0, 30);
  const experiences = parseExperience(experienceText);
  const education = parseEducation(educationText);
  const certifications = listItems((sections.certifications || []).join("\n")).slice(0, 20).map((item, index) => ({
    id: `cert-${index + 1}`,
    name: item,
    issuer: "",
  }));
  const languages = parsedLines((sections.languages || []).join("\n")).map((line) => line.text).slice(0, 20);
  const references = parsedLines((sections.references || []).join("\n")).map((line) => line.text).slice(0, 20);
  const projects = [
    ...(sections.impact?.length ? [{
      id: "project-impact-1",
      title: headings.impact || "Key Achievements",
      bullets: groupedBulletItems(sections.impact.join("\n")),
    }] : []),
    ...(sections.projects?.length ? [{
      id: "project-1",
      title: headings.projects || "Projects",
      bullets: groupedBulletItems(sections.projects.join("\n")),
    }] : []),
  ];
  const personal = {
    fullName,
    email,
    ...(phone ? { phone } : {}),
    ...(location ? { location } : {}),
    ...(linkedin ? { linkedin } : {}),
    ...(url ? { website: url } : {}),
    professionalTitle: title,
  };
  return {
    personal,
    summary,
    experiences,
    education,
    skills,
    toolsAndSoftware,
    certifications,
    languages,
    projects,
    references,
    verificationBreakdown: {
      personal: {
        verified: Boolean(fullName && (email || phone)),
        missingFields: [!email ? "email" : "", !phone ? "phone" : ""].filter(Boolean),
      },
      experience: { count: experiences.length, verifiedDates: false, verifiedCompanies: false },
      education: { count: education.length, verified: education.length > 0 },
      skills: { count: skills.length },
    },
  };
}

function cvContent(data: ExtractedCv) {
  return {
    cv_content: data,
    ...data,
    ai_feedback: {
      internalTips: [],
      missingKeywords: [],
      jobBoardAdvice: ["Use the exact role title and keywords from the job description."],
      flaggedPhrases: [],
      strengths: data.skills.length ? [{ title: "Skills detected", detail: `${data.skills.length} skills were found in the submitted CV.` }] : [],
      improvements: data.experiences.length ? [] : [{ title: "Add employment evidence", detail: "Add clearly labelled roles, employers, dates, and achievement bullets." }],
    },
  };
}

function buildReport(fileName: string, role: string, location: string, data: ExtractedCv | null, id: number) {
  const hasText = Boolean(data);
  const hasExperience = Boolean(data?.experiences.length);
  const hasEducation = Boolean(data?.education.length);
  const hasSkills = Boolean(data?.skills.length);
  const ats = Math.min(96, 50 + (hasText ? 15 : 0) + (hasExperience ? 12 : 0) + (hasEducation ? 8 : 0) + (hasSkills ? 10 : 0));
  const authenticity = hasText ? 88 : 72;
  const overall = Math.round((ats + authenticity) / 2);
  return {
    id,
    fileName,
    targetRole: role || data?.personal.professionalTitle || "Professional",
    summary: hasText
      ? `Your CV has a readable structure for ${role || data?.personal.professionalTitle || "professional"} roles in ${location || "South Africa"}. Strengthen the evidence and keywords below before applying.`
      : "Your profile was saved. Add CV text to receive section-level feedback.",
    overallScore: overall,
    authenticityScore: authenticity,
    atsScore: ats,
    scores: { clarity: overall, impact: hasExperience ? 72 : 52, structure: hasText ? 82 : 55, keywordFit: hasSkills ? 74 : 54, authenticity, ats },
    strengths: [
      ...(hasText ? [{ title: "Document is readable", detail: "The CV text was extracted successfully and can be reviewed." }] : []),
      ...(hasSkills ? [{ title: "Skills are visible", detail: "Your skills section gives recruiters a starting point for matching." }] : []),
    ],
    improvements: [
      ...(!hasExperience ? [{ title: "Add clear experience history", detail: "Use role, company, dates, and outcome-focused bullets for each position.", priority: "high" }] : []),
      ...(!hasSkills ? [{ title: "Add role-specific skills", detail: "Include the tools and competencies used in your target roles.", priority: "high" }] : []),
      { title: "Quantify outcomes", detail: "Add numbers, volume, speed, quality, or scope where the source CV supports them.", priority: "medium" },
    ],
    sectionReviews: [
      { section: "Structure & Formatting", score: hasText ? 82 : 55, status: hasText ? "Strong" : "Needs improvement", findings: [hasText ? "Readable text was extracted." : "No CV text was supplied."] },
      { section: "Experience & Impact", score: hasExperience ? 72 : 52, status: hasExperience ? "Solid" : "Needs improvement", findings: [hasExperience ? "Experience content was found." : "Add labelled experience and achievement bullets."] },
      { section: "Education", score: hasEducation ? 78 : 58, status: hasEducation ? "Solid" : "Needs improvement", findings: [hasEducation ? "Education content was found." : "Add education and qualifications if relevant."] },
      { section: "Skills & Keywords", score: hasSkills ? 74 : 54, status: hasSkills ? "Solid" : "Needs improvement", findings: [hasSkills ? "Skills were detected." : "Add a skills section matched to the target role."] },
    ],
    flaggedPhrases: [],
    missingKeywords: [],
    rewriteExamples: [],
    prompts: ["Which achievement can you quantify for your target role?"],
    relatedJobs: [],
    jobSearch: { query: `${role || "Professional"} in ${location || "South Africa"}`, queriedBoards: [], liveResults: false },
  };
}

function buildGeneratedDocument(profile: CareerProfileRow, extracted: Partial<ExtractedCv> | undefined, structure: string) {
  const personal = (extracted?.personal || {}) as Partial<ExtractedCv["personal"]>;
  const experiences = extracted?.experiences || [];
  const education = extracted?.education || [];
  const skills = extracted?.skills || [];
  const toolsAndSoftware = extracted?.toolsAndSoftware || [];
  const fullName = clean(personal.fullName) || profile.name;
  const headline = clean(personal.professionalTitle) || profile.target_role || "Professional";
  const email = clean(personal.email) || profile.email;
  const phone = clean(personal.phone) || profile.phone || "";
  const location = clean(personal.location) || profile.location || "South Africa";
  const summary = clean(extracted?.summary);
  const structureLabel = structure || "BonList Standard";
  return {
    structure: structure || "professional",
    structureLabel,
    structureDescription: "ATS-friendly single-column CV",
    templateType: "single_column",
    fullName,
    headline,
    contactLine: [email, phone, location, personal.linkedin, personal.website].filter(Boolean).join(" · "),
    email,
    phone,
    location,
    linkedin: personal.linkedin,
    website: personal.website,
    summary,
    experiences,
    education,
    skillGroups: [
      ...(skills.length ? [{ category: "Core Competencies", skills }] : []),
      ...(toolsAndSoftware.length ? [{ category: "Systems", skills: toolsAndSoftware }] : []),
    ],
    skills,
    toolsAndSoftware,
    projects: extracted?.projects || [],
    certifications: extracted?.certifications || [],
    languages: extracted?.languages || [],
    references: extracted?.references || [],
    sections: summary ? [{ heading: "Professional Summary", items: [summary] }] : [],
    keywords: [],
    footerNote: "",
    authenticityScore: 100,
    aiFeedback: { internalTips: [], missingKeywords: [], jobBoardAdvice: [], flaggedPhrases: [], strengths: [], improvements: [] },
  };
}

async function handleProfile(request: Request, env: D1Env, user: UserRow): Promise<Response> {
  return saveProfile(request, env, user, await body(request));
}

async function handleParse(request: Request, env: D1Env, user: UserRow): Promise<Response> {
  void env;
  void user;
  const input = await body(request);
  const text = clean(input.text) || extractSimplePdfText(clean(input.fileData));
  if (!text) {
    return error(415, "Cloudflare could not read the file bytes. Re-export the CV as a text-based PDF, or use the paste-text option.");
  }
  if (text.length < 10) return error(400, "No readable CV text was found. Please paste the CV text or upload a text-based document.");
  const data = parseCvText(text, clean(input.fileName) || "CV");
  return json(cvContent(data));
}

async function handleDiagnostic(request: Request, env: D1Env, user: UserRow): Promise<Response> {
  const input = await body(request);
  const fileName = clean(input.fileName);
  if (!fileName) return error(400, "fileName is required.");
  const text = clean(input.text) || extractSimplePdfText(clean(input.fileData));
  const data = text.length >= 10 ? parseCvText(text, fileName) : null;
  const role = clean(input.role) || clean(input.targetRole);
  const location = clean(input.location);
  const inserted = await env.DB.prepare(
    "INSERT INTO cv_reports (user_id, report_json, created_at) VALUES (?, ?, datetime('now'))",
  )
    .bind(user.id, "{}")
    .run();
  const id = Number(inserted.meta.last_row_id || 0);
  const jobSearch = await searchTrustedJobBoards({
    role: role || data?.personal.professionalTitle || "Professional",
    location,
    limit: 6,
    experienceRoles: data?.experiences.map((entry) => entry.role).filter(Boolean) || [],
    expertise: data?.skills || [],
    adzunaAppId: env.ADZUNA_APP_ID,
    adzunaAppKey: env.ADZUNA_APP_KEY,
  });
  const report = {
    ...buildReport(fileName, role, location, data, id),
    relatedJobs: jobSearch.jobs,
    jobSearch: {
      query: jobSearch.query,
      queriedBoards: jobSearch.queriedBoards,
      liveResults: jobSearch.liveResults,
      boardSearchLinks: jobSearch.boardSearchLinks,
    },
  };
  await env.DB.prepare("UPDATE cv_reports SET report_json = ? WHERE id = ? AND user_id = ?")
    .bind(JSON.stringify(report), id, user.id)
    .run();
  return json(report, 201);
}

async function handleLatest(request: Request, env: D1Env, user: UserRow): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT id, report_json FROM cv_reports WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
  )
    .bind(user.id)
    .first<{ id: number; report_json: string }>();
  if (!row) return error(404, "No CV review found yet");
  try {
    return json({ ...(JSON.parse(row.report_json) as Record<string, unknown>), id: row.id });
  } catch {
    return error(500, "Saved CV review is invalid.");
  }
}

async function handleGenerate(request: Request, env: D1Env, user: UserRow): Promise<Response> {
  const input = await body(request);
  let profile = await currentProfile(env, user);
  if (!profile) {
    const saved = await saveProfile(request, env, user, input);
    if (!saved.ok) return saved;
    profile = await currentProfile(env, user);
  }
  if (!profile) return error(400, "Please complete your profile before generating a CV.");
  const rawExtracted = input.extracted && typeof input.extracted === "object"
    ? (input.extracted as Record<string, unknown>)
    : undefined;
  const nestedContent = rawExtracted?.cv_content && typeof rawExtracted.cv_content === "object"
    ? (rawExtracted.cv_content as Partial<ExtractedCv>)
    : undefined;
  const topLevelContent = rawExtracted as Partial<ExtractedCv> | undefined;
  const hasTopLevelContent = Boolean(
    topLevelContent?.personal ||
    clean(topLevelContent?.summary) ||
    (topLevelContent?.experiences?.length ?? 0) > 0 ||
    (topLevelContent?.education?.length ?? 0) > 0 ||
    (topLevelContent?.skills?.length ?? 0) > 0,
  );
  // Older and newer upload responses use different shapes. Prefer populated
  // top-level fields, while retaining nested cv_content data for missing sections.
  const extracted = hasTopLevelContent || nestedContent
    ? {
        ...(nestedContent || {}),
        ...(hasTopLevelContent ? topLevelContent : {}),
        personal: {
          ...(nestedContent?.personal || {}),
          ...(hasTopLevelContent ? topLevelContent?.personal || {} : {}),
        },
        experiences: topLevelContent?.experiences?.length
          ? topLevelContent.experiences
          : nestedContent?.experiences || [],
        education: topLevelContent?.education?.length
          ? topLevelContent.education
          : nestedContent?.education || [],
        skills: topLevelContent?.skills?.length
          ? topLevelContent.skills
          : nestedContent?.skills || [],
      }
    : undefined;
  const document = buildGeneratedDocument(profile, extracted, clean(input.structure) || "professional");
  return json({
    id: Date.now(),
    version: 1,
    structure: document.structure,
    title: `${document.fullName} · ${document.headline} CV (${document.structureLabel})`,
    createdAt: new Date().toISOString(),
    document,
    cv_content: extracted || { personal: { fullName: document.fullName, email: document.email }, summary: document.summary, experiences: document.experiences, education: document.education, skills: document.skills },
    ai_feedback: document.aiFeedback,
    message: "Your improved CV is ready.",
  }, 201);
}

async function handleSave(request: Request, env: D1Env, user: UserRow): Promise<Response> {
  const input = await body(request);
  const profile = await currentProfile(env, user);
  const document = input.document && typeof input.document === "object"
    ? (input.document as Record<string, unknown>)
    : null;
  if (!profile || !document) return error(400, "A profile and CV document are required.");
  const structure = clean(document.structure) || "professional";
  const title = clean(input.title) || `${profile.name} · ${clean(document.headline) || "Professional"} CV`;
  const inserted = await env.DB.prepare(
    `INSERT INTO generated_cvs (user_id, profile_id, structure, title, content_json, version, created_at)
     VALUES (?, ?, ?, ?, ?, COALESCE((SELECT MAX(version) + 1 FROM generated_cvs WHERE profile_id = ?), 1), datetime('now'))`,
  )
    .bind(user.id, profile.id, structure, title, JSON.stringify(document), profile.id)
    .run();
  const id = Number(inserted.meta.last_row_id || 0);
  const versionRow = await env.DB.prepare(
    "SELECT version, created_at FROM generated_cvs WHERE id = ? AND user_id = ?",
  )
    .bind(id, user.id)
    .first<{ version: number; created_at: string }>();
  return json({
    id,
    version: Number(versionRow?.version || 1),
    structure,
    title,
    createdAt: versionRow?.created_at || new Date().toISOString(),
    document,
    message: "CV saved successfully to BonList Cloud.",
  }, 201);
}

async function handleLatestCv(request: Request, env: D1Env, user: UserRow): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT id, structure, title, content_json, version, created_at
     FROM generated_cvs WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
  )
    .bind(user.id)
    .first<{ id: number; structure: string; title: string; content_json: string; version: number; created_at: string }>();
  if (!row) return error(404, "No saved CV found yet.");
  try {
    return json({
      id: row.id,
      structure: row.structure,
      title: row.title,
      version: row.version,
      createdAt: row.created_at,
      document: JSON.parse(row.content_json),
    });
  } catch {
    return error(500, "Saved CV is invalid.");
  }
}

export async function handleD1Career(request: Request, env: D1Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();
  const nativePath =
    (method === "POST" && (path === "/api/career/profile" || path === "/api/career/cv/parse-upload" || path === "/api/career/diagnostic" || path === "/api/career/cv/generate")) ||
    (method === "POST" && path === "/api/career/cv/save") ||
    (method === "PATCH" && path === "/api/career/profile") ||
    (method === "GET" && (path === "/api/career/diagnostic/latest" || path === "/api/career/cv/latest"));
  if (!nativePath) return null;
  const user = await getAuthenticatedUser(request, env);
  if (!user) return error(401, "Please sign in to continue.");
  if (path === "/api/career/profile") return handleProfile(request, env, user);
  if (path === "/api/career/cv/parse-upload") return handleParse(request, env, user);
  if (path === "/api/career/diagnostic") return handleDiagnostic(request, env, user);
  if (path === "/api/career/diagnostic/latest") return handleLatest(request, env, user);
  if (path === "/api/career/cv/save") return handleSave(request, env, user);
  if (path === "/api/career/cv/latest") return handleLatestCv(request, env, user);
  return handleGenerate(request, env, user);
}
