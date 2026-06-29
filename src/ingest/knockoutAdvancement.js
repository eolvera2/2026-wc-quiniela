export function advanceKnockoutBracketFromFinalScores(db) {
  const resolved = db.prepare(`
    SELECT f.id,
           f.match_number AS matchNumber,
           f.final_home_score AS finalHomeScore,
           f.final_away_score AS finalAwayScore,
           ht.id AS homeTeamId,
           at.id AS awayTeamId,
           COALESCE(hln.name, ht.name) AS homeTeam,
           COALESCE(aln.name, at.name) AS awayTeam
    FROM fixtures f
    JOIN teams ht ON ht.id = f.home_team_id
    JOIN teams at ON at.id = f.away_team_id
    LEFT JOIN localized_names hln ON hln.entity_type = 'team' AND hln.entity_id = ht.id AND hln.locale = 'es-MX'
    LEFT JOIN localized_names aln ON aln.entity_type = 'team' AND aln.entity_id = at.id AND aln.locale = 'es-MX'
    WHERE f.stage = 'knockout'
      AND f.match_number IS NOT NULL
      AND f.final_home_score IS NOT NULL
      AND f.final_away_score IS NOT NULL
  `).all();

  let applied = 0;
  const warnings = [];
  for (const fixture of resolved) {
    if (fixture.finalHomeScore === fixture.finalAwayScore) {
      warnings.push(`Cannot advance tied knockout final score for match ${fixture.matchNumber}; winner is not explicit.`);
      continue;
    }

    const winner = fixture.finalHomeScore > fixture.finalAwayScore
      ? { id: fixture.homeTeamId, name: fixture.homeTeam }
      : { id: fixture.awayTeamId, name: fixture.awayTeam };
    const loser = fixture.finalHomeScore > fixture.finalAwayScore
      ? { id: fixture.awayTeamId, name: fixture.awayTeam }
      : { id: fixture.homeTeamId, name: fixture.homeTeam };

    applied += applyBracketReference(db, `W${fixture.matchNumber}`, winner);
    applied += applyBracketReference(db, `L${fixture.matchNumber}`, loser);
  }

  applied += finalizeResolvedTbdKnockoutFixtures(db);
  return { applied, warnings };
}

function applyBracketReference(db, reference, team) {
  let applied = 0;
  for (const side of ['home', 'away']) {
    const labelColumn = side === 'home' ? 'tbd_home_label' : 'tbd_away_label';
    const teamColumn = side === 'home' ? 'home_team_id' : 'away_team_id';
    const result = db.prepare(`
      UPDATE fixtures
      SET ${teamColumn} = @teamId,
          ${labelColumn} = @teamName,
          updated_at = datetime('now')
      WHERE stage = 'knockout'
        AND is_tbd = 1
        AND ${labelColumn} = @reference
    `).run({
      teamId: team.id,
      teamName: team.name,
      reference,
    });
    applied += result?.changes || 0;
  }
  return applied;
}

function finalizeResolvedTbdKnockoutFixtures(db) {
  const result = db.prepare(`
    UPDATE fixtures
    SET is_tbd = 0,
        status = CASE WHEN status = 'tbd' THEN 'scheduled' ELSE status END,
        tbd_home_label = NULL,
        tbd_away_label = NULL,
        updated_at = datetime('now')
    WHERE stage = 'knockout'
      AND is_tbd = 1
      AND home_team_id != 0
      AND away_team_id != 0
      AND tbd_home_label NOT GLOB '[WL][0-9]*'
      AND tbd_away_label NOT GLOB '[WL][0-9]*'
  `).run();
  return result?.changes || 0;
}
