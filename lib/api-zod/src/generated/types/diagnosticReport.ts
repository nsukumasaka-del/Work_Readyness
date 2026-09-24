import type { DiagnosticFinding } from "./diagnosticFinding";
import type { DiagnosticJobSearch } from "./diagnosticJobSearch";
import type { DiagnosticRewrite } from "./diagnosticRewrite";
import type { DiagnosticScoreBreakdown } from "./diagnosticScoreBreakdown";
import type { DiagnosticSectionReview } from "./diagnosticSectionReview";
import type { JobMatch } from "./jobMatch";

export interface DiagnosticReport {
  id: number;
  fileName: string;
  targetRole: string;
  summary: string;
  overallScore: number;
  authenticityScore: number;
  atsScore: number;
  scores: DiagnosticScoreBreakdown;
  strengths: DiagnosticFinding[];
  improvements: DiagnosticFinding[];
  sectionReviews: DiagnosticSectionReview[];
  flaggedPhrases: string[];
  missingKeywords: string[];
  rewriteExamples: DiagnosticRewrite[];
  prompts: string[];
  relatedJobs: JobMatch[];
  careerAdvisory?: {
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
  };
  jobSearch: DiagnosticJobSearch;
}
