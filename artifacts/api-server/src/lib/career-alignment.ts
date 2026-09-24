import type { LiveJobListing } from "./job-board-search";

type CvForAlignment = {
  experiences?: Array<{
    role?: string;
    company?: string;
    startDate?: string;
    endDate?: string;
    bullets?: string[];
  }>;
  skills?: string[];
  toolsAndSoftware?: string[];
  certifications?: Array<{ name?: string }>;
  education?: Array<{ degree?: string; details?: string }>;
};

export interface CareerAlignmentReport {
  requestedField: string;
  cvProfileSummary: string;
  experienceSectors: string[];
  primarySystems: string[];
  yearsExperience: number | null;
  strongestFitSectors: string[];
  skillGaps: string[];
  highestProbabilityAdvice: string;
  positioningGapsAdvice: string;
  strategicSuccessVerdict: string;
}

const SECTOR_CUES: Array<{ label: string; pattern: RegExp }> = [
  { label: "Road freight and imports", pattern: /freight|logistic|import|export|brokerage|transport|customs|shipping/i },
  { label: "Aviation and passenger services", pattern: /aviation|airline|airport|passenger|cabin|check.?in|reservation/i },
  { label: "Customer service and account support", pattern: /customer|client|service|support|account|call.?centre|help.?desk/i },
  { label: "Administration and operations", pattern: /administr|operations|coordinator|documentation|compliance/i },
  { label: "Credit and collections", pattern: /credit|collection|accounts receivable|debt/i },
];

const ROLE_REQUIREMENTS: Array<{ pattern: RegExp; skills: string[] }> = [
  { pattern: /freight|import|export|logistic|transport/i, skills: ["freight brokerage", "import/export documentation", "customs compliance", "rate negotiation", "shipment tracking", "Excel", "TMS"] },
  { pattern: /aviation|airline|airport|passenger/i, skills: ["passenger handling", "check-in and boarding", "reservation systems", "airline operations", "customer service"] },
  { pattern: /customer|support|call.?centre|account/i, skills: ["CRM", "customer issue resolution", "service-level targets", "account management", "written communication"] },
  { pattern: /credit|collection|accounts receivable/i, skills: ["credit control", "accounts receivable", "debt collection", "reconciliation", "accounting"] },
];

