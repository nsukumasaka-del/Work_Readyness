import { buildGeneratedCv, CV_PARSER_SYSTEM_PROMPT, evaluateAts, extractCvDataFromText, finalizeExtractedCvData, generateCandidateBiography, type GeneratedCvDocument } from "./cv-builder";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reconstructPdfTextFromItems } from "./pdf-layout-text";
import { calibrateJobListingScores } from "./ai/gemini-client";
import { CV_PARSER_RESPONSE_SCHEMA } from "./ai/cv-parser";

function expect<T>(actual: T) {
  const includes = (value: unknown, expected: unknown) =>
    typeof value === "string" ? value.includes(String(expected)) : Array.isArray(value) && value.includes(expected);
  const match = (value: unknown, pattern: RegExp) => pattern.test(String(value ?? ""));
  return {
    toBe: (expected: unknown) => assert.equal(actual, expected),
    toEqual: (expected: unknown) => assert.deepEqual(actual, expected),
    toContain: (expected: unknown) => assert.ok(includes(actual, expected)),
    toHaveLength: (expected: number) => assert.equal((actual as { length?: number } | null)?.length, expected),
    toBeTruthy: () => assert.ok(actual),
    toMatch: (pattern: RegExp) => assert.ok(match(actual, pattern)),
    not: {
      toContain: (expected: unknown) => assert.ok(!includes(actual, expected)),
      toMatch: (pattern: RegExp) => assert.ok(!match(actual, pattern)),
    },
  };
}

const SAMPLE_CV = `
Jane Doe
Senior Operations Coordinator

Email: jane@example.com
Phone: +27 82 123 4567
Johannesburg, South Africa

Professional Summary
Operations coordinator with experience supporting team workflows, records, and customer queries.

Work Experience
Operations Coordinator | ABC Logistics
January 2021 - Present
- Coordinated daily dispatch schedules and maintained delivery records.
- Responded to customer enquiries and escalated issues to the correct teams.

Education
Bachelor of Commerce | University of Johannesburg
2020
`;

