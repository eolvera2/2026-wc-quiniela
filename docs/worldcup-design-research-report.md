# Design Research Report: 2026 World Cup Quiniela Site

## Executive Summary

The recommended direction is a **calendar-first, dark-premium sports experience**: a fixed, dimensional home hero inspired by Thibaut Courtois' site, followed by a scroll-forward tournament calendar where depth equals time. Navigation should stay minimal: **Inicio, Partidos, Equipos**, with a prominent **Mexico / El Tri** shortcut if the audience is primarily Hispanic/LatAm. The visual system should borrow the energy of official 2026 World Cup materials through deep navy, high-contrast white, gold and warm accents, geometric/radial football motifs, and modern sans typography, while avoiding protected FIFA marks, wordmarks, host-city emblems, and campaign lockups.

For this quiniela, the most important design pattern is not a generic sports-news homepage. It is a **match-discovery and prediction funnel**: users land on the next upcoming match, scroll through matchdays, open prediction articles or match cards, and quickly understand teams, kickoff time, group/stage, and what action they can take. The experience should feel editorial, cinematic, and tournament-native, but the interaction model must remain practical, static-site-friendly, mobile-first, accessible, and fast.

## Research Basis

This synthesis draws from delegated research across eight areas:

| Research thread | Key sources examined | Main contribution |
|---|---|---|
| Award-winning sports sites | Awwwards sports/football catalogs, Behance sports and WC26 concepts, APWin, BetRoom | Dark-first sports aesthetic, bold condensed type, animated card grids, horizontal navigation |
| Curated sports trends | FIFA, NYNJ WC26, David Alaba, BBC Sport, Premier League, NBA, ESPN, NFL | Modern production sports patterns: hero, countdown, card grids, rails, sticky nav |
| Thibaut Courtois inspiration | `thibautcourtois.com` and CSS | Fixed hero, grid-offset scroll depth, minimal nav, tile reveal pacing |
| Official WC26 aesthetics | FIFA WC26 portal, NYNJ host-city site, agency/brand references | Deep navy, Poppins/Noto Sans, countdown/schedule modules, radial geometry |
| Hispanic/LatAm sports UX | TUDN World Cup calendar, TUDN groups/stadiums, Record.com.mx | Date tabs, match cards, Spanish schedule taxonomy, Mexico shortcut |
| Quiniela/prediction UX | ElQuinielista, fantasy/pick'em patterns, NNGroup, Laws of UX | Three-choice prediction pattern, social proof, leaderboards, anti-sportsbook framing |
| Motion/accessibility | Chrome scroll-driven animations, NNGroup parallax research, WCAG, A11y Project | Progressive motion, reduced-motion fallback, scroll-snap constraints, performance model |
| Design-system structure | DTCG tokens, Utopia, CUBE CSS, Every Layout | Token architecture, fluid type/space, component primitives, static CSS approach |

## Recommended Design Pattern

### 1. Calendar-first dimensional homepage

The homepage should be organized around the tournament calendar, not news. The top of the page should behave like a **fixed cinematic match hero**: a full-viewport dark stadium/tournament atmosphere with the next upcoming match, kickoff time, venue, and two large destinations: **Partidos** and **Equipos**. As the user scrolls, the calendar content slides up over the fixed hero, creating the depth effect from the Courtois reference.[^1]

Recommended structure:

```text
Fixed homepage hero
  Logo / minimal nav
  MUNDIAL 2026 or QUINIELA 2026 display title
  Proximo partido: Team A vs Team B
  Kickoff time, venue, stage
  Hero nav: Partidos | Equipos

Scroll offset
  Creates dimensional depth as the calendar rises over the hero

Calendar timeline
  Horizontal day tabs
  Date-grouped match cards
  Featured prediction spotlight cards
  Round dividers: Fase de grupos, Octavos, Cuartos, Semifinales, Final
```

This should make **scroll depth equal tournament depth**: users move from opening matchdays toward the final as they move down the page. That gives the scroll effect real information architecture rather than decorative parallax.[^2]

### 2. Minimal navigation

Use a sparse top nav:

| Surface | Recommended nav |
|---|---|
| Desktop | Logo left, `Partidos`, `Equipos`, optional `Mi Quiniela` or `Pronosticos Mexico` |
| Mobile | Compact header plus hamburger or bottom tab bar with no more than 4-5 items |
| Homepage hero | Large uppercase links: `PARTIDOS` and `EQUIPOS` |
| Match/calendar pages | Sticky horizontal filter rail for dates, groups, or rounds |

