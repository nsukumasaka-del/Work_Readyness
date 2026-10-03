import type { DiagnosticReport } from '@workspace/api-client-react';
import { normalizeJobResults } from '../types/job';
import { objectData, objectList, stringList } from './safe-data';

export function normalizeDiagnosticReport(value: unknown): DiagnosticReport {
  const data = objectData(value);
  if (!Object.keys(data).length || data.success === false || typeof data.error === 'string') {
    throw new Error('The CV review could not be loaded. Please try again.');
  }
  const normalized = { ...data };
  for (const key of ['fileName', 'targetRole', 'summary', 'healthCheckMessage', 'recommendation']) normalized[key] = typeof data[key] === 'string' ? data[key] : '';
  for (const key of ['id', 'overallScore', 'authenticityScore', 'atsScore']) normalized[key] = typeof data[key] === 'number' && Number.isFinite(data[key]) ? data[key] : 0;
  for (const key of ['missingMandatoryRequirements', 'flaggedPhrases', 'missingKeywords', 'prompts']) normalized[key] = stringList(data[key]);
  for (const key of ['strengths', 'improvements', 'sectionReviews', 'rewriteExamples']) {
    normalized[key] = objectList(data[key]).map(item => {
      const result = { ...item };
      for (const field of ['title', 'detail', 'section', 'priority', 'original', 'improved', 'before', 'after', 'reason', 'status']) result[field] = typeof item[field] === 'string' ? item[field] : '';
      result.findings = stringList(item.findings);
      return result;
    });
  }
  normalized.scores = Object.fromEntries(Object.entries(objectData(data.scores)).filter(([, score]) => typeof score === 'number' && Number.isFinite(score)));
  normalized.relatedJobs = normalizeJobResults(data.relatedJobs);
  const search = objectData(data.jobSearch);
  normalized.jobSearch = { ...search, query: typeof search.query === 'string' ? search.query : '', queriedBoards: stringList(search.queriedBoards), boardSearchLinks: objectList(search.boardSearchLinks).filter(link => typeof link.url === 'string' && typeof link.board === 'string') };
  const advisory = objectData(data.careerAdvisory);
  if (Object.keys(advisory).length) {
    const safe = { ...advisory };
    for (const key of ['requestedField', 'cvProfileSummary', 'highestProbabilityAdvice', 'positioningGapsAdvice', 'strategicSuccessVerdict']) safe[key] = typeof advisory[key] === 'string' ? advisory[key] : '';
    for (const key of ['experienceSectors', 'primarySystems', 'strongestFitSectors', 'skillGaps']) safe[key] = stringList(advisory[key]);
    normalized.careerAdvisory = safe;
  } else delete normalized.careerAdvisory;
  return normalized as unknown as DiagnosticReport;
}
