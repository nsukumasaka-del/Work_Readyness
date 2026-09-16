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
  if (!iso) return "Recently listed";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Recently listed";
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

function diversifyJobs(jobs: LiveJobListing[], limit: number): LiveJobListing[] {
  const preferredSources = ["PNet", "Indeed SA", "CareerJunction", "JobMail", "Adzuna", "Careers24"];
  const picked: LiveJobListing[] = [];
  const used = new Set<string>();

  for (const source of preferredSources) {
    const hit = jobs.find((job) => job.source === source && !used.has(job.url.toLowerCase()));
    if (!hit) continue;
    picked.push(hit);
    used.add(hit.url.toLowerCase());
    if (picked.length >= limit) return picked;
  }

  for (const job of jobs) {
    if (picked.length >= limit) break;
    const key = job.url.toLowerCase();
    if (used.has(key)) continue;
    picked.push(job);
    used.add(key);
  }

  return picked;
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

    const posted = stripHtml(block.match(/job-posted">([^<]+)</i)?.[1] || "") || "Recently listed";
    const salaryRaw = stripHtml(block.match(/job-info"><b>([\s\S]*?)<\/b>/i)?.[1] || "");
    const jobLocation =
      stripHtml(block.match(/job-location">([^<]+)</i)?.[1] || "") || location || "South Africa";
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
      tags: ["JobMail", "Recently listed", "Trusted board"],
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
      location ||
      "South Africa";
    const salaryRaw = stripHtml(block.match(/class="salary">([^<]+)</i)?.[1] || "");
    const posted =
      stripHtml(block.match(/class="updated-time">([^<]+)</i)?.[1] || "") || "Recently listed";
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
      tags: ["CareerJunction", "Recently listed", "Trusted board"],
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
    const html = await fetchHtml(url, 15000);
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
      const jobLocation = stripHtml(item.location || where || "South Africa");
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
        tags: ["PNet", "Recently listed", "Trusted board"],
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

      // Prefer concrete listings (jk/viewjob) over generic search pages.
      const isConcrete = Boolean(normalized);
      const snippet = snippets[index - 1] ?? "";
      results.push({
        id: hashId(jobUrl),
        title: isConcrete ? title : `${role} roles on Indeed SA`,
        company: isConcrete ? "Hiring company" : "Indeed SA",
        location: where,
        sector: "Live listing",
        salary: "See listing",
        match: scoreListing(role, location, title, snippet) - (isConcrete ? 0 : 8),
        posted: "Recently listed",
        tags: ["Indeed SA", "Recently listed", "Trusted board"],
        source: "Indeed SA",
        url: jobUrl,
        description: buildSpec([
          isConcrete ? `${title}.` : `Live Indeed SA results for ${role}.`,
          `Location: ${where}.`,
          snippet || undefined,
          "Open Indeed SA for the full job specification and to apply on the listing.",
        ]),
      });
      if (results.filter((job) => /viewjob\?jk=/i.test(job.url)).length >= 4) break;
    }
    if (results.some((job) => /viewjob\?jk=/i.test(job.url))) break;
  }

  const concrete = results.filter((job) => /viewjob\?jk=/i.test(job.url));
  if (concrete.length > 0) return concrete.slice(0, 6);

  // Always include at least one Indeed search deep-link so Apply opens Indeed.
  if (results.length === 0) {
    const searchUrl = `https://za.indeed.com/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(where)}&sort=date`;
    return [
      {
        id: hashId(searchUrl),
        title: `${role} roles on Indeed SA`,
        company: "Indeed SA",
        location: where,
        sector: "Live listing",
        salary: "See listing",
        match: scoreListing(role, location, role, where),
        posted: "Recently listed",
        tags: ["Indeed SA", "Live search", "Trusted board"],
        source: "Indeed SA",
        url: searchUrl,
        description: buildSpec([
          `Recent ${role} openings on Indeed SA.`,
          `Location filter: ${where}.`,
          "Indeed blocks automated listing scrapes, so BonList opens their live search results for this role. Apply directly on Indeed.",
        ]),
      },
    ];
  }

  return results.slice(0, 4);
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
    results.push({
      id: hashId(decoded),
      title,
      company: "Hiring company",
      location: location || where,
      sector: "Live listing",
      salary: "See listing",
      match: scoreListing(role, location, title, snippet),
      posted: "Recently listed",
      tags: [trusted.label, "Recently listed", "Trusted board"],
      source: trusted.label,
      url: decoded.split("#")[0],
      description: buildSpec([
        `${title}.`,
        `Location: ${location || where}.`,
        snippet || undefined,
        `Open the full job specification on ${trusted.label} to apply.`,
      ]),
    });
    if (results.length >= 3) break;
  }

  return results;
}

async function searchViaAdzuna(role: string, location?: string): Promise<LiveJobListing[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
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
          location: job.location?.display_name || location || "South Africa",
          sector: job.category?.label || "Live listing",
          salary,
          match: scoreListing(role, location, title, job.description || ""),
          posted: "Recently listed",
          tags: [trusted.label, "Live listing", "Trusted board"],
          source: trusted.label,
          url,
          description: buildSpec([
            `${title} at ${job.company?.display_name || "the hiring company"}.`,
            `Location: ${job.location?.display_name || location || "South Africa"}.`,
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
}> {
  const role = input.role.trim() || "Professional";
  const location = input.location?.trim();
  const limit = input.limit ?? 6;
  const freeMatchSlots = 2;
  const query = [role, location || "South Africa"].filter(Boolean).join(" · ");
  const queriedBoards = [...new Set(TRUSTED_BOARDS.map((board) => board.label))];

  const ddgBoards = TRUSTED_BOARDS.filter((board) =>
    ["careers24.com", "linkedin.com"].includes(board.host),
  );

  const [adzunaJobs, jobMailJobs, careerJunctionJobs, pnetJobs, indeedJobs, ...boardResults] =
    await Promise.all([
      searchViaAdzuna(role, location),
      searchJobMail(role, location),
      searchCareerJunction(role, location),
      searchPNet(role, location).catch(() => [] as LiveJobListing[]),
      searchIndeed(role, location).catch(() => [] as LiveJobListing[]),
      ...ddgBoards.map((board) =>
        searchBoardViaDuckDuckGo(board, role, location).catch(() => [] as LiveJobListing[]),
      ),
    ]);

  const merged = [
    ...pnetJobs,
    ...indeedJobs,
    ...adzunaJobs,
    ...jobMailJobs,
    ...careerJunctionJobs,
    ...boardResults.flat(),
  ];
  const deduped = new Map<string, LiveJobListing>();
  for (const job of merged) {
    const key = `${job.title.toLowerCase()}|${job.company.toLowerCase()}|${job.url.toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing || job.match > existing.match) deduped.set(key, job);
  }

  const ranked = diversifyJobs(
    [...deduped.values()].sort((a, b) => b.match - a.match),
    limit,
  ).map((job, index, jobs) => {
    // Only the last two fits stay free (<90%). All stronger matches are premium-gated.
    const freeStart = Math.max(0, jobs.length - freeMatchSlots);
    const isFree = index >= freeStart;
    if (isFree) {
      return { ...job, match: Math.min(89, Math.max(62, job.match > 89 ? 89 - (index - freeStart) * 3 : job.match)) };
    }
    return { ...job, match: Math.max(90, Math.min(99, job.match < 90 ? 90 + Math.min(8, index) : job.match)) };
  });

  return {
    jobs: ranked,
    queriedBoards,
    liveResults: ranked.length > 0,
    query,
  };
}

export function getTrustedBoardLabels(): string[] {
  return [...new Set(TRUSTED_BOARDS.map((board) => board.label))];
}
