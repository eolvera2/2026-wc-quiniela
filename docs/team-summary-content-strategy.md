# Strategy for "Resumen de equipos" Content Without API Calls

## Executive Summary

Use a source-tiered editorial workflow instead of API calls: official sites for hard facts, results/stat references for recent form, reputable media for analyst expectations, local-language outlets for team-specific context, and odds aggregators for market-implied expectations. The key is to separate **facts** (scores, fixtures, rankings, injuries), **analysis** (coach style, squad strengths/weaknesses), and **prediction framing** (odds and analyst expectations), with every time-sensitive claim date-stamped and attributed.

For Mexico, the strongest summary angle is: a home host with real group-stage advantages, recent CONCACAF titles under Javier Aguirre, major crowd/altitude benefits, but lingering questions from inconsistent form against stronger global opponents and injury/selection debates. A concise page intro should not sound like a betting pick; it should be an executive brief that explains what matters for a quiniela decision.

## Query Type

This is a **Process / Strategy** research question with a concrete example deliverable. The report therefore focuses on source selection, workflow, governance, and a Mexico test summary rather than code implementation.

## Recommended Source Strategy

### 1. Official sources: facts only

Use official sources for fixtures, squads, disciplinary updates, official rankings, venue details, and federation statements. FIFA and federation pages can be valuable for manual research, but research found that FIFA.com and several federation sites are often JavaScript-heavy and poor candidates for automated reading. Use them manually when needed and cite the URL/date accessed.[^1]

Best uses:

| Source type | Use in summary | Notes |
|---|---|---|
| FIFA / official World Cup pages | Fixtures, groups, venues, squad announcements | Manual read/cite; avoid copying official text |
| Confederation sites | Qualifying path, regional tournament context | CONCACAF/UEFA/CONMEBOL/CAF/AFC/OFC |
| National federation pages/social | Squad, injuries, coach statements | Varies strongly by country |

### 2. Results and stat references: recent form

For no-API research, prioritize public score/stat references for recent friendlies, competitive results, head-to-heads, lineups, and form. Soccerway and Flashscore were identified as especially useful for recent results; FBref and Transfermarkt are valuable but often block automated environments and should be treated as manual-read references.[^2]

Best uses:

| Source | Use | Caveat |
|---|---|---|
| Soccerway | Results, fixtures, H2H | Cite with access date |
| Flashscore | Fast recent results/form | Manual verification preferred |
| FBref | xG, advanced stats, player/team stats | Manual read only; no scraping |
| Transfermarkt | Squad age, club, market-value context | Market values are estimates, not facts |
| Sofascore / FotMob | Live lineups, ratings, match stats | Manual reference only; ToS/anti-bot caveats |

### 3. Analyst/editorial sources: expectations and narrative

Use established media for the "what to watch" layer: coach pressure, tactical style, squad concerns, key players, analyst rankings, and tournament ceiling. Research found The Athletic/NYT, Guardian, BBC Sport, AP News, ESPN, Yahoo Sports, CBS Sports, Marca, AS, and local-language outlets useful, with different strengths.[^3]

Recommended weighting:

| Tier | Source type | How to use |
|---|---|---|
| High | AP, Reuters, BBC, Guardian | Factual reporting, match reports, injury/news confirmation |
| High | The Athletic/NYT public teasers | Analyst rankings, team guides, tactical framing; do not use paywalled body text |
| Medium | ESPN, CBS, Yahoo Sports | US/global context; cite original source if Yahoo republishes |
| High for local context | TUDN, RÉCORD, MedioTiempo, Marca, AS | Spanish-language narratives, fan/media expectations, press-conference context |
| Team-specific | Local-language outlets by country | Essential for Tier 2-3 teams where English coverage is thin |

### 4. Betting and odds sources: market signal, not certainty

Use odds as a market-implied expectation layer, not as a prediction guarantee. For Mexico, public aggregators showed Mexico as a deep outright longshot but slight Group A favorite, which is exactly the type of concise market context useful for a quiniela page.[^4]

Recommended phrasing:

| Say | Avoid |
|---|---|
| "El mercado lo perfila como favorito ligero del grupo" | "México va a ganar el grupo" |
| "Los momios sugieren una probabilidad implícita baja de título" | "México no tiene oportunidad" |
| "Para fines de entretenimiento; los momios cambian" | "Apuesta segura" |