describe("CV extraction anti-fabrication guardrails", () => {
  it("does not invent company, institution, or qualification data when the CV is missing those sections", () => {
    const extracted = extractCvDataFromText("Jane Doe\nEmail: jane@example.com\nPhone: +27 82 123 4567\nProfessional Summary\nOperations specialist focused on service delivery.");

    expect(extracted.personal.fullName).toBe("Jane Doe");
    expect(extracted.experiences).toEqual([]);
    expect(extracted.education).toEqual([]);
    expect(extracted.skills).toEqual([]);
    expect(extracted.certifications).toEqual([]);
    expect(extracted.languages).toEqual([]);
    expect(extracted.references).toEqual([]);
  });

  it("preserves factual data but never inserts placeholder company or institution values", () => {
    const extracted = extractCvDataFromText(SAMPLE_CV);

    expect(extracted.personal.fullName).toBe("Jane Doe");
    expect(extracted.experiences[0]?.company).toBe("ABC Logistics");
    expect(extracted.education[0]?.institution).toBe("University of Johannesburg");
    expect(extracted.education[0]?.degree).toContain("Bachelor");
    expect(extracted.education[0]?.institution).not.toMatch(/Institution|Company|Qualification/i);
    expect(extracted.experiences[0]?.company).not.toMatch(/Company|Enterprise Services|Institution/i);
  });

  it("stops extraction at the end of the References block", () => {
    const extracted = extractCvDataFromText(`Jane Doe
References
Jacky van Rooyan — Team Leader, DSV Road Brokerage • 082 320 1339
Page 2 of 2
Skills
PHANTOM FOOTER SKILL`);

    expect(extracted.references).toHaveLength(1);
    expect(extracted.references[0]).toContain("Jacky van Rooyan");
    expect(extracted.skills).not.toContain("PHANTOM FOOTER SKILL");
    expect(extracted.summary).not.toContain("PHANTOM FOOTER SKILL");
  });

  it("retains at most three references and discards repeated text after that boundary", () => {
    const extracted = extractCvDataFromText(`Jane Doe
References
Jacky van Rooyan | Team Leader, DSV Road Brokerage | 082 320 1339
Samantha Smith | Operations Manager | 082 555 0101
Peter Jones | Supervisor | 083 555 0102
Fourth Phantom Name | Fake Company | 084 555 0103
Skills
PHANTOM FOOTER SKILL`);

    expect(extracted.references).toHaveLength(3);
    expect(extracted.references.join(" ")).not.toContain("Fourth Phantom Name");
    expect(extracted.skills).not.toContain("PHANTOM FOOTER SKILL");
  });

  it("stores skills and systems once and removes facts already present in the summary", () => {
    const extracted = extractCvDataFromText(`Jane Doe
Professional Summary
Experienced in Microsoft Excel and customer account management.
Skills
Microsoft Excel
Customer Account Management
Problem Solving
Systems
NAVIS`);
    const document = buildGeneratedCv({ profile: { name: "Jane Doe" }, extracted });

    expect(extracted.toolsAndSoftware).toEqual([]);
    expect(document.skills).toContain("NAVIS");
    expect(document.skills).toContain("Problem Solving");
    expect(document.skills).not.toContain("Microsoft Excel");
    expect(document.skills).not.toContain("Customer Account Management");
    expect(document.skillGroups).toEqual([]);
    expect(document.sections).toEqual([]);
  });

  it("buildGeneratedCv does not inject fake data when the source fields are empty", () => {
    const doc = buildGeneratedCv({
      profile: { name: "", email: "", phone: "", location: "", targetRole: "" },
      extracted: {
        cv_content: {
          personal: { fullName: "", email: "", phone: "", location: "", professionalTitle: "" },
          summary: "",
          experiences: [],
          education: [],
          skills: [],
          toolsAndSoftware: [],
          certifications: [],
          languages: [],
          projects: [],
          references: [],
        },
        ai_feedback: { internalTips: [], missingKeywords: [], jobBoardAdvice: [], flaggedPhrases: [], strengths: [], improvements: [] },
        personal: { fullName: "", email: "", phone: "", location: "", professionalTitle: "" },
        summary: "",
        experiences: [],
        education: [],
        skills: [],
        toolsAndSoftware: [],
        certifications: [],
        languages: [],
        projects: [],
        references: [],
        verificationBreakdown: {
          personal: { verified: false, missingFields: [] },
          experience: { count: 0, verifiedDates: true, verifiedCompanies: false },
          education: { count: 0, verified: false },
          skills: { count: 0 },
        },
      },
      structure: "double_column",
    });

    expect(doc.fullName).toBe("");
    expect(doc.email).toBe("");
    expect(doc.location).toBe("");
    expect(doc.summary).toBe("");
    expect(doc.summary).not.toMatch(/Enterprise Services|Relevant Qualification|Institution/i);
  });

  it("candidate biography does not surface analysis feedback as the candidate summary", () => {
    const summary = generateCandidateBiography({
      fullName: "Jane Doe",
      professionalTitle: "Operations Coordinator",
      experiences: [
        { id: "exp-1", role: "Operations Coordinator", company: "ABC Logistics", startDate: "2021", endDate: "Present", bullets: ["Handled daily dispatch coordination and customer queries."] },
      ],
      skills: ["Dispatch", "Customer Service", "Records Management"],
    });

    expect(summary).toContain("Jane");
    expect(summary).not.toMatch(/Your CV has a readable structure|Strengthen the evidence|recommendations|ATS feedback/i);
  });
});

