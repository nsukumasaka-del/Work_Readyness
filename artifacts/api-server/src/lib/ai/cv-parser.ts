import { GoogleGenAI } from "@google/genai";
import {
  CV_PARSER_SYSTEM_PROMPT,
  finalizeExtractedCvData,
  type CvAdditionalSection,
  type CvCertificationItem,
  type CvEducationItem,
  type CvExperienceItem,
  type CvProjectItem,
  type ExtractedCvData,
} from "../cv-builder";
import { parseGeminiJsonObject } from "./json-output";
import { GEMINI_MODEL } from "./gemini-client";

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;

/** Gemini Structured Outputs schema. All keys are required so omissions are explicit. */
export const CV_PARSER_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "contact_information", "professional_summary", "work_experience", "education", "skills",
    "certifications", "projects", "languages", "references", "additional_sections",
  ],
  properties: {
    contact_information: {
      type: "object",
      additionalProperties: false,
      required: ["full_name", "email", "phone", "location", "linkedin_url", "portfolio_url", "professional_title"],
      properties: {
        full_name: nullableString,
        email: nullableString,
        phone: nullableString,
        location: nullableString,
        linkedin_url: nullableString,
        portfolio_url: nullableString,
        professional_title: nullableString,
      },
    },
    professional_summary: nullableString,
    work_experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["job_title", "company", "location", "start_date", "end_date", "is_current", "responsibilities"],
        properties: {
          job_title: { type: "string" },
          company: { type: "string" },
          location: nullableString,
          start_date: nullableString,
          end_date: nullableString,
          is_current: { type: "boolean" },
          responsibilities: { type: "array", items: { type: "string" } },
        },
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["degree", "institution", "location", "graduation_year", "details"],
        properties: {
          degree: { type: "string" },
          institution: { type: "string" },
          location: nullableString,
          graduation_year: nullableString,
          details: { type: "array", items: { type: "string" } },
        },
      },
    },
    skills: { type: "array", items: { type: "string" } },
    certifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "issuer", "year"],
        properties: { title: { type: "string" }, issuer: nullableString, year: nullableString },
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "technologies", "link"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          technologies: { type: "array", items: { type: "string" } },
          link: nullableString,
        },
      },
    },
    languages: { type: "array", items: { type: "string" } },
    references: { type: "array", items: { type: "string" } },
    additional_sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "content"],
        properties: {
          heading: { type: "string" },
          content: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

type GeminiCvExtraction = {
  contact_information?: Record<string, unknown>;
  professional_summary?: unknown;
  work_experience?: Array<Record<string, unknown>>;
  education?: Array<Record<string, unknown>>;
  skills?: unknown[];
  certifications?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
  languages?: unknown[];
  references?: unknown[];
  additional_sections?: Array<Record<string, unknown>>;
};

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const list = (value: unknown) => Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
const key = (value: unknown) => clean(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identity = key(value);
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function mergeRecords<T>(primary: T[], fallback: T[], identity: (item: T) => string): T[] {
  const result = [...primary];
  const seen = new Set(result.map(identity).filter(Boolean));
  for (const item of fallback) {
    const itemKey = identity(item);
    if (itemKey && seen.has(itemKey)) continue;
    result.push(item);
    if (itemKey) seen.add(itemKey);
  }
  return result;
}

function toExtractedCvData(raw: GeminiCvExtraction, fallback: ExtractedCvData): ExtractedCvData {
  const contact = raw.contact_information || {};
  const experiences: CvExperienceItem[] = (raw.work_experience || []).map((item, index) => ({
    id: `exp-ai-${index + 1}`,
    role: clean(item.job_title),
    company: clean(item.company),
    location: clean(item.location) || undefined,
    startDate: clean(item.start_date),
    endDate: clean(item.end_date),
    current: item.is_current === true,
    bullets: unique(list(item.responsibilities)),
    classification: "VERIFIED" as const,
  })).filter((item) => item.role || item.company || item.bullets.length);
  const education: CvEducationItem[] = (raw.education || []).map((item, index) => ({
    id: `edu-ai-${index + 1}`,
    degree: clean(item.degree),
    institution: clean(item.institution),
    location: clean(item.location) || undefined,
    graduationYear: clean(item.graduation_year),
    details: list(item.details).join("\n") || undefined,
    classification: "VERIFIED" as const,
  })).filter((item) => item.degree || item.institution || item.details);
  const certifications: CvCertificationItem[] = (raw.certifications || []).map((item, index) => ({
    id: `cert-ai-${index + 1}`,
    name: clean(item.title),
    issuer: clean(item.issuer),
    year: clean(item.year) || undefined,
  })).filter((item) => item.name);
  const projects: CvProjectItem[] = (raw.projects || []).map((item, index) => ({
    id: `proj-ai-${index + 1}`,
    title: clean(item.name),
    link: clean(item.link) || undefined,
    bullets: clean(item.description) ? [clean(item.description)] : [],
    technologies: unique(list(item.technologies)),
  })).filter((item) => item.title || item.bullets.length || item.technologies?.length);
  const additionalSections: CvAdditionalSection[] = (raw.additional_sections || []).map((item) => ({
    heading: clean(item.heading),
    content: unique(list(item.content)),
  })).filter((item) => item.heading && item.content.length);

  const fallbackContent = fallback.cv_content;
  const personal = {
    fullName: clean(contact.full_name) || fallback.personal.fullName,
    email: clean(contact.email) || fallback.personal.email,
    phone: clean(contact.phone) || fallback.personal.phone || "",
    location: clean(contact.location) || fallback.personal.location || "",
    linkedin: clean(contact.linkedin_url) || fallback.personal.linkedin || undefined,
    website: clean(contact.portfolio_url) || fallback.personal.website || undefined,
    professionalTitle: clean(contact.professional_title) || fallback.personal.professionalTitle || "",
  };
  const summary = clean(raw.professional_summary) || fallback.summary;
  const mergedExperiences = mergeRecords(experiences, fallback.experiences, (item) =>
    [item.role, item.company, item.startDate].map(key).filter(Boolean).join("|"));
  const mergedEducation = mergeRecords(education, fallback.education, (item) =>
    [item.degree, item.institution, item.graduationYear].map(key).filter(Boolean).join("|"));
  const mergedCertifications = mergeRecords(certifications, fallback.certifications, (item) =>
    [item.name, item.issuer, item.year].map(key).filter(Boolean).join("|"));
  const mergedProjects = mergeRecords(projects, fallback.projects, (item) =>
    [item.title, item.link].map(key).filter(Boolean).join("|"));
  const mergedAdditional = mergeRecords(additionalSections, fallback.additionalSections || fallbackContent.additionalSections || [],
    (item) => key(item.heading));
  const skills = unique([...list(raw.skills), ...fallback.skills, ...fallback.toolsAndSoftware]);
  const languages = unique([...list(raw.languages), ...fallback.languages]);
  const references = unique([...list(raw.references), ...fallback.references]);

  const cvContent = {
    personal,
    summary,
    experiences: mergedExperiences,
    education: mergedEducation,
    skills,
    toolsAndSoftware: [],
    competencies: [],
    certifications: mergedCertifications,
    languages,
    projects: mergedProjects,
    references,
    referenceDetails: fallback.referenceDetails || [],
    additionalSections: mergedAdditional,
  };
  return {
    cv_content: cvContent,
    ai_feedback: fallback.ai_feedback,
    personal,
    summary,
    experiences: mergedExperiences,
    education: mergedEducation,
    skills,
    toolsAndSoftware: [],
    competencies: [],
    certifications: mergedCertifications,
    languages,
    projects: mergedProjects,
    references,
    referenceDetails: fallback.referenceDetails || [],
    additionalSections: mergedAdditional,
    verificationBreakdown: {
      personal: { verified: Boolean(personal.fullName && (personal.email || personal.phone)), missingFields: [] },
      experience: { count: mergedExperiences.length, verifiedDates: mergedExperiences.every((item) => Boolean(item.startDate)), verifiedCompanies: mergedExperiences.every((item) => Boolean(item.company)) },
      education: { count: mergedEducation.length, verified: mergedEducation.length > 0 },
      skills: { count: skills.length },
    },
  };
}

export async function parseCvTextWithGemini(input: {
  apiKey: string;
  model?: string;
  text: string;
  fileName?: string;
  fallback: ExtractedCvData;
  timeoutMs?: number;
}): Promise<ExtractedCvData> {
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  const response = await ai.models.generateContent({
    model: input.model || GEMINI_MODEL,
    contents: `SOURCE DOCUMENT BEGIN\n${input.text}\nSOURCE DOCUMENT END`,
    config: {
      systemInstruction: CV_PARSER_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: CV_PARSER_RESPONSE_SCHEMA,
      temperature: 0,
      maxOutputTokens: 8_192,
      abortSignal: AbortSignal.timeout(input.timeoutMs || 25_000),
    },
  });
  const parsed = parseGeminiJsonObject<GeminiCvExtraction>(response.text || "");
  return finalizeExtractedCvData(toExtractedCvData(parsed, input.fallback), input.text, input.fileName);
}
