/** Normalize labels for display without changing the saved CV facts. */
export function sanitizeSkillBadge(skill: string): string {
  const cleaned = String(skill || "").trim().replace(/\s+/g, " ");
  const labels: Record<string, string> = {
    "RADIXX GO": "Radixx Go",
    "TPT PORTAL": "TPT Portal",
    "SPOTLIGHT TRACKING": "Spotlight Tracking",
    "NAVIS VET": "Navis Vet",
    VFT: "Navis Vet",
  };
  return labels[cleaned.toUpperCase()] || cleaned;
}
