# Research Plan: 2026 World Cup Quiniela Design Pattern and Design System

## Problem and approach

The goal is to produce a comprehensive design research report recommending a modern, sports-oriented design pattern and design system for the 2026 World Cup quiniela site. The report should synthesize inspiration from award-winning sports websites, Thibaut Courtois' dimensional/minimal navigation aesthetic, official World Cup 2026 visual language, and familiar Hispanic/LatAm football media UX.

This is a conceptual/design research task, not a technical implementation deep-dive. The final output should be a practical design direction the project can later implement: navigation model, homepage experience, visual system, content patterns, components, accessibility constraints, and IP-safe boundaries.

## Research already delegated

Eight focused research agents have been dispatched:

1. Award-winning and Awwwards-style sports website patterns.
2. DesignRush and curated sports website trend analysis.
3. Thibaut Courtois site aesthetic, navigation, and dimensional scrolling.
4. Official 2026 World Cup/FIFA/NYNJ visual and interaction cues.
5. Hispanic/LatAm sports media UX, especially TUDN World Cup calendar patterns.
6. Quiniela, prediction pool, fantasy sports, and betting-adjacent UX patterns.
7. Scroll-depth, parallax, dimensional storytelling, and accessibility constraints.
8. Design-system structure for a small static sports content site.

## Final report structure

The final report has been created at `docs\worldcup-design-research-report.md`, and the reusable implementation design system has been created at `docs\worldcup-design-system.md`.

The report includes:

1. Executive summary with the recommended overall direction.
2. Research synthesis across top sports sites, official World Cup aesthetics, Thibaut Courtois, TUDN/Hispanic sports UX, and quiniela mechanics.
3. Recommended design pattern:
   - Minimal top navigation.
   - Calendar-first home page.
   - Depth-based scroll storytelling for upcoming matches.
   - Direct routes to Teams and Matches.
   - Mobile-first match cards rather than dense tables.
4. Recommended design system:
   - Color palette inspired by, but not copying, WC26 aesthetics.
   - Typography hierarchy.
   - Spacing, radius, shadows, motion, and responsive breakpoints.
   - Core components: hero, match card, team chip, round divider, countdown, prediction panel, CTA, nav, footer, legal/trust modules.
5. Homepage experience model:
   - Opening hero.
   - Scroll-depth calendar journey.
   - Upcoming matches layer.
   - Featured match spotlight.
   - Teams/matches shortcuts.
6. Navigation recommendation:
   - Home, Matches, Teams, optional Standings/Leaderboard later.
   - Minimal menu on desktop and mobile.
7. Accessibility and performance constraints:
   - Reduced-motion fallback.
   - Contrast-safe dark palette.
   - Avoid scroll effects that block content access.
   - Static-first, progressive-enhancement approach.
8. IP and brand-safety boundaries:
   - Avoid official FIFA marks, emblems, host city logos, and campaign lockups.
   - Use generic football geometry, national flags, host-city-inspired color accents, and open fonts.
9. Confidence assessment:
   - What is strongly supported by sources.
   - What is inferred from design synthesis.
   - Any gaps caused by inaccessible or paywalled design articles.
10. Footnotes/citations from research-agent findings.

## Todos

- Synthesize findings from all eight delegated research outputs. Done.
- Draft the final comprehensive report in Markdown. Done in `docs\worldcup-design-research-report.md`.
- Create an implementation design system for the site and future pages. Done in `docs\worldcup-design-system.md`.
- Preserve the original session artifact at `C:\Users\eolve\.copilot\session-state\9f738ace-5ace-4ff4-b7d0-8aa216569306\research\look-at-the-best-top-rated-most-modern-award-winni.md`. Done.

## Notes and assumptions

- The site should be Spanish-first and culturally familiar to Hispanic football audiences.
- The recommended system should be practical for the current static-site direction rather than requiring a heavyweight animation framework.
- Thibaut Courtois-style depth should inform pacing and layering, but the quiniela should prioritize match discovery and prediction clarity.
- Official World Cup aesthetics can inspire palette, energy, geometry, and typography choices, but the design must avoid protected FIFA logos, wordmarks, and host-city marks.
