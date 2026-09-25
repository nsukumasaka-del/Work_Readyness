export type LiveJobListing = {
  id: number;
  title: string;
  company: string;
  location: string;
  sector: string;
  salary: string;
  match: number;
  posted: string;
  tags: string[];
  source: string;
  url: string;
  description: string;
  fitBreakdown?: { skills: number; titleDomain: number; seniority: number; location: number };
};

function buildSpec(parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(" ");
}

type SearchInput = {
  role: string;
  location?: string;
  limit?: number;
  experienceRoles?: string[];
  expertise?: string[];
  credentials?: string[];
  languages?: string[];
  yearsExperience?: number;
  adzunaAppId?: string;
  adzunaAppKey?: string;
};

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const TRUSTED_BOARDS = [
  { host: "careers24.com", label: "Careers24", siteQuery: "careers24.com" },
  { host: "pnet.co.za", label: "PNet", siteQuery: "pnet.co.za" },
  { host: "careerjunction.co.za", label: "CareerJunction", siteQuery: "careerjunction.co.za" },
  { host: "indeed.co.za", label: "Indeed SA", siteQuery: "indeed.co.za" },
  { host: "za.indeed.com", label: "Indeed SA", siteQuery: "za.indeed.com" },
  { host: "offerzen.com", label: "OfferZen", siteQuery: "offerzen.com" },
  { host: "linkedin.com", label: "LinkedIn", siteQuery: "linkedin.com/jobs" },
  { host: "jobmail.co.za", label: "JobMail", siteQuery: "jobmail.co.za" },
  { host: "adzuna.co.za", label: "Adzuna", siteQuery: "adzuna.co.za" },
  { host: "executiveplacements.com", label: "Executive Placements", siteQuery: "executiveplacements.com" },
] as const;

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#xA0;/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function hashId(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 1_000_000_000 || 1;
}

function hostAllowed(hostname: string): (typeof TRUSTED_BOARDS)[number] | undefined {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return TRUSTED_BOARDS.find(
    (board) => host === board.host || host.endsWith(`.${board.host}`),
  );
}

function looksLikeListingUrl(url: string): boolean {
  return /(?:-id-\d+|job-\d+\.aspx|\/jobs\/adverts\/|\/viewjob\?|\/jobs\/view\/|\/job\/\d+|\/jobs--.+--\d+-inline\.html|[?&](?:jk|vjk)=[a-z0-9]+)/i.test(
    url,
  );
}

