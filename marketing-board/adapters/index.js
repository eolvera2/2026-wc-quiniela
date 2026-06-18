import * as x from './x.js';
import * as youtube from './youtube.js';
import * as instagram from './meta-ig.js';
import * as threads from './meta-threads.js';
import * as tiktok from './tiktok.js';
import { isPlatformPaused, platformDisplayName, platformStatus } from '../lib/socialStrategy.js';

export const adapters = {
  x,
  twitter: x,
  youtube,
  instagram,
  ig: instagram,
  threads,
  tiktok,
};

export async function publishCard(card) {
  const platforms = parsePlatforms(card?.platforms_json);
  const results = await Promise.allSettled(
    platforms.map((platform) => {
      if (isPlatformPaused(platform)) {
        const status = platformStatus(platform);
        return Promise.resolve({
          status: 'skipped',
          permalink: null,
          error: `${platformDisplayName(platform)} paused: ${status.reason}`,
        });
      }
      return adapters[platform]?.publish(card) ?? Promise.resolve({ status: 'skipped', error: `no adapter for ${platform}` });
    }),
  );

  return platforms.map((platform, index) => {
    const result = results[index];
    if (result.status === 'fulfilled') return { platform, ...result.value };
    return { platform, status: 'failed', permalink: null, error: result.reason?.message ?? String(result.reason) };
  });
}

function parsePlatforms(platformsJson) {
  try {
    const value = JSON.parse(platformsJson || '[]');
    return Array.isArray(value) ? value.map((platform) => String(platform).toLowerCase()) : [];
  } catch {
    return [];
  }
}
