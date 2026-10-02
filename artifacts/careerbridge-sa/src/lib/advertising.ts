export type AdPlacement = 'article-top' | 'article-middle' | 'article-bottom' | 'jobs-feed' | 'job-detail' | 'sidebar-desktop';

export const advertisingConfig = {
  enabled: false,
  provider: 'none' as 'none' | 'google-adsense',
  publisherId: '',
  excludedRoutePrefixes: [
    '/admin', '/dashboard', '/my-resumes', '/cv-builder', '/diagnostic', '/profile', '/account',
    '/settings', '/security', '/login', '/signup', '/forgot-password', '/reset-password', '/checkout', '/payment',
  ],
} as const;

export function advertisingAllowedForPath(pathname: string) {
  return advertisingConfig.enabled &&
    advertisingConfig.provider !== 'none' &&
    Boolean(advertisingConfig.publisherId) &&
    !advertisingConfig.excludedRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
