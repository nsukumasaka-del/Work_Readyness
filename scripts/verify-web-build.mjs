import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyProductionBuild(outDir) {
  const html = readFileSync(resolve(outDir, 'index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+\.(?:js|css))["']/g)].map(match => match[1]);
  if (!html.includes('id="root"') || !assets.some(asset => asset.endsWith('.js')) || /src=["']\/src\//.test(html)) {
    throw new Error('Production HTML is missing the compiled React entrypoint; deployment stopped.');
  }
  for (const asset of assets) {
    const path = resolve(outDir, '.' + asset);
    if (relative(outDir, path).startsWith('..') || !existsSync(path) || statSync(path).size === 0) {
      throw new Error(`Compiled asset missing: ${asset}`);
    }
  }
  const manifest = JSON.parse(readFileSync(resolve(outDir, 'ota/manifest.json'), 'utf8'));
  const zip = readFileSync(resolve(outDir, 'ota/latest.zip'));
  if (zip[0] !== 0x50 || zip[1] !== 0x4b || zip.length !== manifest.bundleSizeBytes ||
      createHash('sha256').update(zip).digest('hex') !== manifest.otaChecksum) {
    throw new Error('Android OTA bundle does not match its verified manifest; deployment stopped.');
  }
  return { assets, bundleVersion: manifest.bundleVersion };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(import.meta.dirname, '../artifacts/careerbridge-sa/dist/public');
  console.log('[bonlist] Verified production HTML, compiled assets and OTA checksum:', verifyProductionBuild(directory));
}
