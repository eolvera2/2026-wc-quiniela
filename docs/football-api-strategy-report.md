# Football Data Provider Strategy Update

**Project:** WC26 Quiniela  
**Updated:** June 2026  
**Decision:** Use **FootballData.io** as the primary football data provider for future data queries.

## Executive Summary

The project should now use **FootballData.io** for future data calls. The user-provided `FOOTBALLDATA_KEY` works with `Authorization: Bearer <key>`, and the free plan can access World Cup metadata, including the World Cup league and 2026 team list. A live test confirmed `GET https://footballdata.io/api/v1/leagues` returns World Cup as `league_id=50`, and `GET /leagues/50/teams?season_id=618` returns **48 teams** for the 2026 World Cup.

## Provider Configuration

```text
Base URL: https://footballdata.io/api/v1
Header:   Authorization: Bearer FOOTBALLDATA_KEY
Docs:     https://footballdata.io/documentation/
```

## Verified World Cup Identifiers

| Entity | ID / value | Source |
|---|---:|---|
| World Cup league | `50` | `GET /leagues` |
| World Cup 2026 season | `618` | `GET /leagues/50/seasons` |
| 2026 teams | `48` | `GET /leagues/50/teams?season_id=618` |
| Known group-stage matches | `72` | `GET /leagues/50/matches?season_id=618` |

## Endpoint Mapping for This Repo

| Requirement | FootballData.io endpoint | Notes |
|---|---|---|
| Resolve season id | `GET /leagues/50/seasons` | Find `year=2026`, currently `season_id=618` |
| Fixtures/matches | `GET /leagues/50/matches?season_id=618` | Paginated; currently returns 72 group-stage matches |
| Teams | `GET /leagues/50/teams?season_id=618` | Returns 48 teams |
| Team stats/form | `GET /teams/{team_id}/stats?season_id=618` | Includes summary, form, goals, cards, corners, xG fields |
| H2H | `GET /teams/{team_id}/h2h/{opponent_id}` | Future ingest target |
| Match odds | `GET /matches/{match_id}/odds` | Includes match winner and other markets when available |
| Usage | `GET /account/usage` | Use for quota checks |
| API health | `GET /meta/status` | Use for monitoring |

## Implementation Notes

- Environment variable is now `FOOTBALLDATA_KEY`.
- The shared client is `src/ingest/footballData.js`.
- The base URL is centralized as `FOOTBALLDATA_BASE_URL = 'https://footballdata.io/api/v1'`.
- The ingest clients use FootballData.io response envelopes (`{ success, data, meta }`).
- Existing DB field names such as `api_football_id` / `apiFootballId` remain for now as internal legacy identifiers. They now store FootballData.io IDs. Renaming the schema can be done later with a migration if desired.

## Open Questions

- Whether knockout-stage matches are added later under the same `season_id=618`; current free data showed 72 known group-stage matches.
- Whether lineups and injuries are available in enough detail for `alineacion_probable`.
- Whether odds become non-zero closer to kickoff for all World Cup matches.

## Recommendation

Proceed with FootballData.io as the free primary data source for World Cup 2026 development. Keep the ingest layer isolated behind `src/ingest/footballData.js` so a secondary provider can be added later if FootballData.io lacks injuries, lineups, or odds depth needed for Phase 2 article types.