describe("complex CV import layout extraction", () => {
  it("requires summary and zero-loss custom sections in Gemini structured output", () => {
    assert.ok(CV_PARSER_RESPONSE_SCHEMA.required.includes("professional_summary"));
    assert.ok(CV_PARSER_RESPONSE_SCHEMA.required.includes("additional_sections"));
    assert.match(CV_PARSER_SYSTEM_PROMPT, /opening narrative paragraph[\s\S]+professional_summary/i);
    assert.match(CV_PARSER_SYSTEM_PROMPT, /multi-column[\s\S]+additional_sections/i);
    assert.match(CV_PARSER_SYSTEM_PROMPT, /NEVER place a spoken or written human language inside education or work_experience/i);
    const languageSchema = CV_PARSER_RESPONSE_SCHEMA.properties.languages.items;
    assert.deepEqual(languageSchema.required, ["language", "proficiency"]);
  });

  it("routes headerless language proficiencies away from nearby education", () => {
    const extracted = extractCvDataFromText(`Jane Doe
Email: jane@example.com
Education
National Senior Certificate | Makhado High School
2021
English: Fluent
isiZulu: Intermediate
XiTsonga: Native
Tshivenda: Intermediate speaking/reading, basic writing`);

    assert.equal(extracted.education.length, 1);
    assert.doesNotMatch(extracted.education.map((item) => `${item.degree} ${item.institution} ${item.details || ""}`).join(" "), /English|isiZulu|XiTsonga|Tshivenda/i);
    assert.ok(extracted.languages.includes("English: Fluent"));
    assert.ok(extracted.languages.includes("isiZulu: Intermediate"));
    assert.ok(extracted.languages.includes("XiTsonga: Native"));
    assert.ok(extracted.languages.includes("Tshivenda: Intermediate speaking/reading, basic writing"));
  });

  it("repairs language entries returned inside education or work experience", () => {
    const source = `Jane Doe
English: Fluent
XiTsonga: Native`;
    const contaminated = extractCvDataFromText(source);
    contaminated.education = [{ id: "edu-bad", degree: "English: Fluent", institution: "", graduationYear: "", classification: "VERIFIED" }];
    contaminated.experiences = [{ id: "exp-bad", role: "", company: "", startDate: "", endDate: "", bullets: ["XiTsonga: Native"], classification: "VERIFIED" }];
    contaminated.languages = [];
    contaminated.cv_content.education = contaminated.education;
    contaminated.cv_content.experiences = contaminated.experiences;
    contaminated.cv_content.languages = [];

    const repaired = finalizeExtractedCvData(contaminated, source);
    assert.deepEqual(repaired.education, []);
    assert.deepEqual(repaired.experiences, []);
    assert.ok(repaired.languages.includes("English: Fluent"));
    assert.ok(repaired.languages.includes("XiTsonga: Native"));
  });

  it("carries unmatched source sections into generated CV custom sections", () => {
    const extracted = extractCvDataFromText("Jane Doe\nEmail: jane@example.com\nProfile\nOperations specialist.");
    extracted.additionalSections = [{ heading: "Volunteer Experience", content: ["Weekend food-bank coordinator"] }];
    extracted.cv_content.additionalSections = extracted.additionalSections;
    const document = buildGeneratedCv({ profile: { name: "Jane Doe", email: "jane@example.com" }, extracted });
    assert.deepEqual(document.sections, [{ heading: "Volunteer Experience", items: ["Weekend food-bank coordinator"] }]);
  });

  it("reconstructs positioned two-column PDF text in column order", () => {
    const positioned = [
      [
        { str: "JANE DOE", x: 40, y: 760, width: 80, fontSize: 16 },
        { str: "jane@example.com", x: 40, y: 730, width: 110, fontSize: 10 },
        { str: "+27 82 123 4567", x: 40, y: 710, width: 100, fontSize: 10 },
        { str: "WORK EXPERIENCE", x: 40, y: 670, width: 120, fontSize: 11 },
        { str: "Operations Coordinator", x: 40, y: 645, width: 150, fontSize: 10 },
        { str: "ABC Logistics", x: 40, y: 625, width: 90, fontSize: 10 },
        { str: "Coordinated daily dispatch schedules.", x: 40, y: 605, width: 190, fontSize: 10 },
        { str: "EDUCATION", x: 330, y: 670, width: 65, fontSize: 11 },
        { str: "Bachelor of Commerce", x: 330, y: 645, width: 130, fontSize: 10 },
        { str: "University of Johannesburg", x: 330, y: 625, width: 155, fontSize: 10 },
        { str: "SKILLS", x: 330, y: 590, width: 40, fontSize: 11 },
        { str: "Excel", x: 330, y: 565, width: 35, fontSize: 10 },
        { str: "Dispatch coordination", x: 330, y: 545, width: 120, fontSize: 10 },
      ],
    ];
    const text = reconstructPdfTextFromItems(positioned);
    assert.ok(text.indexOf("WORK EXPERIENCE") < text.indexOf("EDUCATION"));
    assert.ok(text.indexOf("Coordinated daily dispatch") < text.indexOf("Bachelor of Commerce"));
    assert.ok(text.indexOf("Bachelor of Commerce") < text.indexOf("SKILLS"));
  });

  it("extracts contact, experience, education, and skills from a two-column reading order", () => {
    const text = `JANE DOE\nEmail: jane@example.com\nPhone: +27 82 123 4567\nWORK EXPERIENCE\nOperations Coordinator | ABC Logistics\n2021 - Present\n- Coordinated daily dispatch schedules and maintained delivery records.\nEDUCATION\nBachelor of Commerce | University of Johannesburg\n2020\nSKILLS\nExcel\nDispatch coordination`;
    const extracted = extractCvDataFromText(text);
    assert.equal(extracted.personal.fullName, "JANE DOE");
    assert.equal(extracted.personal.email, "jane@example.com");
    assert.match(extracted.personal.phone || "", /\+27/);
    assert.ok(extracted.experiences.length > 0);
    assert.ok(extracted.education.length > 0);
    assert.ok(extracted.skills.some((skill) => /Excel/i.test(skill)));
  });
});

