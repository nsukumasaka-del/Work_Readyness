type CvProgressDocument = {
  fullName?: string;
  email?: string;
  phone?: string;
  summary?: string;
  experiences?: unknown[];
  education?: unknown[];
  skills?: unknown[];
  toolsAndSoftware?: unknown[];
  certifications?: unknown[];
  projects?: unknown[];
  languages?: unknown[];
};

/** Product completion rubric: header 25, summary 20, experience 25, education 15, skills/extras 15. */
export function calculateCvCompletion(document: CvProgressDocument): number {
  const hasName = Boolean(document.fullName?.trim());
  const hasContact = Boolean(document.email?.trim() || document.phone?.trim());
  const hasExtras = [document.toolsAndSoftware, document.certifications, document.projects, document.languages]
    .some((section) => Array.isArray(section) && section.length > 0);
  return Math.min(100,
    (hasName && hasContact ? 25 : hasName || hasContact ? 12 : 0) +
    (document.summary?.trim() ? 20 : 0) +
    (document.experiences?.length ? 25 : 0) +
    (document.education?.length ? 15 : 0) +
    (document.skills?.length || hasExtras ? 15 : 0),
  );
}