The Courtois reference works because it has very few destinations and repeats the key links inside the hero as visual elements.[^3] TUDN and Record show that Spanish-language football audiences expect direct shortcuts to World Cup sections and, especially, Mexico/El Tri content.[^4]

### 3. Match cards instead of article links

Every generated match page should be represented on the homepage by a match card, not a text link. The card should include:

| Element | Purpose |
|---|---|
| Status pill | `Previa`, `En vivo`, `Cerrado`, or `Final` |
| Stage label | `Grupo A - Jornada 1`, `Octavos`, etc. |
| Date/time | Localized Spanish format and timezone |
| Teams | Flags/crests, names, and central `VS` |
| Venue | Stadium/host city when known |
| CTA | `Ver pronostico` or `Hacer quiniela` |

TUDN's calendar uses horizontal date tabs, responsive score-card grids, stage/date grouping, and match links as the primary World Cup schedule pattern.[^5] NYNJ WC26 uses a simpler vertical schedule list with date/time above the match name, which is useful as the fallback pattern for early versions.[^6]

## Homepage Experience Blueprint

### Hero zone

Use a deep navy/near-black fullscreen hero with a subtle stadium or abstract football-geometry background. Avoid autoplay video for performance. The hero should carry:

- Site identity: `Quiniela Mundial 2026`
- Promise: `Pronostica los partidos del Mundial con tus amigos. Sin apuestas, solo diversion.`
- Next match module: `Mexico vs Sudafrica - Jue 11 Jun - 19:00 UTC`
- Primary CTA: `Ver calendario`
- Secondary CTA: `Explorar equipos`
- Scroll cue: `Desliza para ver partidos`

### Calendar zone

Use a date tab strip like:

```text
[jue / jun 11] [vie / jun 12] [sab / jun 13] [dom / jun 14] ...
```

The research found this pattern directly in TUDN's World Cup calendar HTML: each date tab is a button with Spanish day abbreviation, bold date, horizontal scrolling, snap behavior, and a mobile edge fade.[^5]

Below the date tabs, show grouped match cards:

```text
Jueves, 11 de junio
  Mexico vs Sudafrica
  Canada vs TBD

Viernes, 12 de junio
  Estados Unidos vs TBD
  ...
```

### Spotlight cards

Every 3-4 match cards, insert a non-repetitive visual break:

- `Partido destacado`
- `Pronostico de la jornada`
- `Grupo caliente`
- `Mexico juega hoy`
- `Cierra pronto`

This adapts the Courtois pacing model, where article/image cards are interrupted by stats and video cards to keep a long scroll from becoming monotonous.[^7]

### Match detail page

Recommended order:

1. Match hero: teams, time, venue, stage.
2. `Puntos clave` callout.
3. `Pronostico y momios` section if betting analysis exists.
4. `Veredicto de quiniela`.
5. `Alineacion probable`.
6. `Analisis para apostar`.
7. Related matches / same group.
8. Footer disclaimer.

For a social quiniela version, the match card should use three prediction buttons: `1 Local`, `X Empate`, `2 Visitante`. The research recommends three choices because classic quiniela constraints reduce decision time and avoid sportsbook complexity.[^8]

## Recommended Design System Summary

The full implementation design system is documented separately in `docs\worldcup-design-system.md`. Its core principles are:

1. **Tournament-native, not trademark-dependent**: Use dark World Cup energy, geometric football motifs, and host-city accents without using FIFA emblems or lockups.
2. **Calendar clarity first**: Every visual flourish must help users understand when matches happen and where to go.
3. **Spanish-first**: Dates, states, CTAs, and disclaimers should feel natural to Hispanic/LatAm football fans.
4. **Static-first, enhanced later**: The base experience must work as plain HTML and CSS; scroll effects are progressive enhancement.
5. **Social game, not sportsbook**: Avoid betting-site vocabulary, casino colors, chips, wallets, and pressure tactics.

## Hispanic/LatAm UX Recommendations

### Use Spanish sports taxonomy

Prefer:

- `Partidos`
- `Calendario`
- `Equipos`
- `Grupos`
- `Pronosticos`
- `Quiniela`
- `Mexico`
- `Hoy`
- `En vivo`
- `Previa`

Avoid over-English terms like `Matches`, `Teams`, or `Leaderboard` unless the site has bilingual mode.

