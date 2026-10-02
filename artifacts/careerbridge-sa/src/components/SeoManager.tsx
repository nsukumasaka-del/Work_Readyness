import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { findCareerArticle } from '@/content/career-advice';
import { findPublicJobCategory } from '@/content/public-jobs';

const SITE_ORIGIN = 'https://www.bonlist.site';
const DEFAULT_IMAGE = `${SITE_ORIGIN}/brand/bonlist-logo.png`;
const STRUCTURED_DATA_ID = 'bonlist-route-structured-data';

type SeoState = {
  title: string;
  description: string;
  canonicalPath?: string;
  robots: 'index, follow' | 'noindex, follow' | 'noindex, nofollow';
  type?: 'website' | 'article';
  structuredData?: unknown[];
};

const STATIC_PUBLIC_META: Record<string, Pick<SeoState, 'title' | 'description'>> = {
  '/': { title: 'BonList | CV Tools and Career Support for South Africa', description: 'Build and review your CV, prepare for interviews and find relevant South African job opportunities with BonList.' },
  '/pricing': { title: 'BonList Pricing | CV and Career Tools', description: 'Compare BonList access options for CV tools, interview preparation and the Career Accelerator programme.' },
  '/career-advice': { title: 'Career Advice for South African Job Seekers | BonList', description: 'Practical guidance for writing CVs, finding credible jobs, preparing for interviews and developing your career.' },
  '/jobs/explore': { title: 'South African Job and Application Guides | BonList', description: 'Explore South African job families and learn how to prepare stronger, accurate applications for common roles.' },
  '/about': { title: 'About BonList | South African Career Platform', description: 'Learn how BonList helps South African job seekers build clearer CVs, review applications and prepare for opportunities.' },
  '/contact': { title: 'Contact BonList | Support and Business Enquiries', description: 'Contact BonList for product support, privacy requests, recruiter enquiries and responsible advertising enquiries.' },
  '/privacy': { title: 'Privacy Policy | BonList', description: 'Read how BonList handles account information, uploaded CVs, optional technologies and privacy requests.' },
  '/terms': { title: 'Terms of Use | BonList', description: 'Read the terms that apply when using BonList career tools and services.' },
  '/cookies': { title: 'Cookie Policy and Preferences | BonList', description: 'Learn about essential and optional browser storage used by BonList and how to manage your preferences.' },
  '/data': { title: 'Data Handling and Deletion | BonList', description: 'Learn how to request access to or deletion of your BonList account and stored CV information.' },
  '/advertise': { title: 'Advertise with BonList | Business Enquiries', description: 'Enquire about future responsible advertising, featured jobs and employer opportunities on BonList.' },
};

const PRIVATE_ROUTE_PREFIXES = [
  '/admin', '/dashboard', '/my-resumes', '/profile', '/account', '/settings', '/security',
  '/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback', '/checkout',
  '/payment', '/cv-builder', '/diagnostic', '/interview', '/coaching', '/programme', '/offline-workstation',
];

function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_ORIGIN}${item.path}`,
    })),
  };
}

function seoForPath(pathname: string): SeoState {
  if (pathname === '/support') {
    return {
      title: 'BonList Support | Account and Product Help',
      description: 'Get help with your BonList account, CV workspace, privacy requests and product questions.',
      canonicalPath: '/contact',
      robots: 'noindex, follow',
    };
  }
  const staticMeta = STATIC_PUBLIC_META[pathname];
  if (staticMeta) {
    const structuredData = pathname === '/' ? [{
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'BonList',
      url: SITE_ORIGIN,
      logo: `${SITE_ORIGIN}/brand/bonlist-mark.png`,
    }, {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'BonList',
      url: SITE_ORIGIN,
      inLanguage: 'en-ZA',
    }] : undefined;
    return { ...staticMeta, canonicalPath: pathname, robots: 'index, follow', structuredData };
  }

  const articleMatch = pathname.match(/^\/career-advice\/([^/]+)$/);
  if (articleMatch) {
    const article = findCareerArticle(articleMatch[1]);
    if (article) {
      const canonicalPath = `/career-advice/${article.slug}`;
      return {
        title: article.seoTitle,
        description: article.metaDescription,
        canonicalPath,
        robots: 'index, follow',
        type: 'article',
        structuredData: [{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: article.title,
          description: article.metaDescription,
          datePublished: article.publishedAt,
          dateModified: article.updatedAt,
          inLanguage: 'en-ZA',
          mainEntityOfPage: `${SITE_ORIGIN}${canonicalPath}`,
          author: { '@type': 'Organization', name: 'BonList', url: SITE_ORIGIN },
          publisher: { '@type': 'Organization', name: 'BonList', logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/brand/bonlist-mark.png` } },
        }, breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Career Advice', path: '/career-advice' },
          { name: article.title, path: canonicalPath },
        ]), ...(article.faqs.length ? [{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: article.faqs.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })),
        }] : [])],
      };
    }
  }

  const categoryMatch = pathname.match(/^\/career-advice\/category\/([^/]+)$/);
  if (categoryMatch) {
    const label = categoryMatch[1].split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    return {
      title: `${label} | BonList Career Advice`,
      description: `Practical ${label.toLowerCase()} guidance for South African job seekers.`,
      canonicalPath: pathname,
      robots: 'noindex, follow',
      structuredData: [breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Career Advice', path: '/career-advice' }, { name: label, path: pathname }])],
    };
  }

  const jobsMatch = pathname.match(/^\/jobs\/([^/]+)$/);
  if (jobsMatch) {
    const category = findPublicJobCategory(jobsMatch[1]);
    if (category) {
      return {
        title: `${category.title} | BonList`,
        description: category.description,
        canonicalPath: `/jobs/${category.slug}`,
        robots: 'index, follow',
        structuredData: [breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Job guides', path: '/jobs/explore' }, { name: category.name, path: `/jobs/${category.slug}` }])],
      };
    }
  }

  if (pathname === '/jobs' || PRIVATE_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return { title: 'BonList Workspace', description: 'Private BonList career workspace.', robots: 'noindex, nofollow' };
  }

  return { title: 'Page Not Found | BonList', description: 'The requested BonList page could not be found.', robots: 'noindex, nofollow' };
}

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
    setMeta('meta[property="og:image"]', { property: 'og:image', content: DEFAULT_IMAGE });
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
