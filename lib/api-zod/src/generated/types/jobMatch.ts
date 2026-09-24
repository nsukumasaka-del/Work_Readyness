export interface JobMatch {
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
  fitBreakdown?: { skills: number; titleDomain: number; seniority: number; location: number };
}
