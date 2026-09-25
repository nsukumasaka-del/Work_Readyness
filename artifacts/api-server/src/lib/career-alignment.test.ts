import assert from "node:assert/strict";
import test from "node:test";
import { buildCareerAlignmentReport } from "./career-alignment";

test("classifies site management and construction experience in the built-environment sector", () => {
  const report = buildCareerAlignmentReport("Project Manager", "Gauteng", {
    experiences: [{
      role: "Site Agent / Project Manager",
      company: "Civil Construction",
      bullets: ["Managed construction site operations, contractor schedules, and civil works quality checks."],
    }],
    skills: ["Site safety", "Project scheduling"],
  }, []);

  assert.equal(report.experienceSectors[0], "Construction, Built Environment & Site Operations");
  assert(!report.experienceSectors.includes("Customer service and account support"));
});
