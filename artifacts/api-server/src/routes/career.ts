import { Router, type IRouter } from "express";
import {
  ApplyForCoachingBody,
  ApplyForCoachingResponse,
  CreateDiagnosticBody,
  CreateDiagnosticResponse,
  GetCareerOverviewResponse,
  GetInterviewPrepResponse,
  ListJobsQueryParams,
  ListJobsResponse,
} from "@workspace/api-zod";
import { db, coachingApplicationsTable, diagnosticReportsTable, jobsTable } from "@workspace/db";

const router: IRouter = Router();

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
];

async function ensureJobs() {
  const existing = await db.select({ id: jobsTable.id }).from(jobsTable).limit(1);
  if (existing.length === 0) {
    await db.insert(jobsTable).values(seededJobs);
  }
}

router.get("/career/overview", async (req, res) => {
  await ensureJobs();
  const jobs = await db.select().from(jobsTable);
  const latestReport = await db.select().from(diagnosticReportsTable).limit(1);
  const data = GetCareerOverviewResponse.parse({
    diagnosticScore: latestReport[0]?.authenticityScore ?? 82,
    jobMatchCount: jobs.length,
    interviewProgress: 2,
    latestRole: "Marketing & Growth",
  });
  req.log.info({ jobMatchCount: jobs.length }, "Career overview requested");
  res.json(data);
});

router.get("/career/jobs", async (req, res) => {
  await ensureJobs();
  const query = ListJobsQueryParams.parse(req.query);
  const jobs = await db.select().from(jobsTable);
  const filtered = jobs.filter((job) => {
    const matchesLocation =
      !query.location ||
      job.location.toLowerCase().includes(query.location.toLowerCase());
    const matchesSector =
      !query.sector ||
      job.sector.toLowerCase().includes(query.sector.toLowerCase());
    return matchesLocation && matchesSector;
  });
  res.json(ListJobsResponse.parse(filtered));
});

router.post("/career/diagnostic", async (req, res) => {
  const input = CreateDiagnosticBody.parse(req.body);
  const [report] = await db
    .insert(diagnosticReportsTable)
    .values({
      fileName: input.fileName,
      authenticityScore: 82,
      atsScore: 68,
      flaggedPhrases: ["results-driven", "spearheaded", "delve"],
      missingKeywords: ["Lifecycle marketing", "Go-to-market", "CRM"],
      prompts: [
        "What changed because of your work? Add a measurable outcome.",
        "Name the audience, channel, or budget you owned.",
        "Replace the general claim with one real example.",
      ],
    })
    .returning();
  const data = CreateDiagnosticResponse.parse({
    id: report.id,
    fileName: report.fileName,
    authenticityScore: report.authenticityScore,
    atsScore: report.atsScore,
    flaggedPhrases: report.flaggedPhrases,
    missingKeywords: report.missingKeywords,
    prompts: report.prompts,
  });
  req.log.info({ reportId: report.id, fileName: report.fileName }, "CV diagnostic created");
  res.status(201).json(data);
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
    .values(input)
    .returning();
  const data = ApplyForCoachingResponse.parse({
    id: application.id,
    status: application.status,
    message: "Thanks — your application is in. We’ll be in touch within one business day.",
  });
  req.log.info({ applicationId: application.id }, "Coaching application received");
  res.status(201).json(data);
});

export default router;