function toBoardSlug(value: string): string {
  return value
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function formatPostedDate(iso?: string): string {
  if (!iso) return "Date unavailable";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function extractJsonArray(html: string, key: string): unknown[] {
  const marker = `"${key}":[`;
  const start = html.indexOf(marker);
  if (start < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = start + marker.length - 1; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return [];
  try {
    const parsed = JSON.parse(html.slice(start + `"${key}":`.length, end));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeIndeedUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (!host.endsWith("indeed.com") && !host.endsWith("indeed.co.za")) return null;
    const jk = parsed.searchParams.get("jk") || parsed.searchParams.get("vjk");
    if (jk) return `https://za.indeed.com/viewjob?jk=${encodeURIComponent(jk)}`;
    if (/\/viewjob/i.test(parsed.pathname)) {
      return `https://za.indeed.com${parsed.pathname}${parsed.search}`;
    }
    return null;
  } catch {
    return null;
  }
}

function postedTime(posted: string): number {
  const absolute = Date.parse(posted);
  if (Number.isFinite(absolute)) return Math.min(absolute, Date.now());
  const relative = posted.match(/(?:posted\s+)?(\d+)\s*(hour|day|week|month)s?\s+ago/i);
  if (relative) {
    const days = { hour: 1 / 24, day: 1, week: 7, month: 30 }[relative[2].toLowerCase() as "hour" | "day" | "week" | "month"];
    return Date.now() - Number(relative[1]) * days * 86_400_000;
  }
  return /today|just now/i.test(posted) ? Date.now() : -1;
}

function rankJobs(jobs: LiveJobListing[]): LiveJobListing[] {
  return jobs.sort((a, b) => postedTime(b.posted) - postedTime(a.posted) || b.match - a.match);
}

function decodeDuckDuckGoUrl(raw: string): string | null {
  try {
    const absolute = decodeEntities(raw.startsWith("http") ? raw : `https:${raw}`);
    const parsed = new URL(absolute);
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    if (parsed.hostname.includes("duckduckgo.com")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s+[-|–]\s+(Careers24|PNet|Indeed|LinkedIn|CareerJunction|OfferZen|JobMail|Adzuna).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreListing(role: string, location: string | undefined, title: string, snippet: string): number {
  let score = 72;
  const haystack = `${title} ${snippet}`.toLowerCase();
  for (const word of role.toLowerCase().split(/\s+/).filter((part) => part.length > 2)) {
    if (haystack.includes(word)) score += 5;
  }
  if (location && haystack.includes(location.toLowerCase())) score += 8;
  if (/cape town|johannesburg|gauteng|durban|hybrid|remote|south africa/i.test(haystack)) score += 3;
  return Math.min(99, score);
}

async function fetchHtml(url: string, timeoutMs = 12000): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-ZA,en;q=0.9",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function searchJobMail(role: string, location?: string): Promise<LiveJobListing[]> {
  const params = new URLSearchParams({ q: role });
  if (location && location !== "Hybrid") params.set("l", location);
  const html = await fetchHtml(`https://www.jobmail.co.za/jobs?${params.toString()}`);
  if (!html) return [];

  const results: LiveJobListing[] = [];
  const blocks = html.split(/class="results-item tablinks"/).slice(1);

  for (const block of blocks) {
    const link = block.match(/href="(\/jobs\/[^"]+-id-\d+)"[\s\S]*?<h3>([\s\S]*?)<\/h3>/i);
    if (!link) continue;
    const [, path, titleRaw] = link;
    const title = stripHtml(titleRaw);
    if (!title) continue;

    const posted = stripHtml(block.match(/job-posted">([^<]+)</i)?.[1] || "") || "Date unavailable";
    const salaryRaw = stripHtml(block.match(/job-info"><b>([\s\S]*?)<\/b>/i)?.[1] || "");
    const jobLocation =
      stripHtml(block.match(/job-location">([^<]+)</i)?.[1] || "") || "South Africa";
    const company =
      stripHtml(block.match(/class="recruiter">\s*([\s\S]*?)\s*<\/span>/i)?.[1] || "") ||
      "Hiring company";
    const url = `https://www.jobmail.co.za${path}`;
    const salary = salaryRaw || "See listing";
    const description = buildSpec([
      `${title} at ${company}.`,
      `Location: ${jobLocation}.`,
      salary !== "See listing" ? `Salary: ${salary}.` : undefined,
      `Posted ${posted}.`,
      "Open the listing on JobMail for the full job specification and to apply.",
    ]);

    results.push({
      id: hashId(url),
      title,
      company,
      location: jobLocation,
      sector: "Live listing",
      salary,
      match: scoreListing(role, location, title, `${company} ${jobLocation}`),
      posted,
      tags: ["JobMail", "Trusted board"],
      source: "JobMail",
      url,
      description,
    });
    if (results.length >= 6) break;
  }

  return results;
}

async function searchCareerJunction(role: string, location?: string): Promise<LiveJobListing[]> {
  const params = new URLSearchParams({
    keywords: role,
    SortBy: "Date",
  });
  if (location && location !== "Hybrid") params.set("location", location);
  const html = await fetchHtml(`https://www.careerjunction.co.za/jobs?${params.toString()}`);
  if (!html) return [];

  const results: LiveJobListing[] = [];
  const blocks = html.split(/class="module job-result/).slice(1);

  for (const block of blocks) {
    const link = block.match(
      /<a[^>]*jobId="(\d+)"[^>]*href="([^"]+-job-\d+\.aspx)"[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!link) continue;
    const [, jobId, path, titleRaw] = link;
    const title = stripHtml(titleRaw);
    if (!title) continue;

    const company =
      stripHtml(block.match(/job-result-title[\s\S]*?<h3>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "") ||
      "Hiring company";
    const jobLocation =
      stripHtml(block.match(/class="location"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "") ||
      "South Africa";
    const salaryRaw = stripHtml(block.match(/class="salary">([^<]+)</i)?.[1] || "");
    const posted =
      stripHtml(block.match(/class="updated-time">([^<]+)</i)?.[1] || "") || "Date unavailable";
    const position = stripHtml(block.match(/class="position">([^<]+)</i)?.[1] || "");
    const expires = stripHtml(block.match(/class="expires">([^<]+)</i)?.[1] || "");
    const salary =
      !salaryRaw || /undisclosed/i.test(salaryRaw) ? "See listing" : salaryRaw;
    const url = `https://www.careerjunction.co.za${decodeEntities(path)}`;
    const description = buildSpec([
      `${title} with ${company}.`,
      position ? `Contract type: ${position}.` : undefined,
      `Location: ${jobLocation}.`,
      salary !== "See listing" ? `Salary: ${salary}.` : "Salary: undisclosed on the listing preview.",
      posted,
      expires || undefined,
      "Open CareerJunction for the full job specification and application form.",
    ]);

    results.push({
      id: hashId(`${jobId}:${url}`),
      title,
      company,
      location: jobLocation,
      sector: "Live listing",
      salary,
      match: scoreListing(role, location, title, `${company} ${jobLocation}`),
      posted,
      tags: ["CareerJunction", "Trusted board"],
      source: "CareerJunction",
      url,
      description,
    });
    if (results.length >= 6) break;
  }

  return results;
}

async function searchPNet(role: string, location?: string): Promise<LiveJobListing[]> {
  const where = location && location !== "Hybrid" ? location : undefined;
  const urls = where
    ? [
        `https://www.pnet.co.za/jobs/${toBoardSlug(role)}-jobs-in-${toBoardSlug(where)}`,
        `https://www.pnet.co.za/jobs/?search=${encodeURIComponent(role)}&location=${encodeURIComponent(where)}`,
      ]
    : [`https://www.pnet.co.za/jobs/?search=${encodeURIComponent(role)}`];

  for (const url of urls) {
    const html = await fetchHtml(url, 7000);
    if (!html) continue;
    const items = extractJsonArray(html, "items") as Array<{
      id?: number | string;
      title?: string;
      companyName?: string;
      location?: string;
      url?: string;
      salary?: string;
      datePosted?: string;
      textSnippet?: string;
    }>;
    if (items.length === 0) continue;

    const results: LiveJobListing[] = [];
    for (const item of items) {
      const title = cleanTitle(stripHtml(item.title || ""));
      if (!title) continue;
      const path = item.url?.split("?")[0];
      if (!path || !/\/jobs--.+--\d+-inline\.html/i.test(path)) continue;
      const jobUrl = path.startsWith("http") ? path : `https://www.pnet.co.za${path}`;
      const company = stripHtml(item.companyName || "Hiring company");
      const jobLocation = stripHtml(item.location || "South Africa");
      const salary = stripHtml(item.salary || "") || "See listing";
      const snippet = stripHtml(item.textSnippet || "").slice(0, 420);
      const posted = formatPostedDate(item.datePosted);

      results.push({
        id: hashId(String(item.id ?? jobUrl)),
        title,
        company,
        location: jobLocation,
        sector: "Live listing",
        salary,
        match: scoreListing(role, location, title, `${company} ${jobLocation} ${snippet}`),
        posted,
        tags: ["PNet", "Trusted board"],
        source: "PNet",
        url: jobUrl,
        description: buildSpec([
          `${title} at ${company}.`,
          `Location: ${jobLocation}.`,
          salary !== "See listing" ? `Salary: ${salary}.` : undefined,
          `Posted ${posted}.`,
          snippet || undefined,
          "Open PNet for the full job specification and to apply.",
        ]),
      });
      if (results.length >= 6) break;
    }

    if (results.length > 0) return results;
  }

  return [];
}

async function searchIndeed(role: string, location?: string): Promise<LiveJobListing[]> {
  const where = location && location !== "Hybrid" ? location : "South Africa";
  const queries = [
    `${role} ${where} site:za.indeed.com`,
    `${role} jobs ${where} site:za.indeed.com/viewjob`,
    `"${role}" "${where}" site:za.indeed.com`,
  ];

  const results: LiveJobListing[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    const html = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    if (!html) continue;

    const linkPattern =
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetPattern = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi;
    const snippets = [...html.matchAll(snippetPattern)].map((match) => stripHtml(match[1]));

    let index = 0;
    for (const match of html.matchAll(linkPattern)) {
      const decoded = decodeDuckDuckGoUrl(match[1]);
      index += 1;
      if (!decoded) continue;

      const normalized = normalizeIndeedUrl(decoded);
      const fallbackSearch =
        !normalized && /indeed\.(com|co\.za)/i.test(decoded)
          ? `https://za.indeed.com/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(where)}&sort=date`
          : null;
      const jobUrl = normalized || fallbackSearch;
      if (!jobUrl) continue;
      if (seen.has(jobUrl)) continue;
      seen.add(jobUrl);

      let title = cleanTitle(stripHtml(match[2]));
      title = title
        .replace(/\s+jobs?\s+in\s+.+$/i, "")
        .replace(/\s+-\s+Indeed.*$/i, "")
        .trim();
      if (!title || title.length < 5) title = role;
      if (/\b\d+\+?\s+.*\bjobs\b|\bjobs,?\s+employment\b|\bjob vacancies\b/i.test(title)) continue;

      // Prefer concrete listings (jk/viewjob) over generic search pages.
      const isConcrete = Boolean(normalized);
      const snippet = snippets[index - 1] ?? "";
      const jobLocation = where === "South Africa" || `${title} ${snippet}`.toLowerCase().includes(where.toLowerCase())
        ? where : "South Africa";
      results.push({
        id: hashId(jobUrl),
        title: isConcrete ? title : `${role} roles on Indeed SA`,
        company: isConcrete ? "Hiring company" : "Indeed SA",
        location: jobLocation,
        sector: "Live listing",
        salary: "See listing",
        match: scoreListing(role, location, title, snippet) - (isConcrete ? 0 : 8),
        posted: "Date unavailable",
        tags: ["Indeed SA", "Trusted board"],
        source: "Indeed SA",
        url: jobUrl,
        description: buildSpec([
          isConcrete ? `${title}.` : `Live Indeed SA results for ${role}.`,
          `Location: ${jobLocation}.`,
          snippet || undefined,
          "Open Indeed SA for the full job specification and to apply on the listing.",
        ]),
      });
      if (results.filter((job) => /viewjob\?jk=/i.test(job.url)).length >= 4) break;
    }
    if (results.some((job) => /viewjob\?jk=/i.test(job.url))) break;
  }

  // Search pages are useful links, but they are not individual job listings.
  return results.filter((job) => /viewjob\?jk=/i.test(job.url)).slice(0, 6);
}

async function searchLinkedIn(role: string, location?: string): Promise<LiveJobListing[]> {
  const linkedInLocation: Record<string, string> = {
    johannesburg: "Johannesburg, Gauteng, South Africa",
    "cape town": "Cape Town, Western Cape, South Africa",
    durban: "Durban, KwaZulu-Natal, South Africa",
  };
  const place = location && location !== "Hybrid"
    ? linkedInLocation[location.toLowerCase()] || location
    : "South Africa";
  const variant = role.replace(/\bimports\b/i, "import").replace(/\bexports\b/i, "export");
  const searches = [...new Set([role, variant])].flatMap((keyword) => [0, 25].map((start) => ({ keyword, start })));
  const pages = await Promise.all(searches.map(({ keyword, start }) => {
    const params = new URLSearchParams({
      keywords: keyword,
      location: place,
      start: String(start),
    });
    return fetchHtml(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params.toString()}`);
  }));
  const results: LiveJobListing[] = [];
  const seen = new Set<string>();
  for (const block of pages.flatMap((html) => html?.split(/<div class="base-card\s/).slice(1) || [])) {
    const rawUrl = block.match(/class="base-card__full-link[^"]*"\s+href="([^"]+)"/i)?.[1];
    const title = stripHtml(block.match(/class="base-search-card__title"[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "");
    if (!rawUrl || !title) continue;
    const url = decodeEntities(rawUrl).split("?")[0];
    try {
      if (!hostAllowed(new URL(url).hostname) || !/\/jobs\/view\//.test(url)) continue;
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const company = stripHtml(block.match(/class="base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/i)?.[1] || "") || "Hiring company";
    const jobLocation = stripHtml(block.match(/class="job-search-card__location"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || "") || "South Africa";
    const posted = formatPostedDate(block.match(/<time[^>]*datetime="([^"]+)"/i)?.[1]);
    results.push({
      id: hashId(url), title, company, location: jobLocation,
      sector: "Live listing", salary: "See listing",
      match: scoreListing(role, location, title, `${company} ${jobLocation}`),
      posted, tags: ["LinkedIn", "Trusted board"], source: "LinkedIn", url,
      description: `${title} at ${company}. Location: ${jobLocation}. Open LinkedIn for the full job specification and to apply.`,
    });
    if (results.length >= 30) break;
  }
  const targetTerms = jobTerms(role);
  const relevant = results.sort((a, b) => {
    const coverage = (title: string) => targetTerms.filter((term) => jobTerms(title).includes(term)).length;
    return coverage(b.title) - coverage(a.title);
  }).slice(0, 20);
  return Promise.all(relevant.map(async (job) => {
    const html = await fetchHtml(job.url, 8000);
    const description = html?.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    const details = description ? stripHtml(description).slice(0, 2400) : "";
    return details.length >= 60
      ? { ...job, description: `${details} Open LinkedIn for the full job specification and to apply.` }
      : job;
  }));
}

function jobTerms(value: string): string[] {
  const aliases: Record<string, string> = {
    client: "customer", clients: "customer", customers: "customer",
    care: "service", support: "service", success: "service", services: "service",
    representative: "agent", rep: "agent", advisor: "agent",
    admin: "administration", administrator: "administration", administrative: "administration",
    importing: "import",
    managers: "manager", management: "manager",
    freight: "logistics", logistics: "logistics", broker: "freight", brokerage: "freight",
    imports: "import", export: "trade", customs: "compliance", aviation: "aviation",
    airline: "aviation", airlines: "aviation", passenger: "aviation", passengers: "aviation",
    excel: "spreadsheet", spreadsheets: "spreadsheet", tms: "transport-system", crm: "customer-system",
    coordinator: "coordination", controller: "operations", operations: "operations",
  };
  return [...new Set((value.toLowerCase().match(/[a-z]+/g) ?? [])
    .filter((word) => word.length >= 3 && !["and", "the", "for", "with", "jobs", "role"].includes(word))
    .map((word) => aliases[word] || word))];
}

export function candidateMatch(
  job: LiveJobListing,
  role: string,
  experienceRoles: string[],
  expertise: string[],
  location?: string,
  languages: string[] = [],
  yearsExperience?: number,
  credentials: string[] = [],
): { score: number; breakdown: { skills: number; titleDomain: number; seniority: number; location: number } } {
  const noFit = () => ({ score: 0, breakdown: { skills: 0, titleDomain: 0, seniority: 0, location: 0 } });
  const titleText = job.title.toLowerCase();
  const listedLanguages = languages.join(" ").toLowerCase();
  for (const language of ["german", "french", "dutch", "spanish", "portuguese", "italian", "arabic", "mandarin"]) {
    if (new RegExp(`\\b${language}\\b`, "i").test(titleText)
      && !listedLanguages.includes(language)) return noFit();
  }
  const candidateEvidence = [...expertise, ...credentials].join(" ");
  const regulatedRoleGuards = [
    {
      job: /\b(?:professional|registered|enrolled)?\s*nurse\b|\bnursing specialist\b|\bnurse practitioner\b|\bmidwi(?:fe|ves)\b/i,
      credential: /\bSANC\b|South African Nursing Council|registered (?:professional )?nurse|nursing council registration/i,
    },
    {
      job: /\bprofessional accountant\b|\bchartered accountant\b|\bregistered auditor\b|\bCA\s*\(?SA\)?\b/i,
      credential: /\bSAICA\b|\bSAIPA\b|\bCA\s*\(?SA\)?\b|\bACCA\b|\bCIMA\b|\bAGA\s*\(?SA\)?\b|registered auditor|IRBA/i,
    },
    {
      job: /\bprofessional engineer\b|\bregistered engineer\b|\bPr\.?\s*Eng\.?\b|\bECSA registration\b/i,
      credential: /\bECSA\b|\bPr\.?\s*Eng\.?\b|registered professional engineer/i,
    },
  ];
  if (regulatedRoleGuards.some(({ job: regulated, credential }) => regulated.test(`${job.title} ${job.description}`) && !credential.test(candidateEvidence))) return noFit();
  const requiredCredentialGroups = [
    { required: /\bSANC\b|South African Nursing Council|registered (?:professional )?nurse/i, candidate: /\bSANC\b|South African Nursing Council|registered (?:professional )?nurse|nursing council registration/i },
    { required: /\bSAICA\b|\bSAIPA\b|\bACCA\b|\bCIMA\b|\bIRBA\b|\bCA\s*\(?SA\)?\b|\bAGA\s*\(?SA\)?\b/i, candidate: /\bSAICA\b|\bSAIPA\b|\bACCA\b|\bCIMA\b|\bIRBA\b|\bCA\s*\(?SA\)?\b|\bAGA\s*\(?SA\)?\b|registered auditor/i },
    { required: /\bECSA\b|\bPr\.?\s*Eng\.?\b/i, candidate: /\bECSA\b|\bPr\.?\s*Eng\.?\b|registered professional engineer/i },
    { required: /(?:valid|current|code [A-E])[^.]{0,35}\bdriver'?s? licen[cs]e\b|\bdriver'?s? licen[cs]e\b[^.]{0,35}(?:required|essential|mandatory)/i, candidate: /driver'?s? licen[cs]e|code [A-E]\b/i },
  ];
  const jobRequirementText = `${job.title} ${job.description}`;
  if (requiredCredentialGroups.some(({ required, candidate }) => required.test(jobRequirementText) && !candidate.test(candidateEvidence))) return noFit();
  const wantedLocation = location?.toLowerCase().trim();
  if (wantedLocation && !["south africa", "all south africa", "hybrid"].includes(wantedLocation)) {
    const listedLocation = job.location.toLowerCase();
    const aliases: Record<string, string[]> = {
      johannesburg: ["johannesburg", "sandton", "randburg", "rosebank"],
      "cape town": ["cape town"],
      durban: ["durban", "umhlanga"],
      pretoria: ["pretoria", "tshwane"],
    };
    if (!listedLocation.includes(wantedLocation)
      && !(aliases[wantedLocation] ?? []).some((alias) => listedLocation.includes(alias))
      && locationFitScore(location, job.location) === 0) return noFit();
  }
  const titleTerms = new Set(jobTerms(job.title));
  const evidenceTerms = new Set(jobTerms(`${job.title} ${job.description} ${job.sector}`));
  const overlap = (needles: string[], haystack: Set<string>) => needles.length
    ? needles.filter((term) => haystack.has(term)).length / needles.length
    : 0;
  const targetTerms = jobTerms(role);
  const historyTerms = experienceRoles.flatMap(jobTerms);
  const targetTitleFit = overlap(targetTerms, titleTerms);
  const historyDomainFit = overlap(historyTerms, evidenceTerms);
  const titleDomain = Math.round(Math.min(1, Math.max(targetTitleFit * 0.75, targetTitleFit * 0.45 + historyDomainFit * 0.55)) * 100);
  const candidateSkillTerms = [...new Set(expertise.flatMap(jobTerms))];
  const skills = candidateSkillTerms.length
    ? Math.round(overlap(candidateSkillTerms, evidenceTerms) * 100)
    : 0;
  const seniorTerms = `${job.title} ${job.description}`.toLowerCase();
  const candidateLeadership = experienceRoles.some((item) => /\b(head|director|executive|senior manager|chief|team lead|supervisor)\b/i.test(item));
  const candidateBaseSeniority = yearsExperience === undefined
    ? (experienceRoles.length ? 52 : 35)
    : yearsExperience <= 1 ? 38 : yearsExperience <= 3 ? 58 : yearsExperience <= 7 ? 76 : 90;
  let seniority = candidateLeadership ? Math.max(candidateBaseSeniority, 88) : candidateBaseSeniority;
  const listingSenior = /\b(head|director|executive|chief|senior manager|team manager|senior lead)\b/i.test(seniorTerms);
  const listingJunior = /\b(entry[- ]level|graduate|junior|trainee|intern(ship)?)\b/i.test(seniorTerms);
  if (listingSenior) seniority = candidateLeadership || (yearsExperience ?? 0) >= 7 ? Math.max(seniority, 88) : Math.min(seniority, 30);
  else if (listingJunior) seniority = candidateLeadership || (yearsExperience ?? 0) >= 7 ? 35 : Math.max(seniority, 78);
  const requiredYears = seniorTerms.match(/\b(\d+)\s*(?:\+|to|-)?\s*(?:years?|yrs?)\b/i);
  if (requiredYears && yearsExperience !== undefined) {
    const minimum = Number(requiredYears[1]);
    if (minimum > yearsExperience + 3) seniority = Math.min(seniority, 35);
    else if (yearsExperience < minimum) seniority = Math.min(seniority, 55);
    else seniority = Math.max(seniority, 88);
  } else if (requiredYears && yearsExperience === undefined) {
    seniority = Math.min(seniority, Number(requiredYears[1]) >= 5 ? 28 : 45);
  }
  const locationScore = locationFitScore(location, job.location);
  if (titleDomain < 20 || locationScore === 0) return { score: 0, breakdown: { skills, titleDomain, seniority, location: locationScore } };
  const score = Math.max(0, Math.min(99, Math.round(
    skills * 0.4 + titleDomain * 0.3 + seniority * 0.2 + locationScore * 0.1,
  )));
  return { score, breakdown: { skills, titleDomain, seniority, location: locationScore } };
}

function locationFitScore(wanted?: string, listed = ""): number {
  const target = wanted?.toLowerCase().trim();
  const actual = listed.toLowerCase();
  if (!target || ["south africa", "all south africa"].includes(target)) return 50;
  if (actual.includes(target)) return 100;
  const nearby: Record<string, string[]> = {
    gauteng: ["johannesburg", "kempton park", "benoni", "pretoria", "sandton", "midrand", "germiston", "edenvale"],
    johannesburg: ["sandton", "randburg", "rosebank", "kempton park", "benoni", "germiston", "edenvale"],
    "kempton park": ["johannesburg", "benoni", "edenvale", "germiston"],
    benoni: ["johannesburg", "kempton park", "germiston", "edenvale"],
    pretoria: ["tshwane", "centurion", "midrand", "johannesburg"],
    "cape town": ["bellville", "stellenbosch", "paarl"],
    durban: ["umhlanga", "pinetown", "isithebe"],
  };
  if ((nearby[target] ?? []).some((region) => actual.includes(region))) return 85;
  if (/\bremote\b/i.test(actual)) return 80;
  if (/south africa|gauteng|johannesburg|cape town|durban|pretoria/i.test(actual)) return 45;
  return 0;
}

const ROLE_QUERY_ALIASES: Array<{ match: RegExp; titles: string[] }> = [
  { match: /site agent|site manager|construction|foreman|civil|quantity surveyor|built environment/i, titles: ["Site Agent", "Construction Site Manager", "Civil Project Manager"] },
  { match: /freight|import|export|logistic|transport/i, titles: ["Freight Controller", "Import/Export Operations Controller", "Road Freight Coordinator"] },
  { match: /aviation|airline|airport|cabin|passenger/i, titles: ["Aviation Customer Service Agent", "Airport Passenger Services Agent", "Airline Operations Coordinator"] },
  { match: /customer service|customer support|call.?centre/i, titles: ["Customer Service Representative", "Client Support Specialist", "Customer Care Agent"] },
  { match: /credit|collection|accounts receivable/i, titles: ["Credit Controller", "Collections Specialist", "Accounts Receivable Clerk"] },
];

export function optimizeJobSearchQuery(role: string): string {
  const normalized = role.trim();
  const matched = ROLE_QUERY_ALIASES.find(({ match }) => match.test(normalized));
  if (!matched) return normalized;
  const unique = [...new Set([normalized, ...matched.titles])].slice(0, 4);
  return unique.map((title) => `"${title}"`).join(" OR ");
}

function boardSearchLinks(role: string, location?: string) {
  const where = location && location !== "Hybrid" ? location : "South Africa";
  return [
    { board: "CareerJunction", url: `https://www.careerjunction.co.za/jobs?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(where)}` },
    { board: "JobMail", url: `https://www.jobmail.co.za/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(where)}` },
    { board: "Careers24", url: `https://www.careers24.com/jobs/?keywords=${encodeURIComponent(role)}` },
    { board: "Adzuna", url: `https://www.adzuna.co.za/search?q=${encodeURIComponent(role)}&w=${encodeURIComponent(where)}` },
    { board: "OfferZen", url: "https://www.offerzen.com/jobs" },
    { board: "Executive Placements", url: "https://www.executiveplacements.com/" },
  ];
}

async function searchBoardViaDuckDuckGo(
  board: (typeof TRUSTED_BOARDS)[number],
  role: string,
  location?: string,
): Promise<LiveJobListing[]> {
  const where = location && location !== "Hybrid" ? location : "South Africa";
  const query = `${role} jobs ${where} site:${board.siteQuery}`;
  const html = await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!html) return [];

  const results: LiveJobListing[] = [];
  const linkPattern =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetPattern = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi;
  const snippets = [...html.matchAll(snippetPattern)].map((match) => stripHtml(match[1]));

  let index = 0;
  for (const match of html.matchAll(linkPattern)) {
    const decoded = decodeDuckDuckGoUrl(match[1]);
    if (!decoded) continue;
    let parsed: URL;
    try {
      parsed = new URL(decoded);
    } catch {
      continue;
    }
    const trusted = hostAllowed(parsed.hostname);
    if (!trusted) continue;
    if (!looksLikeListingUrl(decoded)) continue;

    const title = cleanTitle(stripHtml(match[2]));
    if (!title || title.length < 8) continue;

    const snippet = snippets[index] ?? "";
    index += 1;
    const jobLocation = where === "South Africa" || `${title} ${snippet}`.toLowerCase().includes(where.toLowerCase())
      ? where : "South Africa";
    results.push({
      id: hashId(decoded),
      title,
      company: "Hiring company",
      location: jobLocation,
      sector: "Live listing",
      salary: "See listing",
      match: scoreListing(role, location, title, snippet),
      posted: "Date unavailable",
      tags: [trusted.label, "Trusted board"],
      source: trusted.label,
      url: decoded.split("#")[0],
      description: buildSpec([
        `${title}.`,
        `Location: ${jobLocation}.`,
        snippet || undefined,
        `Open the full job specification on ${trusted.label} to apply.`,
      ]),
    });
    if (results.length >= 3) break;
  }

  return results;
}

async function searchViaAdzuna(
  role: string,
  location?: string,
  credentials?: { appId?: string; appKey?: string },
): Promise<LiveJobListing[]> {
  // The API server has process.env; Cloudflare Workers only have env bindings.
  const appId = credentials?.appId || (typeof process !== "undefined" ? process.env.ADZUNA_APP_ID : undefined);
  const appKey = credentials?.appKey || (typeof process !== "undefined" ? process.env.ADZUNA_APP_KEY : undefined);
  if (!appId || !appKey) return [];

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "12",
    what: role,
    content_type: "application/json",
    max_days_old: "30",
    sort_by: "date",
  });
  if (location && location !== "Hybrid") params.set("where", location);

  try {
    const response = await fetch(
      `https://api.adzuna.com/v1/api/jobs/za/search/1?${params.toString()}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      results?: Array<{
        id?: string | number;
        title?: string;
        company?: { display_name?: string };
        location?: { display_name?: string };
        salary_min?: number;
        salary_max?: number;
        created?: string;
        redirect_url?: string;
        category?: { label?: string };
        description?: string;
      }>;
    };

    return (payload.results ?? [])
      .map((job): LiveJobListing | null => {
        const url = job.redirect_url || "";
        if (!url) return null;
        let host = "";
        try {
          host = new URL(url).hostname;
        } catch {
          return null;
        }
        const trusted = hostAllowed(host) ?? {
          host: "adzuna.co.za",
          label: "Adzuna" as const,
          siteQuery: "adzuna.co.za",
        };
        const title = job.title?.trim();
        if (!title) return null;
        const salary =
          job.salary_min && job.salary_max
            ? `R${Math.round(job.salary_min / 1000)}k – R${Math.round(job.salary_max / 1000)}k / year`
            : "See listing";
        const descriptionText = stripHtml(job.description || "").slice(0, 520);
        return {
          id: hashId(String(job.id ?? url)),
          title,
          company: job.company?.display_name || "Hiring company",
          location: job.location?.display_name || "South Africa",
          sector: job.category?.label || "Live listing",
          salary,
          match: scoreListing(role, location, title, job.description || ""),
          posted: formatPostedDate(job.created),
          tags: [trusted.label, "Live listing", "Trusted board"],
          source: trusted.label,
          url,
          description: buildSpec([
            `${title} at ${job.company?.display_name || "the hiring company"}.`,
            `Location: ${job.location?.display_name || "South Africa"}.`,
            descriptionText || undefined,
            "Open Adzuna for the full job specification and to apply on the source board.",
          ]),
        };
      })
      .filter((job): job is LiveJobListing => job !== null);
  } catch {
    return [];
  }
}

export async function searchTrustedJobBoards(input: SearchInput): Promise<{
  jobs: LiveJobListing[];
  queriedBoards: string[];
  liveResults: boolean;
  query: string;
  boardSearchLinks: Array<{ board: string; url: string }>;
}> {
  const role = input.role.trim() || "Professional";
  const location = input.location?.trim();
  const limit = input.limit ?? 6;
  const optimizedRoleQuery = optimizeJobSearchQuery(role);
  const query = [optimizedRoleQuery, location || "South Africa"].filter(Boolean).join(" · ");
  const queriedBoards = ["Indeed SA", "PNet", "LinkedIn"];
  const expertise = [...new Set((input.expertise ?? [])
    .map((term) => term.trim())
    .filter((term) => term.length >= 4))].slice(0, 20);
  const deduped = new Map<string, LiveJobListing>();
  const addMatches = (jobs: LiveJobListing[]) => {
    for (const job of jobs) {
      const fit = candidateMatch(job, role, input.experienceRoles ?? [], expertise, location, input.languages, input.yearsExperience, input.credentials ?? []);
      const match = fit.score;
      if (match < 40) continue;
      const key = job.company !== "Hiring company"
        ? `${job.title.toLowerCase()}|${job.company.toLowerCase()}|${job.location.toLowerCase()}`
        : job.url.toLowerCase();
      const scored = { ...job, match, fitBreakdown: fit.breakdown };
      const existing = deduped.get(key);
      if (!existing || postedTime(scored.posted) > postedTime(existing.posted)) deduped.set(key, scored);
    }
  };

  // A blocked or changed board must not discard results from every other board.
  const settled = await Promise.allSettled([
    searchIndeed(optimizedRoleQuery, location),
    searchPNet(optimizedRoleQuery, location),
    searchLinkedIn(optimizedRoleQuery, location),
    searchBoardViaDuckDuckGo(TRUSTED_BOARDS[1], optimizedRoleQuery, location),
  ]);
  for (const result of settled) {
    if (result.status === "fulfilled") addMatches(result.value);
  }

  const priorityJobs = rankJobs([...deduped.values()]).slice(0, limit);
  if (priorityJobs.length < limit) {
    const fallbackBoards = TRUSTED_BOARDS.filter((board) =>
      !["Indeed SA", "PNet", "LinkedIn"].includes(board.label));
    queriedBoards.push(...[...new Set(fallbackBoards.map((board) => board.label))]);
    const fallback = await Promise.allSettled([
      searchCareerJunction(optimizedRoleQuery, location),
      searchJobMail(optimizedRoleQuery, location),
      searchViaAdzuna(optimizedRoleQuery, location, { appId: input.adzunaAppId, appKey: input.adzunaAppKey }),
      ...fallbackBoards.map((board) => searchBoardViaDuckDuckGo(board, optimizedRoleQuery, location)),
    ]);
    for (const result of fallback) {
      if (result.status === "fulfilled") addMatches(result.value);
    }
  }
  const preferred = rankJobs([...deduped.values()].filter((job) =>
    ["Indeed SA", "PNet", "LinkedIn"].includes(job.source))).slice(0, limit);
  const other = rankJobs([...deduped.values()].filter((job) =>
    !["Indeed SA", "PNet", "LinkedIn"].includes(job.source))).slice(0, limit - preferred.length);
  const ranked = [...preferred, ...other];

  return {
    jobs: ranked,
    queriedBoards,
    liveResults: ranked.length > 0,
    query,
    boardSearchLinks: boardSearchLinks(role, location),
  };
}

export function getTrustedBoardLabels(): string[] {
  return [...new Set(TRUSTED_BOARDS.map((board) => board.label))];
}