## Editorial Workflow for 48 Team Summaries

### Step 1: Build a one-page source packet per team

For each team, capture:

1. Official profile: group, fixtures, venue, coach, squad status.
2. Recent form: last 5-8 matches, with friendlies marked separately from competitive games.
3. Key players: 2-4 names, role, current form or availability.
4. Tactical/state-of-team note: coach style, known strengths/risks.
5. Analyst expectation: consensus from 2-3 reputable previews.
6. Market signal: outright odds, group odds, match odds when available.
7. Confidence notes: what is confirmed vs. inferred.

### Step 2: Use a three-bucket claim system

| Bucket | Example | Rule |
|---|---|---|
| Hard fact | "México ganó la Gold Cup 2025" | Must have direct citation |
| Informed analysis | "Aguirre ha estabilizado al equipo" | Must be supported by multiple facts/sources |
| Prediction framing | "Debería competir por avanzar de grupo" | Hedge language and entertainment disclaimer |

### Step 3: Keep each summary concise and repeatable

Recommended Spanish structure for each page's **Resumen de equipos** section:

```text
[Equipo] llega a este partido con [estado actual en una frase]. Su contexto reciente combina [forma/resultados] con [fortaleza principal] y [riesgo principal]. Para tu quiniela, la clave será observar [2-3 factores concretos: localía, bajas, estilo, eficacia ofensiva, balón parado, etc.]. Los analistas/mercado lo perfilan como [favorito / parejo / underdog], pero [caveat específico].
```

Target length per team card: **120-180 words** for match pages. Keep the longer 350-500 word profile for a dedicated team page if one exists.

### Step 4: Refresh cadence

| Moment | What changes | Sources |
|---|---|---|
| Baseline | Team profile, coach, style, key players | Official, Wikipedia/manual, media guides |
| T-10 days | Recent form, squad, group context, early odds | Results sites, media previews, odds aggregators |
| T-48 hours | Injuries, suspensions, likely XI, odds movement | Official socials, AP/BBC/local media, sportsbooks |
| T-3 hours | Confirmed lineups and late news | Official lineups, live score sites |
| Post-match | Result-based update | Match report and score source |

### Step 5: Citation and copyright hygiene

Facts and scores can be summarized, but article expression cannot be copied. Use short attributed quotes only when needed, never reproduce full paragraphs, cite the original outlet rather than an aggregator, and do not scrape or bypass paywalls/anti-bot systems.[^5]

## Mexico Test Example

### Mexico source packet

| Category | Finding |
|---|---|
| Group/fixtures | Mexico is in Group A with South Africa, South Korea, and Czech Republic; it opens against South Africa at Estadio Azteca, then faces South Korea in Guadalajara and Czech Republic in Mexico City.[^6] |
| Coach/style | Javier Aguirre leads Mexico; The Athletic public preview material described Mexico around a 4-3-3, quick-transition structure rather than a possession-first identity.[^7] |
| Recent trophies | Mexico won the 2025 CONCACAF Nations League and 2025 Gold Cup; Raúl Jiménez drove the Nations League run, and Edson Álvarez scored the Gold Cup final winner against the U.S.[^8] |
| Recent form concern | Guardian reporting described Mexico as winless in six autumn 2025 friendlies against World Cup-bound teams, before later pre-tournament wins over Ghana and Australia.[^9] |
| Key players | Raúl Jiménez, Santiago Giménez, Edson Álvarez, Johan Vásquez, Gilberto Mora, and Guillermo Ochoa are recurring names across analyst/squad coverage.[^10] |
| Betting signal | Mexico was reported around +6600 to win the World Cup, but +110 to +120 to win Group A, making it a tournament longshot but slight group favorite.[^11] |
| Narrative | Mexican media emphasized the goalkeeper debate, Rafa Márquez's emotional South Africa 2010 connection, home crowd demand, and the pressure of playing as host.[^12] |

### Mexico: draft "Resumen de equipos" copy

