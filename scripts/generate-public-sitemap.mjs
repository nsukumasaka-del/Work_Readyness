import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const siteOrigin = 'https://www.bonlist.site';
const careerSource = await readFile(resolve(root, 'artifacts/careerbridge-sa/src/content/career-advice.ts'), 'utf8');
const jobsSource = await readFile(resolve(root, 'artifacts/careerbridge-sa/src/content/public-jobs.ts'), 'utf8');

const articleEntries = [...careerSource.matchAll(/\{\s*\r?\n\s*slug:\s*'([^']+)'[\s\S]*?\r?\n\s*updatedAt:\s*'(\d{4}-\d{2}-\d{2})'/g)]
  .map(([, slug, updatedAt]) => ({ path: `/career-advice/${slug}`, updatedAt }));
const jobEntries = [...jobsSource.matchAll(/\{\s*\r?\n\s*slug:\s*'([^']+)'/g)]
  .map(([, slug]) => ({ path: `/jobs/${slug}` }));

if (!articleEntries.length || !jobEntries.length) {
  throw new Error('Sitemap generation found no public content. Check the content source format.');
}

const staticPaths = [
  '/', '/pricing', '/career-advice', '/jobs/explore', '/about', '/contact', '/privacy',
  '/terms', '/cookies', '/data', '/advertise',
];
const entries = [
  ...staticPaths.map((path) => ({ path })),
  ...articleEntries,
  ...jobEntries,
];
const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries.map(({ path, updatedAt }) => `  <url><loc>${siteOrigin}${path}</loc>${updatedAt ? `<lastmod>${updatedAt}</lastmod>` : ''}</url>`),
  '</urlset>',
  '',
].join('\n');

await writeFile(resolve(root, 'artifacts/careerbridge-sa/public/sitemap.xml'), xml, 'utf8');
console.log(`Generated sitemap.xml with ${entries.length} public URLs.`);