const SYSTEM_PATTERN = /\b(?:Radixx|NAVIS|VFT|TPT Portal|Excel|Outlook|SAP|CargoWise|CRM|TMS|HubSpot|Zoho|Salesforce|Oracle|Microsoft Office)\b/gi;

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  return items.map((item) => item.trim()).filter((item) => {
    const key = item.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function estimateCareerYears(experiences: CvForAlignment["experiences"]): number | undefined {
  const years: number[] = [];
  for (const entry of experiences ?? []) {
    for (const dateText of [entry.startDate, entry.endDate]) {
      const year = dateText?.match(/\b(?:19|20)\d{2}\b/)?.[0];
      if (year) years.push(Number(year));
      else if (dateText && /\b(present|current|now)\b/i.test(dateText)) years.push(new Date().getFullYear());
    }
  }
  if (!years.length) return undefined;
  const currentYear = new Date().getFullYear();
  const oldest = Math.min(...years);
  const newest = Math.min(currentYear, Math.max(...years));
  return Math.max(1, newest - oldest + 1);
}

export function buildCareerAlignmentReport(
  role: string,
  location: string,
  cv: CvForAlignment,
  jobs: LiveJobListing[],
): CareerAlignmentReport {
  const experiences = cv.experiences ?? [];
  const experienceText = experiences.map((item) => [item.role, item.company, ...(item.bullets ?? [])].filter(Boolean).join(" ")).join(" ");
  const allSkills = unique([...(cv.skills ?? []), ...(cv.toolsAndSoftware ?? [])]);
  const systems = unique([...(allSkills.join(" ").match(SYSTEM_PATTERN) ?? [])]).slice(0, 8);
  const sectors = SECTOR_CUES.filter(({ pattern }) => pattern.test(experienceText)).map(({ label }) => label);
  const years = estimateCareerYears(experiences) ?? null;
  const roles = unique(experiences.map((item) => item.role || "")).slice(0, 4);
  const profileParts = [
    roles.length ? `Experience includes ${roles.join(", ")}` : "The CV has limited clearly labelled role history",
    years !== null ? `approximately ${years} year${years === 1 ? "" : "s"} of dated experience` : "employment dates were not clear enough to estimate tenure",
    allSkills.length ? `${allSkills.slice(0, 8).join(", ")}${allSkills.length > 8 ? `, and ${allSkills.length - 8} other skills` : ""}` : "few explicit skills were extracted",
    systems.length ? `systems: ${systems.join(", ")}` : "no named operating systems were identified",
    sectors.length ? `sectors: ${sectors.join(", ")}` : "industry sectors need clearer evidence",
  ];

  const roleRequirements = ROLE_REQUIREMENTS.find(({ pattern }) => pattern.test(role))?.skills ?? [];
  const evidence = `${allSkills.join(" ")} ${experienceText} ${(cv.certifications ?? []).map((item) => item.name).join(" ")} ${(cv.education ?? []).map((item) => `${item.degree} ${item.details}`).join(" ")}`.toLowerCase();
  const gaps = roleRequirements.filter((skill) => {
    const normalized = skill.toLowerCase();
    const aliases = normalized === "import/export documentation" ? /import|export|customs|documentation/i
      : normalized === "customer issue resolution" ? /customer|complaint|issue|resolution/i
      : normalized === "service-level targets" ? /sla|service level|service standard/i
      : new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    return !aliases.test(evidence);
  }).slice(0, 5);

  const observedJobSectors = jobs.flatMap((job) => {
    const text = `${job.title} ${job.description} ${job.sector}`;
    return SECTOR_CUES.filter(({ pattern }) => pattern.test(text)).map(({ label }) => label);
  });
  const strongestFits = unique([...sectors, ...observedJobSectors]).slice(0, 4);
  const jobTitles = unique(jobs.slice(0, 3).map((job) => job.title));
  const bestRoles = jobTitles.length ? jobTitles.join(", ") : roles.length ? roles.join(" and ") : role;
  const gapText = gaps.length
    ? `Current CV evidence does not clearly show ${gaps.join(", ")}. Add these only if you have done the work, and name relevant certificates where a vacancy requires them.`
    : "No major role-specific skill gap was evident from the extracted profile; tailor examples to each vacancy and verify any mandatory licences or certificates in the listing.";
  const recommendation = sectors.length
    ? `Your strongest evidence is in ${sectors.slice(0, 3).join(", ")}. Prioritize ${bestRoles} roles in ${location}; those openings align most closely with the work history and systems already visible in your CV.`
    : `Start with ${bestRoles} roles in ${location}, but strengthen the CV with clearly labelled responsibilities, systems, and outcomes so employers can verify your fit quickly.`;
  const verdict = sectors.length
    ? `You are best positioned to win interviews in ${sectors.slice(0, 2).join(" and ")} because your documented experience transfers directly. For adjacent roles, make the relevant systems, compliance exposure, and measurable outcomes explicit; avoid claiming qualifications that are not in your CV.`
    : `Your target role is plausible, but the parsed CV does not yet show enough specific evidence to estimate a strong hiring advantage. Clarify role dates, systems, and role-specific achievements, then target openings that accept transferable experience.`;

  return {
    requestedField: `${role} in ${location}`,
    cvProfileSummary: profileParts.join("; ") + ".",
    experienceSectors: sectors,
    primarySystems: systems,
    yearsExperience: years,
    strongestFitSectors: strongestFits,
    skillGaps: gaps,
    highestProbabilityAdvice: recommendation,
    positioningGapsAdvice: gapText,
    strategicSuccessVerdict: verdict,
  };
}