**México llega al Mundial como anfitrión con una mezcla de impulso, presión y dudas razonables.** El equipo de Javier Aguirre recuperó credibilidad con los títulos de Nations League y Gold Cup en 2025, y la localía en Ciudad de México y Guadalajara debe darle un entorno favorable: altura, apoyo masivo y familiaridad con las condiciones. Para la quiniela, el punto fuerte está en su ventaja contextual dentro del Grupo A y en una base competitiva liderada por Edson Álvarez, Raúl Jiménez, Santiago Giménez y Johan Vásquez.

El riesgo es que el techo competitivo todavía no está completamente probado ante rivales de élite: reportes previos al torneo marcaron una racha sin triunfos en seis amistosos contra selecciones mundialistas, además de debates en portería, lesiones/recuperaciones y presión mediática. Los momios lo tratan como favorito ligero de grupo, no como candidato fuerte al título; por eso, la lectura prudente es México competitivo para avanzar, pero con señales que conviene revisar partido a partido.

### Mexico: what to watch for prediction pages

| Signal | Why it matters for quiniela |
|---|---|
| Home venue and altitude | Estadio Azteca can tilt tempo, fatigue, and game-state expectations |
| First goal / set pieces | Recent tournament success included decisive headers, penalties, and dead-ball moments |
| Jiménez vs. Santiago Giménez roles | Determines whether Mexico plays direct, dual-forward, or transition-heavy |
| Edson Álvarez fitness/form | Central to ball-winning, defensive balance, and leadership |
| Goalkeeper decision | Ochoa/Rangel debate affects experience vs. current-form tradeoff |
| Market movement | If group/match odds shorten late, it may reflect lineup or injury confidence |

## Recommended Operating Model

1. Create a `team_source_packet` for all 48 teams with citations and access dates.
2. Store one baseline Spanish editorial note per team.
3. Before each match page is generated, refresh only volatile fields: injuries, recent result, likely XI, and odds.
4. Generate summaries from the packet, not directly from raw public articles.
5. Keep the displayed card short; keep citations/source notes in internal metadata or an expandable "fuentes" area if needed.

## Confidence Assessment

High confidence: the source-tiering model, need for fact/opinion separation, no-paywall/no-scraping approach, Mexico's Group A context, recent CONCACAF title narrative, and Mexico's betting-market positioning as a group favorite but tournament longshot.

Medium confidence: specific tactical labels and some player-status details, because they depend on article previews, public teasers, and fast-moving injury context.

Lower confidence: exact full list of Mexico friendlies in late 2025 and early 2026; research found a credible Guardian summary of the trend but not every score/opponent from public pages in this pass.

## Footnotes

