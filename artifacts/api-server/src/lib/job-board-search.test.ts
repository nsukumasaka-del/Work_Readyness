import assert from "node:assert/strict";
import test from "node:test";
import { searchTrustedJobBoards } from "./job-board-search";

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
