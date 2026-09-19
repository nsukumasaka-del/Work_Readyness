import { getAuthenticatedUser, type D1Env, type UserRow } from "./auth";
import {
  extractCvDataFromText,
  evaluateQualityScore,
  generateRecruiterView,
  analyzeCareerPositioning,
  answerAdvisorQuestion,
  improveBulletPoint,
  improveCvContent,
  humanizeContent,
  matchJobDescription,
  matchJobDescriptionAdvanced,
  discoverTransferableSkills,
  generateAchievementDiscoveryQuestions,
  incorporateDiscoveredAchievement,
  runPreFlightQualityControl,
  type GeneratedCvDocument,
  type HumanizeTone,
  type ImproveCvScope,
} from "../../artifacts/api-server/src/lib/cv-builder";

const toolPaths = new Set([
  "advisor", "quality-score", "recruiter-view", "positioning", "enhance-bullet",
  "improve", "humanize", "tailor", "match-advanced", "transferable-skills",
  "achievement-discovery", "achievement-incorporate", "pre-flight-audit", "outcomes", "parse-upload",
]);

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function outcomes(request: Request, env: D1Env, user: UserRow): Promise<Response> {
  const profile = await env.DB.prepare("SELECT id FROM career_profiles WHERE user_id = ?")
    .bind(user.id).first<{ id: number }>();
  if (!profile) return json({ error: "Complete your profile first." }, 400);
  if (request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT id, role_title, company, status, interview_count, cv_structure, notes, consented_to_analytics, created_at FROM application_outcomes WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100",
    ).bind(user.id).all();
    return json({ outcomes: rows.results.map((row) => ({
      id: row.id, roleTitle: row.role_title, company: row.company, status: row.status,
      interviewCount: row.interview_count, cvStructure: row.cv_structure,
      notes: row.notes, consentedToAnalytics: Boolean(row.consented_to_analytics),
      createdAt: row.created_at,
    })) });
  }
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;
  const roleTitle = str(input.roleTitle);
  const company = str(input.company);
  if (!roleTitle || !company) return json({ error: "Role and company are required." }, 400);
  const inserted = await env.DB.prepare(
    `INSERT INTO application_outcomes
      (user_id, profile_id, role_title, company, status, interview_count, cv_structure, notes, consented_to_analytics)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(user.id, profile.id, roleTitle, company, str(input.status) || "applied",
    Number(input.interviewCount) || 0, str(input.cvStructure), str(input.notes),
    input.consentedToAnalytics === false ? 0 : 1).run();
  return json({ id: inserted.meta.last_row_id, message: "Application outcome recorded." }, 201);
}

export async function handleCvTools(request: Request, env: D1Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const match = /^\/api\/career\/cv\/([a-z-]+)$/.exec(path);
  if (!match || !toolPaths.has(match[1])) return null;
  const tool = match[1];
  if (request.method !== "POST" && !(tool === "outcomes" && request.method === "GET")) {
    return json({ error: "Method not allowed." }, 405);
  }
  const user = await getAuthenticatedUser(request, env);
  if (!user) return json({ error: "Please sign in to continue." }, 401);
  if (tool === "outcomes") return outcomes(request, env, user);
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;

  if (tool === "parse-upload") {
    const text = str(input.text);
    const fileName = str(input.fileName) || "uploaded-cv";
    if (!text) {
      return json({
        error: "This Cloudflare deployment needs readable document text. Please re-save the CV as a text-based PDF or DOCX and try again.",
      }, 415);
    }
    if (text.length > 250_000) {
      return json({ error: "The CV text is too long. Please upload a CV under 20MB." }, 413);
    }
    const extracted = extractCvDataFromText(text, fileName);
    return json(extracted);
  }

  const cv = input.cvDocument as GeneratedCvDocument | undefined;
  const job = str(input.jobDescription);
  if (tool === "humanize") {
    const content = str(input.text);
    return content ? json(humanizeContent(content, (str(input.tone) || "professional") as HumanizeTone,
      { role: str(input.role), name: str(input.name) })) : json({ error: "Text is required." }, 400);
  }
  if (tool === "enhance-bullet") {
    const bullet = str(input.bullet);
    return bullet ? json(improveBulletPoint(bullet, str(input.role))) : json({ error: "Bullet text is required." }, 400);
  }
  if (tool === "achievement-incorporate") {
    const original = str(input.originalBullet);
    const answer = str(input.candidateAnswer);
    return original && answer
      ? json(incorporateDiscoveredAchievement(original, answer, (str(input.category) || "volume") as "volume" | "speed" | "quality" | "tools" | "sla"))
      : json({ error: "Original bullet and candidate answer are required." }, 400);
  }
  if (!cv) return json({ error: "CV document is required." }, 400);
  switch (tool) {
    case "advisor": return str(input.question)
      ? json(answerAdvisorQuestion(str(input.question), cv, str(input.targetJob)))
      : json({ error: "Question is required." }, 400);
    case "quality-score": return json(evaluateQualityScore(cv, job || undefined));
    case "recruiter-view": return json(generateRecruiterView(cv));
    case "positioning": return json(analyzeCareerPositioning(cv, str(input.targetJob) || undefined));
    case "improve": return json(improveCvContent(cv, {
      scope: (str(input.scope) || "entire") as ImproveCvScope,
      targetJob: str(input.targetJob) || undefined,
    }));
    case "tailor": return job ? json(matchJobDescription(cv, job)) : json({ error: "Job description is required." }, 400);
    case "match-advanced": return job ? json(matchJobDescriptionAdvanced(cv, job)) : json({ error: "Job description is required." }, 400);
    case "transferable-skills": return json(discoverTransferableSkills(cv, str(input.targetRoleOrIndustry) || undefined));
    case "achievement-discovery": return json({ questions: generateAchievementDiscoveryQuestions(cv) });
    case "pre-flight-audit": return json(runPreFlightQualityControl(cv));
  }
  return null;
}
