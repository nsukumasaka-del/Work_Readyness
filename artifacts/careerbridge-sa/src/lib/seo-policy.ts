import { ADVICE_CATEGORIES, adviceCategorySlug, findCareerArticle } from '../content/career-advice';
import { findPublicJobCategory } from '../content/public-jobs';

export const SITE_ORIGIN = 'https://www.bonlist.site';
export const DEFAULT_SOCIAL_IMAGE = `${SITE_ORIGIN}/brand/bonlist-logo.png`;

export type SeoState = {
  title: string;
  description: string;
  canonicalPath?: string;
  robots: 'index, follow' | 'noindex, follow' | 'noindex, nofollow';
  type?: 'website' | 'article';
  structuredData?: unknown[];
  fallbackHtml?: string;
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

export const PRIVATE_ROUTE_PREFIXES = [
  '/admin', '/dashboard', '/my-resumes', '/profile', '/account', '/settings', '/security', '/app/updates',
  '/login', '/signup', '/forgot-password', '/reset-password', '/auth/callback', '/checkout', '/payment',
  '/cv-builder', '/diagnostic', '/interview', '/coaching', '/programme', '/offline-workstation', '/job-matches',
];

function breadcrumbSchema(items: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem', position: index + 1, name: item.name, item: `${SITE_ORIGIN}${item.path}`,
    })),
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
}

function fallback(title: string, description: string, body = '') {
  return `<main style="max-width:760px;margin:48px auto;padding:0 20px;font-family:system-ui,sans-serif;color:#172033"><h1>${escapeHtml(title.replace(/ \| BonList$/, ''))}</h1><p>${escapeHtml(description)}</p>${body}</main>`;
}

export function seoForPath(pathname: string): SeoState {
  if (pathname === '/support') {
    return { title: 'BonList Support | Account and Product Help', description: 'Get help with your BonList account, CV workspace, privacy requests and product questions.', canonicalPath: '/contact', robots: 'noindex, follow' };
  }
  const staticMeta = STATIC_PUBLIC_META[pathname];
  if (staticMeta) {
    const structuredData = pathname === '/' ? [{
      '@context': 'https://schema.org', '@type': 'Organization', name: 'BonList', url: SITE_ORIGIN, logo: `${SITE_ORIGIN}/brand/bonlist-mark.png`,
    }, {
      '@context': 'https://schema.org', '@type': 'WebSite', name: 'BonList', url: SITE_ORIGIN, inLanguage: 'en-ZA',
    }] : undefined;
    return { ...staticMeta, canonicalPath: pathname, robots: 'index, follow', structuredData, fallbackHtml: fallback(staticMeta.title, staticMeta.description) };
  }

  const articleMatch = pathname.match(/^\/career-advice\/([^/]+)$/);
  if (articleMatch) {
    const article = findCareerArticle(articleMatch[1]);
    if (article) {
      const canonicalPath = `/career-advice/${article.slug}`;
      const articleBody = article.sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}${section.bullets?.length ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>` : ''}${section.callout ? `<aside>${escapeHtml(section.callout)}</aside>` : ''}</section>`).join('') + (article.faqs.length ? `<section><h2>Frequently asked questions</h2>${article.faqs.map((faq) => `<h3>${escapeHtml(faq.question)}</h3><p>${escapeHtml(faq.answer)}</p>`).join('')}</section>` : '');
      return {
        title: article.seoTitle,
        description: article.metaDescription,
        canonicalPath,
        robots: 'index, follow',
        type: 'article',
        fallbackHtml: fallback(article.title, article.excerpt, articleBody),
        structuredData: [{
          '@context': 'https://schema.org', '@type': 'Article', headline: article.title, description: article.metaDescription,
          datePublished: article.publishedAt, dateModified: article.updatedAt, inLanguage: 'en-ZA', mainEntityOfPage: `${SITE_ORIGIN}${canonicalPath}`,
          author: { '@type': 'Organization', name: 'BonList', url: SITE_ORIGIN },
          publisher: { '@type': 'Organization', name: 'BonList', logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/brand/bonlist-mark.png` } },
        }, breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Career Advice', path: '/career-advice' }, { name: article.title, path: canonicalPath }]), ...(article.faqs.length ? [{
          '@context': 'https://schema.org', '@type': 'FAQPage',
          mainEntity: article.faqs.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer } })),
        }] : [])],
      };
    }
  }

  const categoryMatch = pathname.match(/^\/career-advice\/category\/([^/]+)$/);
  if (categoryMatch) {
    const category = ADVICE_CATEGORIES.find((item) => adviceCategorySlug(item) === categoryMatch[1]);
    if (category) {
      const description = `Practical ${category.toLowerCase()} guidance for South African job seekers.`;
      return {
        title: `${category} | BonList Career Advice`, description, canonicalPath: pathname, robots: 'noindex, follow', fallbackHtml: fallback(category, description),
        structuredData: [breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Career Advice', path: '/career-advice' }, { name: category, path: pathname }])],
      };
    }
  }

  const jobsMatch = pathname.match(/^\/jobs\/([^/]+)$/);
  if (jobsMatch) {
    const category = findPublicJobCategory(jobsMatch[1]);
    if (category) {
      const body = `<section><h2>About this type of work</h2>${category.overview.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</section><section><h2>Common roles</h2><ul>${category.roles.map((role) => `<li>${escapeHtml(role)}</li>`).join('')}</ul></section>`;
      return {
        title: `${category.title} | BonList`, description: category.description, canonicalPath: `/jobs/${category.slug}`, robots: 'index, follow', fallbackHtml: fallback(category.title, category.description, body),
        structuredData: [breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Job guides', path: '/jobs/explore' }, { name: category.name, path: `/jobs/${category.slug}` }])],
      };
    }
  }

  if (/^\/shared-cv\/[a-f0-9]{64}$/.test(pathname)) {
    return { title: 'Shared CV | BonList', description: 'A read-only resume shared by its owner.', robots: 'noindex, nofollow' };
  }
  if (pathname === '/jobs' || pathname.startsWith('/jobs/') || PRIVATE_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return { title: 'BonList Workspace', description: 'Private BonList career workspace.', robots: 'noindex, nofollow' };
  }
  return { title: 'Page Not Found | BonList', description: 'The requested BonList page could not be found.', robots: 'noindex, nofollow' };
}

export function isKnownAppPath(pathname: string) {
  return seoForPath(pathname).title !== 'Page Not Found | BonList';
}
