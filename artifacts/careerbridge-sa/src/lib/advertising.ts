import { CAREER_ARTICLES } from '../content/career-advice';
import { PUBLIC_JOB_CATEGORIES } from '../content/public-jobs';

export type AdPlacement = 'article-top' | 'article-middle' | 'article-bottom' | 'jobs-feed' | 'job-guide-middle';

const buildEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
const publisherId = String(buildEnv.VITE_ADSENSE_CLIENT_ID || '').trim();

export const advertisingConfig = {
  enabled: buildEnv.VITE_ADS_ENABLED === 'true',
  provider: buildEnv.VITE_ADS_PROVIDER === 'none' ? 'none' : 'google-adsense',
  publisherId,
  validPublisherId: /^ca-pub-\d{10,20}$/.test(publisherId),
  slots: {
    'article-top': String(buildEnv.VITE_ADSENSE_SLOT_ARTICLE_TOP || '').trim(),
    'article-middle': String(buildEnv.VITE_ADSENSE_SLOT_ARTICLE_MIDDLE || '').trim(),
    'article-bottom': String(buildEnv.VITE_ADSENSE_SLOT_ARTICLE_BOTTOM || '').trim(),
    'jobs-feed': String(buildEnv.VITE_ADSENSE_SLOT_JOBS_FEED || '').trim(),
    'job-guide-middle': String(buildEnv.VITE_ADSENSE_SLOT_JOB_GUIDE || '').trim(),
  } satisfies Record<AdPlacement, string>,
} as const;

const ELIGIBLE_PATHS = new Set([
  '/jobs/explore',
  ...CAREER_ARTICLES.map((article) => `/career-advice/${article.slug}`),
  ...PUBLIC_JOB_CATEGORIES.map((category) => `/jobs/${category.slug}`),
]);

export function advertisingAllowedForPath(pathname: string) {
  return advertisingConfig.enabled &&
    advertisingConfig.provider === 'google-adsense' &&
    advertisingConfig.validPublisherId &&
    isAdvertisingContentPath(pathname);
}

export function isAdvertisingContentPath(pathname: string) {
  return ELIGIBLE_PATHS.has(pathname);
}

export function adSlotId(placement: AdPlacement) {
  const value = advertisingConfig.slots[placement];
  return /^\d{6,20}$/.test(value) ? value : '';
}
