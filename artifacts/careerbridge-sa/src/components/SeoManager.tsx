import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { DEFAULT_SOCIAL_IMAGE, SITE_ORIGIN, seoForPath } from '@/lib/seo-policy';

const STRUCTURED_DATA_ID = 'bonlist-route-structured-data';

function setMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element?.setAttribute(name, value));
}

export function SeoManager() {
  const [location] = useLocation();

  useEffect(() => {
    const pathname = location.split('?')[0] || '/';
    const state = seoForPath(pathname);
    const canonicalUrl = state.canonicalPath ? `${SITE_ORIGIN}${state.canonicalPath}` : undefined;

    document.title = state.title;
    setMeta('meta[name="description"]', { name: 'description', content: state.description });
    setMeta('meta[name="robots"]', { name: 'robots', content: state.robots });
    setMeta('meta[property="og:title"]', { property: 'og:title', content: state.title });
    setMeta('meta[property="og:description"]', { property: 'og:description', content: state.description });
    setMeta('meta[property="og:type"]', { property: 'og:type', content: state.type || 'website' });
    setMeta('meta[property="og:image"]', { property: 'og:image', content: DEFAULT_SOCIAL_IMAGE });
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: state.title });
    setMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: state.description });
    setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' });

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonicalUrl) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.rel = 'canonical';
        document.head.appendChild(canonical);
      }
      canonical.href = canonicalUrl;
      setMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
    } else {
      canonical?.remove();
      document.head.querySelector('meta[property="og:url"]')?.remove();
    }

    document.getElementById(STRUCTURED_DATA_ID)?.remove();
    if (state.structuredData?.length) {
      const script = document.createElement('script');
      script.id = STRUCTURED_DATA_ID;
      script.type = 'application/ld+json';
      script.text = JSON.stringify(state.structuredData.length === 1 ? state.structuredData[0] : state.structuredData);
      document.head.appendChild(script);
    }
  }, [location]);

  return null;
}
