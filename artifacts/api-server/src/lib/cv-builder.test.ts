import { buildGeneratedCv, extractCvDataFromText, generateCandidateBiography } from "./cv-builder";

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
    expect(doc.summary).toBeTruthy();
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

    expect(summary).toContain("Jane Doe");
    expect(summary).not.toMatch(/Your CV has a readable structure|Strengthen the evidence|recommendations|ATS feedback/i);
  });
});