describe("strict ATS role alignment", () => {
  const logisticsCv: GeneratedCvDocument = {
    structure: "classic", structureLabel: "Classic", structureDescription: "Test", templateType: "single_column",
    fullName: "Jane Doe", headline: "Customer Service and Logistics Coordinator", contactLine: "jane@example.com",
    email: "jane@example.com", phone: "+27821234567", location: "Johannesburg",
    summary: "Customer service and road freight coordinator experienced in dispatch records, client queries, imports and shipment tracking.",
    experiences: [{ id: "1", role: "Road Freight Coordinator", company: "ABC Logistics", startDate: "2021", endDate: "Present", bullets: ["Coordinated dispatch schedules and resolved customer delivery queries."] }],
    education: [], skillGroups: [], skills: ["Customer service", "Freight", "Dispatch", "Shipment tracking"], keywords: [], sections: [], footerNote: "", authenticityScore: 90,
  };

  it("caps an unrelated technical engineering target below 40 percent", () => {
    const report = evaluateAts(logisticsCv, "Technical Manager - Solar Engineering");
    assert.ok(report.overallScore < 40);
    assert.ok(report.missingKeywords.some((item) => /solar|engineering|technical/i.test(item)));
  });

  it("does not apply the mismatch cap to a directly aligned logistics target", () => {
    const report = evaluateAts(logisticsCv, "Road Freight Coordinator");
    assert.ok(report.overallScore >= 65);
  });

  it("does not treat an aspirational target role as technical experience", () => {
    const [job] = calibrateJobListingScores(
      { targetRole: "Technical Manager - Solar Engineering", experienceRoles: ["Customer Service Representative", "Road Freight Coordinator"], skills: ["Customer service", "Dispatch"] },
      [{ id: 1, title: "Technical Manager - Solar Engineering", company: "Employer", location: "Gauteng", sector: "Engineering", salary: "Not stated", match: 95, posted: "Today", tags: [], description: "Lead solar engineering delivery.", source: "Test", url: "https://example.com/job" }],
    );
    assert.ok(job.match < 40);
  });

  it("caps principal engineering matches for N2/N3-only candidates", () => {
    const [job] = calibrateJobListingScores(
      {
        targetRole: "Mechanical Apprentice",
        experienceRoles: ["Mechanical Maintenance Assistant"],
        skills: ["Mechanical maintenance", "Workshop safety"],
        credentials: ["N2 Mechanical Engineering", "N3 Engineering Studies", "BSc Business Administration"],
        yearsExperience: 3,
      },
      [{ id: 2, title: "Principal Mechanical Engineer", company: "Employer", location: "Gauteng", sector: "Engineering", salary: "Not stated", match: 95, posted: "Today", tags: [], description: "BEng Mechanical Engineering and Pr.Eng registration required.", source: "Test", url: "https://example.com/principal-engineer" }],
    );
    assert.ok(job.match <= 10);
  });

  it("caps an unqualified psychologist target at the regulated-role threshold", () => {
    const report = evaluateAts(logisticsCv, "Psychologist");
    assert.ok(report.overallScore <= 20);
    assert.equal(report.roleMatch?.isRoleMatch, false);
    assert.equal(report.roleMatch?.mismatchType, "regulated");
    assert.ok(report.roleMatch?.missingMandatoryRequirements.some((item) => /psychology qualification/i.test(item)));
    assert.ok(report.roleMatch?.missingMandatoryRequirements.some((item) => /HPCSA|board/i.test(item)));
  });

  it("allows qualification evidence to pass the psychologist regulatory gate", () => {
    const psychologistCv: GeneratedCvDocument = {
      ...logisticsCv,
      headline: "Registered Psychologist",
      summary: "Registered psychologist providing psychological assessment and clinical mental-health support.",
      experiences: [{ id: "psy-1", role: "Psychologist", company: "Community Clinic", startDate: "2022", endDate: "Present", bullets: ["Provided psychological assessment and counselling under clinical protocols."] }],
      education: [{ id: "edu-1", degree: "Master of Arts in Psychology", institution: "South African University", graduationYear: "2021" }],
      certifications: [{ id: "cert-1", name: "HPCSA Registered Psychologist", issuer: "HPCSA" }],
      skills: ["Psychological assessment", "Counselling", "Mental health", "Clinical practice"],
    };
    const report = evaluateAts(psychologistCv, "Psychologist");
    assert.notEqual(report.roleMatch?.mismatchType, "regulated");
    assert.equal(report.roleMatch?.missingMandatoryRequirements.length, 0);
    assert.ok(report.overallScore >= 60);
  });

  it("treats administration to operations as an adjacent transferable move", () => {
    const adminCv: GeneratedCvDocument = {
      ...logisticsCv,
      headline: "Administrative Coordinator",
      summary: "Administrative coordinator supporting office operations, scheduling, records and document control.",
      experiences: [{ id: "admin-1", role: "Administrative Coordinator", company: "Employer", startDate: "2021", endDate: "Present", bullets: ["Coordinated office schedules, records and operational requests."] }],
      skills: ["Administration", "Scheduling", "Document control", "Records management", "Coordination"],
    };
    const report = evaluateAts(adminCv, "Operations Coordinator");
    assert.equal(report.roleMatch?.mismatchType, "none");
    assert.ok(report.overallScore >= 60 && report.overallScore <= 80);
  });
});
