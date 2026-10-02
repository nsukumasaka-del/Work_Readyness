import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { ADVICE_CATEGORIES, CAREER_ARTICLES, adviceCategorySlug } from '../artifacts/careerbridge-sa/src/content/career-advice';
import { PUBLIC_JOB_CATEGORIES } from '../artifacts/careerbridge-sa/src/content/public-jobs';
import { isKnownAppPath, seoForPath } from '../artifacts/careerbridge-sa/src/lib/seo-policy';
import { advertisingAllowedForPath, isAdvertisingContentPath } from '../artifacts/careerbridge-sa/src/lib/advertising';
import { renderRouteHtml } from '../workers/public-html';
import { CONSENT_STORAGE_KEY, CONSENT_UPDATED_EVENT, readConsentPreferences, saveConsentPreferences } from '../artifacts/careerbridge-sa/src/lib/consent';

const root = resolve(import.meta.dirname, '..');

test('sitemap contains only unique canonical public URLs', async () => {
  const sitemap = await readFile(resolve(root, 'artifacts/careerbridge-sa/public/sitemap.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.ok(urls.length >= 20);
  assert.equal(new Set(urls).size, urls.length);
  const metadata = urls.map((value) => seoForPath(new URL(value).pathname));
  assert.equal(new Set(metadata.map((state) => state.title)).size, urls.length);
  assert.equal(new Set(metadata.map((state) => state.description)).size, urls.length);
  for (const value of urls) {
    const url = new URL(value);
    assert.equal(url.origin, 'https://www.bonlist.site');
    const state = seoForPath(url.pathname);
    assert.equal(state.robots, 'index, follow', `${url.pathname} must be indexable`);
    assert.equal(state.canonicalPath, url.pathname);
    assert.ok(state.title.length > 20);
    assert.ok(state.description.length > 50);
  }
});

test('private, thin, and unknown routes cannot be indexed', () => {
  for (const path of ['/admin', '/dashboard', '/cv-builder', '/diagnostic', '/jobs', '/job-matches', '/checkout']) {
    const state = seoForPath(path);
    assert.equal(state.robots, 'noindex, nofollow', path);
    assert.equal(state.canonicalPath, undefined, path);
    assert.equal(state.fallbackHtml, undefined, path);
  }
  assert.equal(seoForPath(`/career-advice/category/${adviceCategorySlug(ADVICE_CATEGORIES[0]!)}`).robots, 'noindex, follow');
  assert.equal(isKnownAppPath('/definitely-not-a-real-page'), false);
});

test('articles and public job guides expose useful server-rendered fallback content', () => {
  for (const article of CAREER_ARTICLES) {
    const state = seoForPath(`/career-advice/${article.slug}`);
    assert.ok(state.fallbackHtml?.includes('<h1>'));
    assert.ok(state.structuredData?.some((entry) => (entry as { '@type'?: string })['@type'] === 'Article'));
  }
  for (const category of PUBLIC_JOB_CATEGORIES) {
    const state = seoForPath(`/jobs/${category.slug}`);
    assert.ok(state.fallbackHtml?.includes('Common roles'));
    assert.ok(!JSON.stringify(state.structuredData).includes('JobPosting'));
  }
});

test('robots.txt permits public content and identifies the sitemap', async () => {
  const robots = await readFile(resolve(root, 'artifacts/careerbridge-sa/public/robots.txt'), 'utf8');
  assert.match(robots, /Allow: \/\s/);
  assert.match(robots, /Disallow: \/api\//);
  assert.doesNotMatch(robots, /Disallow: \/admin/);
  assert.match(robots, /Sitemap: https:\/\/www\.bonlist\.site\/sitemap\.xml/);
  assert.doesNotMatch(robots, /Disallow: \/career-advice/);
});

test('advertising uses an explicit public-content allowlist and stays off without real configuration', () => {
  for (const path of ['/', '/admin', '/dashboard', '/cv-builder', '/diagnostic', '/jobs', '/job-matches', '/checkout', '/login', '/account', '/does-not-exist']) {
    assert.equal(isAdvertisingContentPath(path), false, path);
    assert.equal(advertisingAllowedForPath(path), false, path);
  }
  assert.equal(isAdvertisingContentPath('/jobs/explore'), true);
  assert.equal(isAdvertisingContentPath(`/career-advice/${CAREER_ARTICLES[0]!.slug}`), true);
  assert.equal(advertisingAllowedForPath('/jobs/explore'), false);
});

test('edge HTML contains route-specific metadata and protects private pages before JavaScript runs', async () => {
  const source = await readFile(resolve(root, 'artifacts/careerbridge-sa/index.html'), 'utf8');
  const article = CAREER_ARTICLES[0]!;
  const rendered = renderRouteHtml(source, `/career-advice/${article.slug}`);
  assert.equal(rendered.status, 200);
  assert.equal(rendered.noIndex, false);
  assert.ok(rendered.html.includes(`<title>${article.seoTitle}</title>`));
  assert.ok(rendered.html.includes(`https://www.bonlist.site/career-advice/${article.slug}`));
  assert.ok(rendered.html.includes('application/ld+json'));
  assert.ok(rendered.html.includes('Frequently asked questions'));
  const privatePage = renderRouteHtml(source, '/cv-builder');
  assert.equal(privatePage.noIndex, true);
  assert.match(privatePage.html, /<meta name="robots" content="noindex, nofollow"/);
  assert.doesNotMatch(privatePage.html, /rel="canonical"/);
  assert.match(privatePage.html, /<div id="root"><\/div>/);
  assert.equal(renderRouteHtml(source, '/definitely-not-a-real-page').status, 404);
});

test('ownership verification is independent from advertising and never emitted on private routes', async () => {
  const source = await readFile(resolve(root, 'artifacts/careerbridge-sa/index.html'), 'utf8');
  // Synthetic identifiers are confined to tests; production has no default ID.
  const client = 'ca-pub-1234567890123456';
  assert.match(renderRouteHtml(source, '/', client).html, /name="google-adsense-account"/);
  assert.doesNotMatch(renderRouteHtml(source, '/cv-builder', client).html, /name="google-adsense-account"/);
  assert.doesNotMatch(renderRouteHtml(source, '/', 'invalid').html, /name="google-adsense-account"/);
});

test('all editorial internal links resolve to known public content', () => {
  for (const article of CAREER_ARTICLES) {
    for (const slug of article.relatedSlugs) {
      assert.ok(CAREER_ARTICLES.some((item) => item.slug === slug), `${article.slug}: broken related article ${slug}`);
    }
  }
  for (const path of ['/about', '/contact', '/privacy', '/terms', '/cookies', '/data', '/advertise', '/career-advice', '/jobs/explore']) {
    assert.equal(isKnownAppPath(path), true, path);
  }
});

test('accept, reject, and managed consent choices persist and notify the advertising layer', () => {
  const storage = new Map<string, string>();
  const events: Event[] = [];
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    dispatchEvent: (event: Event) => { events.push(event); return true; },
  } });
  try {
    assert.equal(readConsentPreferences(), null);
    saveConsentPreferences({ analytics: true, advertising: true });
    assert.equal(readConsentPreferences()?.advertising, true);
    saveConsentPreferences({ analytics: false, advertising: false });
    assert.equal(readConsentPreferences()?.advertising, false);
    saveConsentPreferences({ analytics: true, advertising: false });
    assert.equal(readConsentPreferences()?.analytics, true);
    assert.equal(readConsentPreferences()?.advertising, false);
    assert.ok(storage.has(CONSENT_STORAGE_KEY));
    assert.equal(events.length, 3);
    assert.ok(events.every((event) => event.type === CONSENT_UPDATED_EVENT));
    storage.set(CONSENT_STORAGE_KEY, '{invalid');
    assert.equal(readConsentPreferences(), null);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
