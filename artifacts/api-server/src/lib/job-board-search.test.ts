import assert from "node:assert/strict";
import test from "node:test";
import { candidateMatch, searchTrustedJobBoards, type LiveJobListing } from "./job-board-search";

const listing = (title: string, description: string, location = "Johannesburg"): LiveJobListing => ({
  id: 1, title, company: "Test employer", location, sector: "Professional services",
  salary: "See listing", match: 50, posted: "Today", tags: [], source: "Test", url: "https://example.test/job",
  description,
});

test('LinkedIn enrichment stays bounded and blocked boards do not discard listings', async () => {
  const originalFetch = globalThis.fetch;
  let details = 0;
  let searches = 0;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes('linkedin.com/jobs-guest')) {
      searches++;
      return new Response(Array.from({ length: 10 }, (_, index) => `<div class="base-card test"><a class="base-card__full-link" href="https://www.linkedin.com/jobs/view/customer-service-${index}"></a><h3 class="base-search-card__title">Customer Service Agent</h3><h4 class="base-search-card__subtitle">Employer ${index}</h4><span class="job-search-card__location">Gauteng</span></div>`).join(''));
    }
    if (url.includes('linkedin.com/jobs/view/')) { details++; return new Response('', { status: 429 }); }
    return new Response('', { status: 403 });
  };
  try {
    const result = await searchTrustedJobBoards({ role: 'Customer Service', location: 'Gauteng', limit: 1, mode: 'search' });
    assert.equal(result.jobs.length, 1);
    assert.equal(searches, 1);
    assert.equal(details, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test("fills six location-matched listings from recognized boards after priority boards", async () => {
  const originalFetch = globalThis.fetch;
  const dates = Array.from({ length: 7 }, (_, index) =>
    new Date(Date.now() - (index + 1) * 86_400_000).toISOString());
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("pnet.co.za/jobs/")) {
      return new Response(`"items":[${JSON.stringify({
        id: 1,
        title: "Software Engineer",
        companyName: "Priority Employer",
        location: "Cape Town",
        url: "/jobs--software-engineer--1-inline.html",
        datePosted: dates[6],
      })}]`, { status: 200 });
    }
    if (url.includes("api.adzuna.com")) {
      return Response.json({ results: Array.from({ length: 7 }, (_, index) => ({
        id: index + 10,
        title: "Software Engineer",
        company: { display_name: `Employer ${index}` },
        location: { display_name: index === 6 ? "Pretoria" : "Cape Town" },
        created: dates[index],
        redirect_url: `https://www.adzuna.co.za/jobs/details/${index + 10}`,
      })) });
    }
    return new Response("", { status: 404 });
  };
  try {
    const result = await searchTrustedJobBoards({
      role: "Software Engineer", location: "Cape Town", limit: 6,
      experienceRoles: ["Software Engineer"],
      expertise: ["software engineering"],
      yearsExperience: 4,
      adzunaAppId: "test", adzunaAppKey: "test",
    });
    assert.equal(result.jobs.length, 6);
    assert.equal(result.jobs[0].source, "PNet");
    assert(result.jobs.every((job) => job.location.includes("Cape Town")));
    assert(result.jobs.slice(1).every((job) => job.source === "Adzuna"));
    assert(result.jobs.slice(1).every((job, index, jobs) =>
      index === 0 || Date.parse(jobs[index - 1].posted) >= Date.parse(job.posted)));
    assert(result.queriedBoards.includes("Adzuna"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns an honest empty result when no board has an individual listing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 404 });
  try {
    const result = await searchTrustedJobBoards({ role: "Software Engineer", location: "Cape Town" });
    assert.deepEqual(result.jobs, []);
    assert.equal(result.liveResults, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("blocks regulated nursing and accountant listings without matching credentials", () => {
  const nurseJob = listing("Professional Nurse Specialist", "Active SANC registration and nursing qualification are required.");
  const accountantJob = listing("Professional Accountant", "SAICA or SAIPA registration is essential for this role.");

  assert.equal(candidateMatch(nurseJob, "Professional Nurse Specialist", [], ["customer service"], "Gauteng", [], 8).score, 0);
  assert.equal(candidateMatch(nurseJob, "Professional Nurse Specialist", ["Professional Nurse"], ["patient care"], "Gauteng", [], 8).score, 0);
  assert.equal(candidateMatch(accountantJob, "Professional Accountant", [], ["Excel", "account management"], "Gauteng", [], 8).score, 0);
  assert(candidateMatch(nurseJob, "Professional Nurse Specialist", [], ["patient care"], "Gauteng", [], 8, ["SANC registration"]).score > 0);
  assert(candidateMatch(accountantJob, "Professional Accountant", [], ["financial reporting"], "Gauteng", [], 8, ["SAIPA professional accountant"]).score > 0);
});

test("calculates different role and seniority subscores from each listing", () => {
  const candidate = {
    role: "Site Agent",
    history: ["Site Agent", "Assistant Site Manager"],
    skills: ["construction", "site safety", "project scheduling", "civil engineering"],
  };
  const seniorListing = candidateMatch(
    listing("Senior Construction Site Manager", "Construction site management, civil works, contractor coordination; 8 years experience required."),
    candidate.role, candidate.history, candidate.skills, "Gauteng", [], 4,
  );
  const juniorListing = candidateMatch(
    listing("Junior Site Agent", "Entry-level site operations and construction scheduling."),
    candidate.role, candidate.history, candidate.skills, "Gauteng", [], 4,
  );

  assert.notEqual(seniorListing.breakdown.seniority, juniorListing.breakdown.seniority);
  assert.notEqual(seniorListing.breakdown.titleDomain, juniorListing.breakdown.titleDomain);
});

test("rejects professional engineering roles for N2/N3-only candidates", () => {
  const credentials = ["N2 Mechanical Engineering", "N3 Engineering Studies"];
  const principal = candidateMatch(
    listing("Principal Mechanical Engineer", "BEng Mechanical Engineering and Pr.Eng registration required; lead engineering projects."),
    "Mechanical Apprentice", ["Mechanical Maintenance Assistant"], ["mechanical maintenance", "hand tools"], "Gauteng", [], 3, credentials,
  );
  const projectEngineer = candidateMatch(
    listing("Project Mechanical Engineer", "University engineering degree and five years of project delivery experience required."),
    "Mechanical Apprentice", ["Mechanical Maintenance Assistant"], ["mechanical maintenance", "hand tools"], "Gauteng", [], 3, credentials,
  );

  assert.equal(principal.score, 0);
  assert.equal(projectEngineer.score, 0);
});

test("keeps entry-level trade roles eligible for an aligned N2/N3 candidate", () => {
  const match = candidateMatch(
    listing("Mechanical Apprentice", "Entry-level mechanical maintenance, workshop safety, and hand-tool duties."),
    "Mechanical Apprentice", ["Maintenance Assistant"], ["mechanical maintenance", "workshop safety", "hand tools"], "Gauteng", [], 2,
    ["N2 Mechanical Engineering", "N3 Engineering Studies"],
  );

  assert(match.score >= 60);
});

test("rejects senior titles without sufficient experience in that job domain", () => {
  const match = candidateMatch(
    listing("Senior DevOps Engineer", "Lead cloud infrastructure and Kubernetes platform engineering."),
    "DevOps Engineer", ["Customer Service Manager"], ["customer service", "team scheduling"], "Gauteng", [], 10,
  );

  assert.equal(match.score, 0);
});
