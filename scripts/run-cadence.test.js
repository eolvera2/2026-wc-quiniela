import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runCadence } from './run-cadence.js';

// Mock all external dependencies
vi.mock('../src/storage/blob.js', () => ({
  downloadDb: vi.fn().mockResolvedValue({ leaseId: 'lease-abc' }),
  uploadDb: vi.fn().mockResolvedValue({}),
}));

vi.mock('../src/db/db.js', () => {
  const mockDb = {
    prepare: vi.fn().mockReturnValue({
      all: vi.fn().mockReturnValue([]),
      get: vi.fn().mockReturnValue(null),
      run: vi.fn(),
    }),
    close: vi.fn(),
  };
  return {
    openDb: vi.fn().mockReturnValue(mockDb),
    closeDb: vi.fn(),
    __mockDb: mockDb,
  };
});

vi.mock('../src/cadence/selectPass.js', () => ({
  selectPass: vi.fn().mockReturnValue(null),
}));

vi.mock('../src/generate/batch.js', () => ({
  runBatch: vi.fn().mockResolvedValue({ succeeded: 0, failed: 0, skipped: 0 }),
}));

vi.mock('../src/publish/staticSite.js', () => ({
  buildSite: vi.fn().mockReturnValue([]),
}));

vi.mock('../src/ingest/publicFinalScoreSources.js', () => ({
  retrievePublicFinalScores: vi.fn().mockResolvedValue({ applied: 0, skipped: 0, warnings: [] }),
}));

vi.mock('./seed-static.js', () => ({
  seedStaticData: vi.fn().mockReturnValue({ fixtures: 104, teams: 48, stadiums: 16, groups: 12 }),
}));

import { downloadDb, uploadDb } from '../src/storage/blob.js';
import { openDb, closeDb } from '../src/db/db.js';
import { selectPass } from '../src/cadence/selectPass.js';
import { runBatch } from '../src/generate/batch.js';
import { buildSite } from '../src/publish/staticSite.js';
import { retrievePublicFinalScores } from '../src/ingest/publicFinalScoreSources.js';
import { seedStaticData } from './seed-static.js';

describe('run-cadence orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads DB, processes, and uploads DB on success', async () => {
    const config = {
      azureStorageConnectionString: 'conn-string',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      dbPath: '/tmp/wc26.sqlite',
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'key',
      activeArticleTypes: ['pronostico_momios'],
      siteBaseUrl: 'https://test.example.com',
      outputDir: '/tmp/dist',
      affiliateUrls: { caliente: '', bet365: '', skimlinks: '' },
    };

    await runCadence(config);

    expect(downloadDb).toHaveBeenCalledWith({
      connectionString: 'conn-string',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      localPath: '/tmp/wc26.sqlite',
    });
    expect(openDb).toHaveBeenCalledWith('/tmp/wc26.sqlite');
    expect(seedStaticData).toHaveBeenCalled();
    expect(retrievePublicFinalScores).toHaveBeenCalled();
    expect(uploadDb).toHaveBeenCalledWith({
      connectionString: 'conn-string',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      localPath: '/tmp/wc26.sqlite',
      leaseId: 'lease-abc',
    });
    expect(closeDb).toHaveBeenCalled();
  });

  it('still uploads DB even when no fixtures are due', async () => {
    selectPass.mockReturnValue(null);

    const config = {
      azureStorageConnectionString: 'conn-string',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      dbPath: '/tmp/wc26.sqlite',
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'key',
      activeArticleTypes: ['pronostico_momios'],
      siteBaseUrl: 'https://test.example.com',
      outputDir: '/tmp/dist',
      affiliateUrls: { caliente: '', bet365: '', skimlinks: '' },
    };

    await runCadence(config);

    expect(uploadDb).toHaveBeenCalled();
  });

  it('calls selectPass for each fixture to determine due passes', async () => {
    const mockFixtures = [
      { id: 1, api_football_id: 100, kickoff_utc: '2026-06-11T18:00:00Z', status: 'scheduled' },
    ];
    const mockArticle = { fixture_id: 1, article_type: 'pronostico_momios', lifecycle_state: null };

    const mockDb = {
      prepare: vi.fn((sql) => {
        if (sql.includes('FROM articles a')) {
          return { all: vi.fn().mockReturnValue([]) };
        }
        if (sql.includes('FROM fixtures')) {
          return { all: vi.fn().mockReturnValue(mockFixtures) };
        }
        if (sql.includes('FROM articles')) {
          return { get: vi.fn().mockReturnValue(mockArticle) };
        }
        return { all: vi.fn().mockReturnValue([]), get: vi.fn().mockReturnValue(null), run: vi.fn() };
      }),
      close: vi.fn(),
    };
    openDb.mockReturnValue(mockDb);
    selectPass.mockReturnValue('seed');

    const config = {
      azureStorageConnectionString: 'conn-string',
      containerName: 'wc26',
      blobName: 'wc26.sqlite',
      dbPath: '/tmp/wc26.sqlite',
      endpoint: 'https://test.openai.azure.com',
      apiKey: 'key',
      activeArticleTypes: ['pronostico_momios'],
      siteBaseUrl: 'https://test.example.com',
      outputDir: '/tmp/dist',
      affiliateUrls: { caliente: '', bet365: '', skimlinks: '' },
    };

    await runCadence(config);

    expect(selectPass).toHaveBeenCalled();
  });
});