### Add a Mexico shortcut

Both TUDN and Record-style navigation patterns give Mexico/El Tri privileged visibility.[^4] For this audience, a shortcut like `Mexico` or `Pronosticos Mexico` is not just fan service; it is a navigation accelerator.

### Make the calendar familiar

TUDN's calendar demonstrates the expected Hispanic sports pattern:

- Spanish day abbreviations.
- Bold month/day date tabs.
- Horizontal scrolling on mobile.
- Match cards grouped by date.
- `Mundial`, group, and round labels.
- Match URLs in `equipo-a-vs-equipo-b` style.[^5]

### Tone

Use a knowledgeable-fan voice:

- `Hoy juega Mexico: claves para llenar tu quiniela`
- `Partido cerrado: cuidado con el empate`
- `Tu grupo todavia puede cambiar de lider`
- `Sin apuestas, solo orgullo mundialista`

Avoid sportsbook pressure:

- No `gana dinero`.
- No chip/wallet language.
- No neon casino look.
- No flashing urgency.

## Accessibility and Performance Guardrails

### Accessibility

Required:

- Body text at least 16px.
- Touch targets at least 44px where possible.
- Color contrast of at least WCAG AA.
- Do not rely on color alone for result states; use icons/text.
- Respect `prefers-reduced-motion`.
- Keep date tabs keyboard-focusable buttons or links.
- Use semantic headings by date/round.
- For prediction controls, use real buttons/radio groups.

The motion research highlighted WCAG 2.2 Animation from Interactions and Pause/Stop/Hide concerns, especially for parallax and continuous motion.[^12]

### Performance

Required:

- Static HTML/CSS first.
- No video hero by default.
- Use WebP/AVIF responsive images.
- Use `content-visibility: auto` for long match groups.
- Avoid WebGL/Three.js for the initial version.
- Gate advanced scroll animations with `@supports`.
- Keep long calendars chunked by matchday/round.

The 2026 World Cup has 104 matches, so rendering performance matters. The motion research specifically recommended `content-visibility: auto` with intrinsic size hints for long fixture lists.[^13]

## IP and Brand-Safety Boundaries

Use:

- Deep navy, gold, white, and football green.
- Open fonts such as Poppins, Noto Sans, Barlow Condensed, or Inter.
- Generic radial geometry, football-panel shapes, stadium light motifs.
- National flag emoji or licensed flag assets.
- Host-city-inspired accent colors.
- Spanish football language and match schedule patterns.

Avoid:

- Official FIFA World Cup 26 emblem.
- Trophy/26 logo lockup.
- FIFA wordmark treatment.
- Host-city official logos.
- `#WeAre26` / `#Somos26` as primary brand headline.
- Official campaign assets or mascot.
- Pixel-copying FIFA/TUDN/Courtois components.

The safe design posture is **inspired by tournament atmosphere, not derivative of protected brand assets**.

## Implementation Priority

### Phase 1: Foundation

1. Add global CSS with tokens, typography, surfaces, links, focus states.
2. Convert the homepage from bare links to date-grouped match cards.
3. Add minimal header navigation: Inicio, Partidos, Equipos.
4. Add Spanish date formatting and stage labels.
5. Add match-page hero styling.

### Phase 2: Calendar experience

1. Add horizontal date tabs.
2. Add round/group dividers.
3. Add next-match hero.
4. Add spotlight cards.
5. Add `SportsEvent` structured data per match, following TUDN's observed pattern.[^5]

### Phase 3: Dimensional polish

1. Add fixed hero + scroll offset.
2. Add card reveal animations behind reduced-motion checks.
3. Add sticky header blur/shrink.
4. Add content-visibility for match groups.
5. Add view transitions only as progressive enhancement.

### Phase 4: Quiniela/social layer

1. Add 1/X/2 prediction controls.
2. Add group progress and mini-leaderboard.
3. Add WhatsApp sharing.
4. Add post-match reveal cards.
5. Add transparent rules and non-gambling trust badges.

## Final Recommendation

Build the site around a **scrolling tournament calendar** pattern:

> A dark, cinematic World Cup hero introduces the next match; the user scrolls down through the tournament timeline, with each match presented as a high-clarity card and each stage gaining visual weight as the calendar approaches the final.

