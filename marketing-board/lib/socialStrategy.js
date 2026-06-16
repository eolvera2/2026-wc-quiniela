export const ACTIVE_SOCIAL_PLATFORMS = ['instagram', 'x', 'threads'];
export const OPTIONAL_SOCIAL_PLATFORMS = ['tiktok', 'youtube'];
export const RETIRED_DAILY_PLATFORMS = ['facebook'];

export const PLATFORM_LABELS = {
  instagram: 'IG',
  x: 'X',
  threads: 'TH',
  tiktok: 'TT',
  youtube: 'YT',
};

export const PLATFORM_NAMES = {
  instagram: 'Instagram',
  x: 'X',
  threads: 'Threads',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

export const POST_WINDOWS = {
  t_minus_48h: {
    label: 'T-48h · breakdown',
    offsetMinutes: -48 * 60,
    expiresAfterMinutes: 24 * 60,
    urgencyMinutes: 180,
  },
  t_minus_24h: {
    label: 'T-24h · predicción oficial',
    offsetMinutes: -24 * 60,
    expiresAfterMinutes: 18 * 60,
    urgencyMinutes: 120,
  },
  t_minus_4h: {
    label: 'T-4h · poll comunidad',
    offsetMinutes: -4 * 60,
    expiresAfterMinutes: 150,
    urgencyMinutes: 45,
  },
  t_minus_60: {
    label: 'T-60m · predicción final',
    offsetMinutes: -60,
    expiresAfterMinutes: 45,
    urgencyMinutes: 20,
  },
  t_minus_15: {
    label: 'T-15m · dato clave',
    offsetMinutes: -15,
    expiresAfterMinutes: 30,
    urgencyMinutes: 10,
  },
  halftime: {
    label: 'HT · debate en vivo',
    offsetMinutes: 55,
    expiresAfterMinutes: 35,
    urgencyMinutes: 10,
  },
  fulltime_plus_30: {
    label: 'FT+30m · recap',
    offsetMinutes: 135,
    expiresAfterMinutes: 180,
    urgencyMinutes: 30,
  },
  next_morning: {
    label: 'Mañana siguiente · dato/standing',
    offsetMinutes: null,
    expiresAfterMinutes: 720,
    urgencyMinutes: 60,
  },
  evergreen: {
    label: 'Evergreen',
    offsetMinutes: null,
    expiresAfterMinutes: 1440,
    urgencyMinutes: 120,
  },
};

export function normalizePlatform(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'twitter') return 'x';
  if (key === 'ig') return 'instagram';
  if (key === 'th') return 'threads';
  if (key === 'tt') return 'tiktok';
  if (key === 'yt') return 'youtube';
  return key;
}

export function isKnownPlatform(value) {
  const platform = normalizePlatform(value);
  return ACTIVE_SOCIAL_PLATFORMS.includes(platform) || OPTIONAL_SOCIAL_PLATFORMS.includes(platform);
}

export function platformDisplayName(value) {
  return PLATFORM_NAMES[normalizePlatform(value)] || String(value || '').toUpperCase();
}

export function platformLabel(value) {
  return PLATFORM_LABELS[normalizePlatform(value)] || String(value || '').toUpperCase();
}

export function cdmxParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function toCdmxIso(date) {
  const parts = cdmxParts(date);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}-06:00`;
}

export function cdmxDate(date) {
  const parts = cdmxParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function scheduledForWindow(kickoffIso, windowKey) {
  const window = POST_WINDOWS[windowKey] || POST_WINDOWS.evergreen;
  const kickoff = new Date(kickoffIso);
  if (Number.isNaN(kickoff.getTime())) return null;
  if (windowKey === 'next_morning') {
    const parts = cdmxParts(kickoff);
    const nextMorningLocal = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1, 9, 0, 0);
    return toCdmxIso(new Date(nextMorningLocal + 6 * 3600 * 1000));
  }
  const offset = Number(window.offsetMinutes || 0);
  return toCdmxIso(new Date(kickoff.getTime() + offset * 60 * 1000));
}

export function expiresForWindow(kickoffIso, windowKey) {
  const window = POST_WINDOWS[windowKey] || POST_WINDOWS.evergreen;
  const scheduled = scheduledForWindow(kickoffIso, windowKey);
  if (!scheduled) return null;
  const scheduledDate = new Date(scheduled);
  return new Date(scheduledDate.getTime() + Number(window.expiresAfterMinutes || 120) * 60 * 1000).toISOString();
}

export function dueStatus(scheduledFor, { expiresAt = null, now = new Date(), urgencyMinutes = 20 } = {}) {
  if (!scheduledFor) return { key: 'unscheduled', label: 'Sin horario', deltaMinutes: null };
  const due = new Date(scheduledFor);
  if (Number.isNaN(due.getTime())) return { key: 'unscheduled', label: 'Sin horario', deltaMinutes: null };
  const deltaMinutes = Math.round((due.getTime() - now.getTime()) / 60000);
  if (expiresAt) {
    const expiry = new Date(expiresAt);
    if (!Number.isNaN(expiry.getTime()) && now > expiry) {
      return { key: 'expired', label: 'Expirado', deltaMinutes };
    }
  }
  if (deltaMinutes > urgencyMinutes) return { key: 'future', label: `En ${formatDuration(deltaMinutes)}`, deltaMinutes };
  if (deltaMinutes > 0) return { key: 'due_soon', label: `En ${formatDuration(deltaMinutes)}`, deltaMinutes };
  if (deltaMinutes >= -15) return { key: 'due_now', label: 'POST NOW', deltaMinutes };
  return { key: 'late', label: `Tarde ${formatDuration(Math.abs(deltaMinutes))}`, deltaMinutes };
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}
