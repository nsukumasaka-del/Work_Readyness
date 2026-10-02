const origin = 'https://www.bonlist.site';

async function inspect(url) {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
    const body = await response.text();
    return {
      url, status: response.status,
      contentType: response.headers.get('content-type'),
      location: response.headers.get('location'),
      robotsHeader: response.headers.get('x-robots-tag'),
      title: body.match(/<title>([\s\S]*?)<\/title>/i)?.[1],
      canonical: body.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i)?.[1],
      robotsMeta: body.match(/<meta[^>]*name="robots"[^>]*content="([^"]+)"/i)?.[1],
      hasStructuredData: body.includes('application/ld+json'),
      hasH1: /<h1\b/i.test(body),
      bytes: Buffer.byteLength(body),
      ...(url.endsWith('/sitemap.xml') ? { sitemapUrls: [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]) } : {}),
    };
  } catch (error) {
    return { url, error: error.message };
  }
}

const sitemap = await inspect(`${origin}/sitemap.xml`);
console.log(JSON.stringify(sitemap));
const urls = [...new Set([
  ...(sitemap.sitemapUrls || []),
  `${origin}/robots.txt`, `${origin}/ads.txt`, `${origin}/cv-builder`,
  `${origin}/diagnostic`, `${origin}/dashboard`, `${origin}/does-not-exist`,
  'http://bonlist.site/', 'http://www.bonlist.site/', 'https://bonlist.site/',
])];
for (let offset = 0; offset < urls.length; offset += 4) {
  const results = await Promise.all(urls.slice(offset, offset + 4).map(inspect));
  results.forEach((result) => console.log(JSON.stringify(result)));
}
