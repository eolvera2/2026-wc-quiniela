import { createHash } from 'node:crypto';

export const FOOTBALLDATA_BASE_URL = 'https://footballdata.io/api/v1';
export const FOOTBALLDATA_WORLD_CUP_LEAGUE_ID = 50;
export const FOOTBALLDATA_WORLD_CUP_2026_SEASON_ID = 618;
export const FOOTBALLDATA_SOURCE_SLUG = 'footballdata_io';

export function footballDataHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

export async function requestFootballData(path, apiKey) {
  const { data } = await fetchFootballData(path, apiKey);
  return data;
}

export async function requestFootballDataCached(db, {
  path,
  apiKey,
  reason,
  entityType,
  entityRefId = null,
  ttlSeconds,
  negativeTtlSeconds = ttlSeconds,
  isEmptyResponse = () => false,
  forceRefresh = false,
}) {
  const sourceId = getFootballDataSourceId(db);
  const cacheKey = cacheKeyForPath(path);
  const now = new Date();
  const nowIso = now.toISOString();

  if (!forceRefresh) {
    const cached = db.prepare(`
      SELECT id, is_empty, expires_at, http_status, raw_json
      FROM provider_cache
      WHERE source_id = ? AND cache_key = ?
    `).get(sourceId, cacheKey);

    if (cached && isFreshCache(cached, now)) {
      db.prepare(`
        INSERT INTO fetch_log (source_id, endpoint, params_hash, params_json, reason, http_status, cached, is_negative)
        VALUES (@sourceId, @endpoint, @paramsHash, @paramsJson, @reason, @httpStatus, 1, @isNegative)
      `).run({
        sourceId,
        endpoint: pathWithoutQuery(path),
        paramsHash: hashPath(path),
        paramsJson: JSON.stringify(queryParamsObject(path)),
        reason,
        httpStatus: cached.http_status,
        isNegative: cached.is_empty,
      });

      return {
        fromCache: true,
        isEmpty: cached.is_empty === 1,
        data: cached.raw_json ? JSON.parse(cached.raw_json) : { success: true, data: {} },
      };
    }
  }

  const started = Date.now();
  const { response, data, rawText } = await fetchFootballData(path, apiKey);
  const isEmpty = isEmptyResponse(data);
  const ttl = isEmpty ? negativeTtlSeconds : ttlSeconds;
  const expiresAt = ttl == null ? null : new Date(now.getTime() + ttl * 1000).toISOString();

  const log = db.prepare(`
    INSERT INTO fetch_log (
      source_id, endpoint, params_hash, params_json, reason, http_status,
      response_bytes, quota_used, quota_remaining, duration_ms, cached, is_negative
    )
    VALUES (
      @sourceId, @endpoint, @paramsHash, @paramsJson, @reason, @httpStatus,
      @responseBytes, @quotaUsed, @quotaRemaining, @durationMs, 0, @isNegative
    )
  `).run({
    sourceId,
    endpoint: pathWithoutQuery(path),
    paramsHash: hashPath(path),
    paramsJson: JSON.stringify(queryParamsObject(path)),
    reason,
    httpStatus: response.status,
    responseBytes: Buffer.byteLength(rawText, 'utf8'),
    quotaUsed: Number(response.headers.get('x-ratelimit-used')) || null,
    quotaRemaining: Number(response.headers.get('x-ratelimit-remaining')) || null,
    durationMs: Date.now() - started,
    isNegative: isEmpty ? 1 : 0,
  });

  db.prepare(`
    INSERT INTO provider_cache (
      source_id, cache_key, entity_type, entity_ref_id, is_empty,
      fetched_at, expires_at, http_status, raw_json, fetch_log_id
    )
    VALUES (
      @sourceId, @cacheKey, @entityType, @entityRefId, @isEmpty,
      @fetchedAt, @expiresAt, @httpStatus, @rawJson, @fetchLogId
    )
    ON CONFLICT(source_id, cache_key) DO UPDATE SET
      entity_type = excluded.entity_type,
      entity_ref_id = excluded.entity_ref_id,
      is_empty = excluded.is_empty,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at,
      http_status = excluded.http_status,
      raw_json = excluded.raw_json,
      fetch_log_id = excluded.fetch_log_id,
      updated_at = datetime('now')
  `).run({
    sourceId,
    cacheKey,
    entityType,
    entityRefId,
    isEmpty: isEmpty ? 1 : 0,
    fetchedAt: nowIso,
    expiresAt,
    httpStatus: response.status,
    rawJson: isEmpty ? null : JSON.stringify(data),
    fetchLogId: log.lastInsertRowid,
  });

  return { fromCache: false, isEmpty, data };
}

async function fetchFootballData(path, apiKey) {
  const response = await fetch(`${FOOTBALLDATA_BASE_URL}${path}`, {
    headers: footballDataHeaders(apiKey),
  });

  const rawText = await response.text();
  const data = rawText ? JSON.parse(rawText) : {};

  if (!response.ok || data.success === false) {
    throw new Error(`FootballData ${path} HTTP ${response.status}: ${JSON.stringify(data.error || data)}`);
  }

  return { response, data, rawText };
}

export async function resolveSeasonId({ apiKey, leagueId, season }) {
  if (leagueId === FOOTBALLDATA_WORLD_CUP_LEAGUE_ID && season === 2026) {
    return FOOTBALLDATA_WORLD_CUP_2026_SEASON_ID;
  }

  const data = await requestFootballData(`/leagues/${leagueId}/seasons`, apiKey);
  const seasons = data.data?.seasons || [];
  const match = seasons.find((item) => item.year === season);

  if (!match) {
    throw new Error(`FootballData season ${season} not found for league ${leagueId}`);
  }

  return match.season_id;
}

function getFootballDataSourceId(db) {
  const row = db.prepare("SELECT id FROM sources WHERE slug = ?").get(FOOTBALLDATA_SOURCE_SLUG);
  if (!row) {
    throw new Error('FootballData source row is missing; run DB migrations first');
  }
  return row.id;
}

function cacheKeyForPath(path) {
  return `footballdata:${path}`;
}

function hashPath(path) {
  return createHash('sha1').update(path).digest('hex');
}

function pathWithoutQuery(path) {
  return path.split('?')[0];
}

function queryParamsObject(path) {
  const [, queryString] = path.split('?');
  if (!queryString) return {};
  return Object.fromEntries(new URLSearchParams(queryString));
}

function isFreshCache(cached, now) {
  if (!cached.expires_at) return true;
  return new Date(cached.expires_at).getTime() > now.getTime();
}
