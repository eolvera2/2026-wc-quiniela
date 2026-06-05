import { afterEach, describe, expect, it } from 'vitest';
import nock from 'nock';
import { openDb, closeDb } from '../db/db.js';
import {
  FOOTBALLDATA_WORLD_CUP_2026_SEASON_ID,
  requestFootballDataCached,
  resolveSeasonId,
} from './footballData.js';

const FOOTBALLDATA_HOST = 'https://footballdata.io';
const API_KEY = 'test-footballdata-key';

describe('ingest/footballData', () => {
  let db;

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    if (db) {
      closeDb(db);
      db = null;
    }
  });

  it('resolves the WC2026 season id without a network call', async () => {
    nock.disableNetConnect();

    await expect(resolveSeasonId({ apiKey: API_KEY, leagueId: 50, season: 2026 }))
      .resolves.toBe(FOOTBALLDATA_WORLD_CUP_2026_SEASON_ID);
  });

  it('caches successful FootballData responses and logs cache hits', async () => {
    db = openDb(':memory:');
    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/meta/status')
      .once()
      .reply(200, { success: true, data: { status: 'ok' } });

    const first = await requestFootballDataCached(db, {
      path: '/meta/status',
      apiKey: API_KEY,
      reason: 'test',
      entityType: 'meta_status',
      ttlSeconds: 3600,
    });
    const second = await requestFootballDataCached(db, {
      path: '/meta/status',
      apiKey: API_KEY,
      reason: 'test',
      entityType: 'meta_status',
      ttlSeconds: 3600,
    });

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.data.data.status).toBe('ok');
    expect(db.prepare('SELECT COUNT(*) AS count FROM provider_cache').get().count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM fetch_log WHERE cached = 0').get().count).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM fetch_log WHERE cached = 1').get().count).toBe(1);
  });

  it('caches empty responses as negative cache entries', async () => {
    db = openDb(':memory:');
    nock(FOOTBALLDATA_HOST)
      .get('/api/v1/matches/123/odds')
      .once()
      .reply(200, { success: true, data: { odds: { match_winner: {} } } });

    const first = await requestFootballDataCached(db, {
      path: '/matches/123/odds',
      apiKey: API_KEY,
      reason: 'refresh',
      entityType: 'odds',
      entityRefId: 1,
      ttlSeconds: 300,
      negativeTtlSeconds: 3600,
      isEmptyResponse: (data) => !data.data?.odds?.match_winner?.home,
    });
    const second = await requestFootballDataCached(db, {
      path: '/matches/123/odds',
      apiKey: API_KEY,
      reason: 'refresh',
      entityType: 'odds',
      entityRefId: 1,
      ttlSeconds: 300,
      negativeTtlSeconds: 3600,
      isEmptyResponse: (data) => !data.data?.odds?.match_winner?.home,
    });

    expect(first.fromCache).toBe(false);
    expect(first.isEmpty).toBe(true);
    expect(second.fromCache).toBe(true);
    expect(second.isEmpty).toBe(true);
    const cache = db.prepare('SELECT is_empty, raw_json FROM provider_cache').get();
    expect(cache.is_empty).toBe(1);
    expect(cache.raw_json).toBeNull();
  });
});
