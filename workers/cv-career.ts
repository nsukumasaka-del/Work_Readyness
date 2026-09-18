import {
  buildGeneratedCv,
  CV_STRUCTURES,
  normalizeStructure,
  type CvStructure,
  type DiagnosticLike,
  type ExtractedCvData,
  type GeneratedCvDocument,
} from "../artifacts/api-server/src/lib/cv-builder";
import { getAuthenticatedUser, type D1Env } from "./d1/auth";

type ProfileRow = {
  id: number;
  user_id: string;
  email: string;
  name: string;
  phone: string | null;
  location: string | null;
  target_role: string | null;
  created_at: string;
};

type CvRow = {
  id: number;
  version: number;
  structure: string;
  title: string;
  content_json: string;
  created_at: string;
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function value(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function profileForUser(db: D1Database, userId: string): Promise<ProfileRow | null> {
  return db.prepare("SELECT * FROM career_profiles WHERE user_id = ? LIMIT 1").bind(userId).first<ProfileRow>();
}

async function upsertProfile(
  db: D1Database,
  user: { id: string; name: string; email: string },
  input: Record<string, unknown>,
): Promise<ProfileRow> {
  const previous = await profileForUser(db, user.id);
  const name = value(input.name) || previous?.name || user.name || "Professional Candidate";
  const email = (value(input.email) || previous?.email || user.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address");
  const phone = value(input.phone) || previous?.phone || "";
  const location = value(input.location) || previous?.location || "";
  const targetRole = value(input.targetRole) || previous?.target_role || "";

  await db.prepare(
    `INSERT INTO career_profiles (user_id, email, name, phone, location, target_role)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       email = excluded.email, name = excluded.name, phone = excluded.phone,
       location = excluded.location, target_role = excluded.target_role`,
  ).bind(user.id, email, name, phone || null, location || null, targetRole || null).run();
  const profile = await profileForUser(db, user.id);
  if (!profile) throw new Error("Could not prepare your BonList profile");
  return profile;
}

function publicProfile(row: ProfileRow, profileCount?: number) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    location: row.location || "",
    targetRole: row.target_role || "",
    createdAt: row.created_at,
    profileCount,
  };
}

function publicCv(row: CvRow) {
  return {
    id: row.id,
    version: row.version,
    structure: row.structure,
    title: row.title,
    createdAt: row.created_at,
    document: JSON.parse(row.content_json) as GeneratedCvDocument,
  };
}

function withExtractedSections(document: GeneratedCvDocument) {
  return {
    cv_content: {
      personal: {
        fullName: document.fullName, email: document.email, phone: document.phone,
        location: document.location, linkedin: document.linkedin, website: document.website,
        professionalTitle: document.headline,
      },
      summary: document.summary, experiences: document.experiences,
      education: document.education, skills: document.skills,
      projects: document.projects, certifications: document.certifications,
      languages: document.languages, references: document.references,
    },
    ai_feedback: document.aiFeedback,
  };
}

async function latestCv(db: D1Database, profileId: number): Promise<CvRow | null> {
  return db.prepare(
    "SELECT * FROM generated_cvs WHERE profile_id = ? ORDER BY version DESC LIMIT 1",
  ).bind(profileId).first<CvRow>();
}

async function saveCv(
  db: D1Database,
  userId: string,
  profile: ProfileRow,
  document: GeneratedCvDocument,
  title: string,
): Promise<CvRow> {
  const result = await db.prepare(
    `INSERT INTO generated_cvs (user_id, profile_id, version, structure, title, content_json)
     VALUES (?, ?, (SELECT COALESCE(MAX(version), 0) + 1 FROM generated_cvs WHERE profile_id = ?), ?, ?, ?)`,
  ).bind(userId, profile.id, profile.id, document.structure, title, JSON.stringify(document)).run();
  const id = result.meta.last_row_id;
  const row = await db.prepare("SELECT * FROM generated_cvs WHERE id = ? AND user_id = ?")
    .bind(id, userId).first<CvRow>();
  if (!row) throw new Error("Could not save the generated CV");
  return row;
}

export async function handleCvCareer(request: Request, env: D1Env): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;
  const supported =
    path === "/api/career/profile" ||
    path === "/api/career/cv/generate" ||
    path === "/api/career/cv/save" ||
    path === "/api/career/cv/versions" ||
    path === "/api/career/cv/latest";
  if (!supported) return null;
  if (!env.DB) return json(503, { error: "The BonList database is unavailable." });

  const user = await getAuthenticatedUser(request, env.DB);
  if (!user && path === "/api/career/cv/generate" && method === "POST") {
    const body = await readBody(request);
    if (!body) return json(400, { error: "Invalid CV generation request." });
    const extracted = body.extracted as ExtractedCvData | undefined;
    const personal = extracted?.cv_content?.personal || extracted?.personal;
    const profile = {
      name: value(body.name) || personal?.fullName || "Candidate",
      email: value(body.email) || personal?.email || "",
      phone: value(body.phone) || personal?.phone,
      location: value(body.location) || personal?.location,
      targetRole: value(body.targetRole) || personal?.professionalTitle,
    };
    const document = buildGeneratedCv({
      profile,
      structure: normalizeStructure(value(body.structure)),
      extracted,
      diagnostic: body.diagnostic && typeof body.diagnostic === "object"
        ? (body.diagnostic as DiagnosticLike)
        : undefined,
    });
    return json(200, {
      id: 0, version: 1, structure: document.structure,
      title: `${document.fullName} · ${document.headline} CV (${document.structureLabel})`,
      createdAt: new Date().toISOString(), document,
      ...withExtractedSections(document),
      message: "Preview generated. Sign in to save this CV to BonList.",
    });
  }
  if (!user) return json(401, { error: "Please sign in to create and save your CV." });

  try {
    if (path === "/api/career/profile" && (method === "POST" || method === "PATCH")) {
      const body = await readBody(request);
      if (!body) return json(400, { error: "Invalid profile request." });
      const profile = await upsertProfile(env.DB, user, body);
      const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM career_profiles").first<{ total: number }>();
      return json(method === "POST" ? 201 : 200, publicProfile(profile, count?.total || 0));
    }

    if (path === "/api/career/cv/generate" && method === "POST") {
      const body = await readBody(request);
      if (!body) return json(400, { error: "Invalid CV generation request." });
      const extracted = body.extracted as ExtractedCvData | undefined;
      const personal = extracted?.cv_content?.personal || extracted?.personal;
      const profile = await upsertProfile(env.DB, user, {
        name: value(body.name) || personal?.fullName,
        email: value(body.email) || personal?.email,
        phone: value(body.phone) || personal?.phone,
        location: value(body.location) || personal?.location,
        targetRole: value(body.targetRole) || personal?.professionalTitle,
      });
      const requested = value(body.structure);
      const structure: CvStructure = CV_STRUCTURES.includes(requested as CvStructure)
        ? (requested as CvStructure)
        : normalizeStructure(requested);
      const diagnostic = body.diagnostic && typeof body.diagnostic === "object"
        ? (body.diagnostic as DiagnosticLike)
        : undefined;
      const document = buildGeneratedCv({
        profile: publicProfile(profile),
        structure,
        extracted,
        diagnostic,
      });
      const title = `${profile.name} · ${document.headline} CV (${document.structureLabel})`;
      const saved = await saveCv(env.DB, user.id, profile, document, title);
      return json(201, {
        ...publicCv(saved),
        ...withExtractedSections(document),
      });
    }

    const profile = await profileForUser(env.DB, user.id);
    if (!profile) return json(404, { error: "No BonList CV profile exists yet." });

    if (path === "/api/career/cv/save" && method === "POST") {
      const body = await readBody(request);
      const document = body?.document as GeneratedCvDocument | undefined;
      if (!document || typeof document !== "object" || !document.structure) {
        return json(400, { error: "A CV document is required." });
      }
      const title = value(body?.title) || document.versionName ||
        `${profile.name} · ${document.headline || "Professional"} CV (${document.structureLabel || "BonList Standard"})`;
      const saved = await saveCv(env.DB, user.id, profile, document, title);
      return json(201, { ...publicCv(saved), message: "CV saved successfully to BonList cloud." });
    }

    if (path === "/api/career/cv/versions" && method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT * FROM generated_cvs WHERE profile_id = ? AND user_id = ? ORDER BY version DESC",
      ).bind(profile.id, user.id).all<CvRow>();
      return json(200, { versions: rows.results.map(publicCv) });
    }

    if (path === "/api/career/cv/latest" && method === "GET") {
      const latest = await latestCv(env.DB, profile.id);
      return latest ? json(200, publicCv(latest)) : json(404, { error: "No generated CV yet." });
    }
  } catch (error) {
    console.error("D1 CV route failed", error);
    return json(500, { error: "Could not prepare your BonList CV. Please try again." });
  }

  return json(405, { error: "Method not allowed." });
}