[^1]: Research subagent report, "Public Sources for Resumen de Equipos — México · WC2026"; FIFA pages tested included `https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/teams/mex-mexico` and FIFA article pages, which returned JavaScript shells in the research environment. FIFA ranking page tested: `https://inside.fifa.com/en/fifa-world-ranking/men`.
[^2]: Research subagent report, "Source Matrix: All 48 WC 2026 Teams — Public Web Research (No-API)", Results & Statistical References section; cited source URLs include `https://int.soccerway.com/international/world/world-cup/2026-world-cup/`, `https://www.flashscore.com/football/world/world-championship-2026/`, `https://fbref.com/en/comps/1/FIFA-World-Cup-Stats`, and `https://www.transfermarkt.com/weltmeisterschaft-2026/teilnehmer/pokalwettbewerb/WM26`.
[^3]: Research subagent report, "Seven categories of sources are viable for a no-API, read-and-summarize workflow"; cited URLs include `https://www.bbc.com/sport/football/world-cup`, `https://apnews.com/hub/fifa-world-cup`, `https://www.theguardian.com/football/world-cup-2026`, `https://sports.yahoo.com/soccer/`, `https://www.cbssports.com/soccer/`, and `https://www.nytimes.com/athletic/football/world-cup/`.
[^4]: Betting research subagent report; cited URLs include `https://www.covers.com/world-cup/odds`, `https://www.covers.com/world-cup`, `https://www.sportsbettingdime.com/soccer/futures/world-cup-odds/`, `https://www.sportsbettingdime.com/soccer/world-cup/`, `https://www.sportsbettingdime.com/soccer/world-cup/underdogs/`, and `https://www.sportsbettingdime.com/soccer/world-cup/public-betting-trends/`.
[^5]: Editorial workflow research subagent report; cited guidance included U.S. Copyright Office fair use page `https://www.copyright.gov/fair-use/more-info.html`, Cornell Wex fair use page `https://www.law.cornell.edu/wex/fair_use`, Google helpful content guidance `https://developers.google.com/search/docs/fundamentals/creating-helpful-content`, and VegasInsider editorial policy `https://www.vegasinsider.com/editorial-policy/`.
[^6]: Research subagent report citing local openfootball schedule: `data/static/openfootball/cup.txt:25,78-87`; also cross-referenced with The Athletic squad/team guide public URLs `https://www.nytimes.com/athletic/7323193/2026/06/01/mexico-world-cup-squad-2026-ochoa/` and `https://www.nytimes.com/athletic/7329789/2026/06/07/world-cup-2026-team-guides/`.
[^7]: Global source research subagent report citing The Athletic team guide `https://www.nytimes.com/athletic/7329789/2026/06/07/world-cup-2026-team-guides/` and rankings/dark-horse articles `https://www.nytimes.com/athletic/7329359/2026/06/06/world-cup-2026-teams-ranked/`, `https://www.nytimes.com/athletic/7323636/2026/06/04/world-cup-dark-horses-ecuador-mexico-japan-norway-and-senegal/`.
[^8]: Mexico recent-results research subagent citing Guardian match reports: Nations League semifinal `https://www.theguardian.com/football/2025/mar/21/mexico-canada-concacaf-nations-league-raul-jimenez`, Nations League final `https://www.theguardian.com/football/2025/mar/24/mexico-concacaf-nations-league-panama-raul-jimenez`, Jiménez feature `https://www.theguardian.com/football/2025/mar/25/raul-jimenez-nations-league-mexico-fulham`, Gold Cup final `https://www.theguardian.com/football/2025/jul/06/usa-mexico-gold-cup-final-edson-alvarez`.
[^9]: Mexico recent-results research subagent citing Guardian reports: `https://www.theguardian.com/sport/2026/mar/20/mexico-canada-world-cup-squad-injuries`, `https://www.theguardian.com/football/2026/may/29/mexico-hope-a-month-of-isolation-can-rekindle-the-magic-of-the-1986-world-cup`, `https://www.theguardian.com/football/2026/may/31/mexico-v-australia-socceroos-football-friendly-report`.
[^10]: Global source and Spanish media research subagent reports citing The Athletic squad article `https://www.nytimes.com/athletic/7323193/2026/06/01/mexico-world-cup-squad-2026-ochoa/`, rankings article `https://www.nytimes.com/athletic/7329359/2026/06/06/world-cup-2026-teams-ranked/`, RÉCORD RSS-derived article URLs including `https://www.record.com.mx/historia/ronaldinho-se-rinde-ante-santiago-gimenez-me-encanta-2026060602305303855` and `https://www.record.com.mx/historia/gil-mora-y-craig-gordon-del-adolescente-mexicano-al-veterano-escoces-el-mundial-2026-abre-una-brecha-de-casi-26-anos-2026060522282025284`.
[^11]: Betting research subagent citing Covers and SportsBettingDime: `https://www.covers.com/world-cup/odds`, `https://www.covers.com/world-cup`, `https://www.sportsbettingdime.com/soccer/world-cup/`, and `https://www.sportsbettingdime.com/soccer/world-cup/underdogs/`.
[^12]: Spanish-language media research subagent citing RÉCORD RSS and article metadata, including goalkeeper debate URLs `https://www.record.com.mx/historia/ochoa-aspira-a-jugar-con-al-seleccion-mexicana-ante-sudafrica-en-el-mundial-2026-2026060714154927926`, `https://www.record.com.mx/historia/veo-bien-a-tala-rangel-conejo-perez-tiene-a-su-favorito-ante-sudafrica-2026060720091501017`, Rafa Márquez/South Africa narrative `https://www.record.com.mx/historia/bernard-parker-no-olvida-a-rafa-marquez-fue-el-futbolista-mas-duro-de-mexico-2026060701010893111`, and fan/ticket demand `https://www.record.com.mx/historia/aficionados-denuncian-fallas-en-reventa-de-boletos-fifa-para-partidos-de-mexico-2026060719394984709`.
