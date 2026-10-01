import { apiUrl } from '@/lib/api-base';

export type TargetPlatform = 'all' | 'web-only' | 'native-apk-required';

export interface AppUpdateMetadata {
  latestVersion: string;
  latestVersionCode: number;
  versionCode: number;
  apkUrl: string;
  apkAvailable: boolean;
  fileSizeBytes: number;
  checksumSha256: string;
  releaseNotes: string;
  bundleVersion: string;
  bundleUrl: string;
  targetPlatform: TargetPlatform;
  requiresNewAPK: boolean;
}

export async function fetchAppUpdateMetadata(): Promise<AppUpdateMetadata> {
  const endpoint = new URL(apiUrl('/api/app/version'), window.location.href);
  endpoint.searchParams.set('t', String(Date.now()));
  const response = await fetch(endpoint.toString(), {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
  });
  if (!response.ok) throw new Error(`Update service returned ${response.status}.`);
  const value = await response.json() as Record<string, unknown>;
  const versionCode = Number(value.latestVersionCode ?? value.versionCode);
  const apkAvailable = value.apkAvailable === true;
  const fileSizeBytes = Number(value.fileSizeBytes || 0);
  const checksumSha256 = String(value.checksumSha256 || '');
  const apkUrl = String(value.apkUrl || '');
  if (!Number.isSafeInteger(versionCode) || versionCode < 0 || typeof value.latestVersion !== 'string') {
    throw new Error('The update service returned invalid version information.');
  }
  if (apkAvailable && (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes < 1024 ||
      fileSizeBytes > 2_147_483_647 || !/^[a-f0-9]{64}$/i.test(checksumSha256) ||
      !apkUrl.startsWith('https://') || versionCode < 1)) {
    throw new Error('The update service returned incomplete APK integrity information.');
  }
  const targetPlatform: TargetPlatform = ['all', 'web-only', 'native-apk-required'].includes(String(value.targetPlatform))
    ? value.targetPlatform as TargetPlatform : 'all';
  return {
    latestVersion: value.latestVersion,
    latestVersionCode: versionCode,
    versionCode,
    apkUrl: apkAvailable ? apkUrl : '',
    apkAvailable,
    fileSizeBytes: apkAvailable ? fileSizeBytes : 0,
    checksumSha256: apkAvailable ? checksumSha256 : '',
    releaseNotes: String(value.releaseNotes || 'No release notes provided.'),
    bundleVersion: String(value.bundleVersion || ''),
    bundleUrl: String(value.bundleUrl || ''),
    targetPlatform,
    requiresNewAPK: Boolean(value.requiresNewAPK),
  };
}

export async function checkForAppUpdates(currentVersionCode: number): Promise<{
  hasUpdate: boolean;
  metadata?: AppUpdateMetadata;
}> {
  try {
    const metadata = await fetchAppUpdateMetadata();
    return {
      hasUpdate: metadata.apkAvailable && Number.isSafeInteger(currentVersionCode) &&
        currentVersionCode > 0 && metadata.latestVersionCode > currentVersionCode,
      metadata,
    };
  } catch (error) {
    console.error('[APK update check] Failed to fetch release metadata:', error);
    return { hasUpdate: false };
  }
}
