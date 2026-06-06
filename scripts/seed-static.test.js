import { describe, expect, it } from 'vitest';
import { closeDb, openDb } from '../src/db/db.js';
import { parseOpenFootball, seedStaticData } from './seed-static.js';
import { WORLD_CUP_TEAMS } from '../src/data/worldCupTeams.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STATIC_DIR = join(process.cwd(), 'data', 'static', 'openfootball');

function staticInputs() {
  return {
    cupText: readFileSync(join(STATIC_DIR, 'cup.txt'), 'utf8'),
    finalsText: readFileSync(join(STATIC_DIR, 'cup_finals.txt'), 'utf8'),
    stadiumsCsv: readFileSync(join(STATIC_DIR, 'cup_stadiums.csv'), 'utf8'),
  };
}

describe('seed-static', () => {
  it('defines presentation metadata for all 48 qualified teams', () => {
    expect(WORLD_CUP_TEAMS).toHaveLength(48);
    expect(WORLD_CUP_TEAMS.find((team) => team.code === 'RSA')).toMatchObject({
      displayName: 'Sudáfrica',
      flag: 'za',
    });
  });

  it('parses the complete openfootball WC2026 static dataset', () => {
    const data = parseOpenFootball(staticInputs());

    expect(data.groups).toHaveLength(12);
    expect(data.teams).toHaveLength(48);
    expect(data.stadiums).toHaveLength(16);
    expect(data.fixtures).toHaveLength(104);
    expect(data.fixtures[0]).toMatchObject({
      home: 'Mexico',
      away: 'South Africa',
      kickoffUtc: '2026-06-11T19:00:00.000Z',
      stage: 'group',
      groupCode: 'A',
    });
    expect(data.fixtures.at(-1)).toMatchObject({
      matchNumber: 104,
      home: 'W101',
      away: 'W102',
      stage: 'knockout',
      isTbd: true,
    });
  });

  it('seeds static tables without provider fetch logs', () => {
    const db = openDb(':memory:');
    try {
      const result = seedStaticData(db, staticInputs());

      expect(result).toEqual({ groups: 12, stadiums: 16, teams: 48, fixtures: 104 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM teams WHERE code != 'TBD'").get().count).toBe(48);
      expect(db.prepare('SELECT COUNT(*) AS count FROM stadiums').get().count).toBe(16);
      expect(db.prepare('SELECT COUNT(*) AS count FROM fixtures').get().count).toBe(104);
      expect(db.prepare('SELECT COUNT(*) AS count FROM fixtures WHERE is_tbd = 1').get().count).toBe(32);
      expect(db.prepare('SELECT COUNT(*) AS count FROM fetch_log').get().count).toBe(0);
      expect(db.prepare(`
        SELECT ln.name
        FROM teams t
        JOIN localized_names ln ON ln.entity_id = t.id AND ln.entity_type = 'team' AND ln.locale = 'es-MX'
        WHERE t.fifa_code = 'RSA'
      `).get().name).toBe('Sudáfrica');
    } finally {
      closeDb(db);
    }
  });
});
