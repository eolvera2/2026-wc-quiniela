import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './index.js';

describe('config/index', () => {
  const REQUIRED_VARS = {
    AZURE_AI_ENDPOINT: 'https://test.openai.azure.com/',
    AZURE_AI_KEY: 'test-key',
    API_FOOTBALL_KEY: 'test-api-football',
    AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=test',
    CALIENTE_AFFILIATE_URL: 'https://caliente.mx/ref/test',
    BET365_AFFILIATE_URL: 'https://bet365.mx/ref/test',
    SKIMLINKS_AFFILIATE_URL: 'https://go.skimresources.com/?id=test',
  };

  beforeEach(() => {
    Object.entries(REQUIRED_VARS).forEach(([k, v]) => { process.env[k] = v; });
  });

  afterEach(() => {
    Object.keys(REQUIRED_VARS).forEach((k) => { delete process.env[k]; });
    delete process.env.ACTIVE_ARTICLE_TYPES;
    delete process.env.DB_PATH;
  });

  it('loads all required env vars', () => {
    const config = loadConfig();
    expect(config.azureAiEndpoint).toBe('https://test.openai.azure.com/');
    expect(config.azureAiKey).toBe('test-key');
    expect(config.apiFootballKey).toBe('test-api-football');
  });

  it('throws when a required var is missing', () => {
    delete process.env.AZURE_AI_KEY;
    expect(() => loadConfig()).toThrow('Missing required environment variable: AZURE_AI_KEY');
  });

  it('defaults activeArticleTypes to pronostico_momios', () => {
    const config = loadConfig();
    expect(config.activeArticleTypes).toEqual(['pronostico_momios']);
  });

  it('parses ACTIVE_ARTICLE_TYPES as comma-separated', () => {
    process.env.ACTIVE_ARTICLE_TYPES = 'pronostico_momios,alineacion_probable';
    const config = loadConfig();
    expect(config.activeArticleTypes).toEqual(['pronostico_momios', 'alineacion_probable']);
  });

  it('defaults dbPath to data/wc26.sqlite', () => {
    const config = loadConfig();
    expect(config.dbPath).toBe('data/wc26.sqlite');
  });
});