The design should feel premium like award-winning sports microsites, but function like a familiar Spanish-language football calendar. Thibaut Courtois' site should inspire the **depth mechanics and minimal navigation**, TUDN should inspire the **calendar and Hispanic sports information architecture**, FIFA/NYNJ should inspire the **event tone and palette**, and quiniela/fantasy research should guide the **prediction and social mechanics**.

## Confidence Assessment

**High confidence**

- Dark-first sports palettes, bold type, card grids, sticky nav, countdowns, and horizontal rails are recurring patterns across modern sports sites and official WC26-related sources.
- The Courtois fixed-hero/grid-offset pattern translates cleanly to a calendar-first homepage.
- TUDN's date-tab and match-card patterns are directly relevant for a Spanish-language World Cup audience.
- Reduced-motion and non-scrolljacking constraints are necessary for accessibility.
- The site should avoid official FIFA/host-city marks and use only inspired, generic visual language.

**Medium confidence**

- Exact official WC26 palette beyond public HTML/meta-level colors is not fully public in the delegated findings.
- Host-city accent colors should be treated as editorial/inspired, not official.
- Some award-gallery sources were inaccessible or partially blocked, so findings rely on accessible pages, source HTML, and curated examples.

**Assumptions**

- The site remains Spanish-first.
- The first implementation is static-site friendly.
- The product direction includes match previews today and may later include actual social quiniela entry.
- The audience includes Hispanic/LatAm fans with strong Mexico interest.

## Footnotes

[^1]: Thibaut Courtois site analysis from delegated research: `https://www.thibautcourtois.com/` and `https://www.thibautcourtois.com/assets/styles/css/screen.css`; key pattern: fixed full-viewport hero, grid offset, content sliding over fixed hero.

[^2]: Scroll/motion delegated research citing Chrome Scroll-Driven Animations: `https://developer.chrome.com/docs/css-ui/scroll-driven-animations`; dimensional mapping: tournament phases as scroll depth.

[^3]: Thibaut Courtois delegated research: top fixed header plus hero navigation list; source `https://www.thibautcourtois.com/`.

[^4]: Hispanic sports UX delegated research citing TUDN World Cup navigation and Record.com.mx tournament taxonomy: `https://www.tudn.com/mundial-2026/calendario-horarios`, `https://www.tudn.com/mundial-2026/grupos`, `https://www.record.com.mx`.

[^5]: TUDN delegated research, raw HTML observations for date tabs, score-card grid, `SportsEvent` JSON-LD, and World Cup subnavigation: `https://www.tudn.com/mundial-2026/calendario-horarios`.

[^6]: Official WC26/NYNJ delegated research: `https://nynjfwc26.com/`; observed countdown, match schedule list, dark event layout, bilingual `#WeAre26` / `#Somos26` tone.

[^7]: Thibaut Courtois delegated research: card pacing in `.grid-home`, mixing image cards, stat cards, and video cards; source `https://www.thibautcourtois.com/`.

[^8]: Quiniela UX delegated research citing Hick's Law and traditional 1/X/2 quiniela constraints: `https://lawsofux.com/hicks-law/`, `https://www.nngroup.com/articles/progressive-disclosure/`.

[^9]: Design-system delegated research citing Design Tokens Community Group and Utopia: `https://www.designtokens.org/glossary/`, `https://utopia.fyi/type/calculator/`, `https://utopia.fyi/space/calculator/`.

[^10]: Official WC26 delegated research and sports trend research citing FIFA.com HTML metadata and font preloads: `https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026`; observed `#020F2A`, `#326295`, Poppins, and Noto Sans.

[^11]: Award-winning sports delegated research citing Awwwards football/sports categories, APWin, Behance sports concepts, and NYNJ WC26: `https://www.awwwards.com/websites/sports/`, `https://www.awwwards.com/websites/football/`, `https://www.awwwards.com/sites/apwin-football-predictions`, `https://www.behance.net/search/projects?search=world+cup+2026+soccer+website+UI`.

[^12]: Motion/accessibility delegated research citing NNGroup parallax usability, WCAG animation guidance, and A List Apart motion sensitivity: `https://www.nngroup.com/articles/parallax-usability/`, `https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html`, `https://alistapart.com/article/designing-safer-web-animation-for-motion-sensitivity/`.

[^13]: Motion/performance delegated research citing web.dev content visibility and Core Web Vitals guidance: `https://web.dev/articles/content-visibility`, `https://web.dev/articles/lcp`, `https://web.dev/articles/cls`, `https://web.dev/articles/inp`.
