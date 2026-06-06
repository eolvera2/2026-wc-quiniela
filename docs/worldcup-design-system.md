# 2026 World Cup Quiniela Design System

## Purpose

This document is the implementation design system for the 2026 World Cup Quiniela site. Apply it to the homepage, match pages, teams pages, calendar pages, and any future social quiniela features.

The system should produce a site that feels:

- Premium and modern like award-winning sports microsites.
- Familiar to Hispanic/LatAm football audiences.
- Calendar-first and easy to scan.
- Spanish-first.
- Static-site friendly.
- Inspired by 2026 World Cup energy without copying protected FIFA assets.

## Product Design Principles

1. **Calendar clarity first**: Users should always know who plays, when, where, and what page/action is next.
2. **Minimal navigation**: Keep primary navigation to `Inicio`, `Partidos`, and `Equipos`. Add `Mexico` or `Pronosticos Mexico` when audience focus justifies it.
3. **Tournament depth**: The homepage scroll should move forward through the tournament timeline, from next match to final.
4. **Spanish-first content**: Navigation, dates, CTAs, states, and trust text should be in Spanish.
5. **Social game, not sportsbook**: Avoid casino/betting metaphors. Use `puntos`, `aciertos`, `pronosticos`, and `grupo`.
6. **Progressive enhancement**: HTML and CSS must work without JavaScript; motion and scroll effects enhance but never block content.
7. **Brand-safe inspiration**: Use generic football geometry, dark navy, gold, flags, stadium light motifs, and open fonts. Do not use official FIFA logos, emblems, host-city marks, mascots, or campaign lockups.

## Token Architecture

Use three levels of tokens:

| Token layer | Purpose | Example |
|---|---|---|
| Primitive | Raw values that do not imply usage | `--color-navy-950` |
| Semantic | Purpose-based tokens consumed by layout/components | `--surface-base` |
| Component | Component-local overrides | `--match-card-bg` |

Components should consume semantic or component tokens. Do not hardcode primitive color values inside components unless defining the token system itself.

## Primitive Tokens

```css
:root {
  /* Brand-adjacent palette */
  --color-navy-950: #020f2a;
  --color-navy-900: #071733;
  --color-navy-800: #10234a;
  --color-blue-600: #326295;
  --color-blue-500: #0b52e5;

  /* Accents */
  --color-gold-400: #f5a623;
  --color-gold-300: #ffd166;
  --color-green-500: #16a34a;
  --color-green-700: #006847;
  --color-red-600: #c8102e;
  --color-red-700: #9f1239;

  /* Neutrals */
  --color-white: #ffffff;
  --color-off-white: #f0f4ff;
  --color-neutral-100: #e6edf7;
  --color-neutral-300: #b7c3d7;
  --color-neutral-500: #8899bb;
  --color-neutral-800: #25324d;
  --color-black: #000000;

  /* Result states */
  --color-win: #16a34a;
  --color-draw: #f5a623;
  --color-loss: #c8102e;
  --color-live: #e6001e;

  /* Zayu-inspired, brand-safe tournament accents */
  --color-jungle-950: #002018;
  --color-jungle-900: #003020;
  --color-jungle-800: #004030;
  --color-jungle-700: #005040;
  --color-jungle-600: #007050;
  --color-turquoise-400: #00c6a3;
  --color-jaguar-500: #d9942d;
  --color-jaguar-300: #f4bd4f;
  --color-lime-400: #d7ea1f;
}
```

## Semantic Tokens

```css
:root {
  color-scheme: dark light;

  /* Surfaces */
  --surface-base: var(--color-navy-950);
  --surface-raised: var(--color-navy-900);
  --surface-card: rgba(255, 255, 255, 0.08);
  --surface-card-strong: rgba(255, 255, 255, 0.14);
  --surface-jungle: var(--color-jungle-950);
  --surface-festival: linear-gradient(135deg, var(--color-jungle-900), var(--color-navy-900));
  --surface-light: var(--color-off-white);
  --surface-inverse: var(--color-white);

  /* Text */
  --text-primary: var(--color-white);
  --text-secondary: var(--color-neutral-300);
  --text-muted: var(--color-neutral-500);
  --text-inverse: var(--color-navy-950);
  --text-link: var(--color-gold-400);

  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.14);
  --border-strong: rgba(255, 255, 255, 0.28);
  --border-focus: var(--color-gold-400);

  /* Actions */
  --action-primary-bg: var(--color-gold-400);
  --action-primary-text: var(--color-navy-950);
  --accent-primary: var(--color-jaguar-300);
  --accent-secondary: var(--color-turquoise-400);
  --accent-electric: var(--color-lime-400);
  --action-secondary-bg: transparent;
  --action-secondary-text: var(--color-white);
  --action-secondary-border: rgba(255, 255, 255, 0.35);

  /* Match states */
  --state-upcoming: var(--color-blue-600);
  --state-live: var(--color-live);
  --state-locked: var(--color-neutral-500);
  --state-win: var(--color-win);
  --state-draw: var(--color-draw);
  --state-loss: var(--color-loss);
}
```

## Typography

Use open, web-safe fonts with Spanish support.

```css
:root {
  --font-display: "Poppins", "Barlow Condensed", system-ui, sans-serif;
  --font-body: "Noto Sans", "Inter", "Segoe UI", system-ui, sans-serif;
  --font-mono: "Roboto Mono", ui-monospace, monospace;

  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  --font-black: 900;

  --leading-tight: 1.05;
  --leading-snug: 1.2;
  --leading-normal: 1.5;
  --leading-prose: 1.7;

  --tracking-tight: -0.03em;
  --tracking-normal: 0;
  --tracking-wide: 0.06em;
  --tracking-widest: 0.12em;
}
```

### Type scale

```css
:root {
  --step--2: clamp(0.75rem, 0.72rem + 0.12vw, 0.82rem);
  --step--1: clamp(0.88rem, 0.84rem + 0.18vw, 1rem);
  --step-0: clamp(1rem, 0.95rem + 0.24vw, 1.125rem);
  --step-1: clamp(1.25rem, 1.16rem + 0.42vw, 1.5rem);
  --step-2: clamp(1.56rem, 1.42rem + 0.7vw, 2rem);
  --step-3: clamp(1.95rem, 1.72rem + 1.14vw, 2.75rem);
  --step-4: clamp(2.44rem, 2.05rem + 1.9vw, 4rem);
  --step-5: clamp(3.05rem, 2.35rem + 3.4vw, 6rem);
}
```

### Typography usage

| Role | Token | Treatment |
|---|---|---|
| Hero title | `--step-5` | Display font, 800/900, uppercase, tight |
| Page title | `--step-4` | Display font, 700/800 |
| Section title | `--step-2` or `--step-3` | Display font, 700 |
| Match team names | `--step-1` or `--step-2` | Display font, 700 |
| Body text | `--step-0` | Body font, normal, prose leading |
| Metadata | `--step--1` | Body font, 600, muted |
| Labels/badges | `--step--2` | Uppercase, wide tracking |
| Scores/odds/numbers | `--step-1` | Tabular numbers |

Always use:

```css
.numeric {
  font-variant-numeric: tabular-nums;
}
```

## Spacing

```css
:root {
  --space-3xs: clamp(0.25rem, 0.23rem + 0.1vw, 0.31rem);
  --space-2xs: clamp(0.5rem, 0.46rem + 0.18vw, 0.63rem);
  --space-xs: clamp(0.75rem, 0.68rem + 0.32vw, 0.94rem);
  --space-s: clamp(1rem, 0.91rem + 0.45vw, 1.25rem);
  --space-m: clamp(1.5rem, 1.36rem + 0.68vw, 1.88rem);
  --space-l: clamp(2rem, 1.82rem + 0.91vw, 2.5rem);
  --space-xl: clamp(3rem, 2.73rem + 1.36vw, 3.75rem);
  --space-2xl: clamp(4rem, 3.64rem + 1.82vw, 5rem);
  --space-3xl: clamp(6rem, 5.45rem + 2.73vw, 7.5rem);
}
```

## Radius, Borders, and Shadows

```css
:root {
  --radius-xs: 0.25rem;
  --radius-s: 0.5rem;
  --radius-m: 0.875rem;
  --radius-l: 1.25rem;
  --radius-xl: 2rem;
  --radius-pill: 999px;

  --shadow-card: 0 18px 60px rgba(0, 0, 0, 0.28);
  --shadow-card-hover: 0 28px 90px rgba(0, 0, 0, 0.4);
  --shadow-header: 0 10px 40px rgba(0, 0, 0, 0.32);
}
```

Use clipped-corner or badge-like shapes sparingly for section labels:

```css
.badge-cut {
  border-radius: var(--radius-pill);
  clip-path: polygon(0.5rem 0, 100% 0, calc(100% - 0.5rem) 100%, 0 100%);
}
```

## Motion Tokens

```css
:root {
  --ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --duration-fast: 160ms;
  --duration-med: 420ms;
  --duration-slow: 900ms;
}
```

Allowed motion:

- Card fade/translate on entry.
- Header blur/shrink after scroll.
- Subtle accent sweep on hover.
- Countdown digit transitions.
- Optional cross-document View Transitions as progressive enhancement.
- Section header reveal using CSS transforms and `IntersectionObserver`.
- Decorative digital-ball accents that move in from the sides.
- Section-level color theme transitions driven by visible sections.

Avoid:

- Scrolljacking.
- Forced horizontal scroll storytelling.
- Multi-layer parallax with mismatched speeds.
- Continuous animation lasting more than 5 seconds without user control.
- Essential content hidden until animation completes.
- Heavy motion dependencies such as GSAP, ScrollMagic, Lenis, or Three.js unless a later pass proves native CSS/JavaScript is insufficient.

Reduced motion baseline:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}
```

Reveal effects must be progressive enhancements. Content is visible by default. Only `html.js` may apply pre-reveal transforms, so pages remain readable when JavaScript is unavailable.

## Layout System

### Containers

```css
:root {
  --container-narrow: 42rem;
  --container-content: 68rem;
  --container-wide: 118rem;
  --gutter: clamp(1rem, 4vw, 4rem);
}

.container {
  width: min(100% - (var(--gutter) * 2), var(--container-content));
  margin-inline: auto;
}

.container-wide {
  width: min(100% - (var(--gutter) * 2), var(--container-wide));
  margin-inline: auto;
}
```

### Responsive grid

```css
.match-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-m);
}

@media (min-width: 768px) {
  .match-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 992px) {
  .match-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
```

## Global Page Chrome

### Site header

Use on every page.

Required behavior:

- Fixed or sticky.
- Transparent over the homepage hero.
- Dark blurred background after scroll or on non-home pages.
- Logo left.
- Primary nav right.
- Focus-visible outlines.
- Brand-safe custom `Quiniela 2026` mark; do not use official FIFA/WC26 logos or mascot images unless licensing is explicitly documented.

Recommended nav:

```text
Inicio | Partidos | Equipos | Mexico
```

If social features are added:

```text
Inicio | Partidos | Equipos | Mi Quiniela
```

### Footer

Footer must include:

- Site name.
- Links to main sections.
- Non-affiliation statement: `Este sitio no esta afiliado con FIFA.`
- Non-gambling/social-game statement where relevant.
- Affiliate disclaimer where relevant.

## Components

### Brand mark

Use a local, custom SVG mark that combines:

- A simple football circle.
- Abstract bracket/quiniela geometry.
- Jungle/jaguar accent colors.
- The text lockup `Quiniela 2026` next to the mark.

Do not copy or embed the FIFA World Cup 26 logo, host-city marks, trophy emblem, mascot images, or official campaign lockups. If an official asset is ever approved, document the license/permission before changing this rule.

### ScrollReveal and SectionTheme

Use on high-level page sections, not on every tiny component.

Markup model:

```html
<section class="reveal theme-section" data-theme="jungle">
  <span class="digital-ball digital-ball--left" aria-hidden="true"></span>
  <div class="section-heading">
    <p class="eyebrow">Partidos</p>
    <h2>Calendario de partidos</h2>
  </div>
</section>
```

Behavior:

- A small shared script adds `html.js`.
- `IntersectionObserver` toggles `is-visible` on `.reveal`.
- The most visible `[data-theme]` section updates `body[data-active-theme]`.
- Reduced-motion users get the final visible state without animated movement.
- Decorative balls are `aria-hidden` and `pointer-events: none`.

### HeroMatch

Use on homepage and important match pages.

Content:

- Eyebrow: `Proximo partido`
- H1: site or match title.
- Team pairing.
- Kickoff date/time.
- Venue.
- Primary CTA.
- Secondary CTA.

States:

- Upcoming.
- Live.
- Final.
- TBD teams.

### DateTabs

Use for calendars and match lists.

Requirements:

- Horizontal scroll on mobile.
- Snap behavior.
- Buttons or links with accessible labels.
- Spanish abbreviated day above bold date.
- Active state visible by color and shape, not color alone.

Markup model:

```html
<nav class="date-tabs" aria-label="Calendario por fecha">
  <a class="date-tab is-active" href="#fecha-2026-06-11" aria-current="date">
    <span class="date-tab__day">jue</span>
    <span class="date-tab__date">jun 11</span>
  </a>
</nav>
```

### MatchCard

Use on homepage, partidos page, team pages, and related-match rails.

Content order:

1. Status pill.
2. Stage label.
3. Date/time.
4. Teams and flags/crests.
5. Venue.
6. CTA.

State classes:

```text
match-card--upcoming
match-card--live
match-card--locked
match-card--final
match-card--featured
```

Recommended copy:

- `Ver pronostico`
- `Hacer quiniela`
- `Ver previa`
- `Partido cerrado`
- `Resultado final`

### PredictionPanel

Use when social quiniela entry exists.

Pattern:

```text
[1 Local] [X Empate] [2 Visitante]
```

Rules:

- Use real buttons or radios.
- Auto-save on selection.
- Show `Guardado` feedback.
- Lock per match at kickoff.
- Never use chip, wallet, or casino metaphors.

### MatchArticle

Use for generated match preview pages.

Order:

1. `MatchHero`
2. `PuntosClave`
3. `PronosticoMomios`
4. `QuinielaVerdict`
5. `AlineacionProbable`
6. `AnalisisApostar`
7. Related matches
8. Disclaimer

### SpotlightCard

Use every few match cards to avoid a repetitive calendar.

Types:

- `Mexico juega hoy`
- `Partido destacado`
- `Cierra pronto`
- `Pronostico de la jornada`
- `Grupo caliente`

### TeamChip

Use in match cards, team pages, group tables, and filters.

Content:

- Flag/crest.
- Team name.
- Optional group label.

### RoundDivider

Use between tournament phases:

- `Fase de grupos`
- `Octavos de final`
- `Cuartos de final`
- `Semifinales`
- `Final`

## Page Templates

### Homepage

```text
SiteHeader
HeroMatch / tournament hero
DateTabs
Calendar sections
  RoundDivider
  Date heading
  MatchGrid
  SpotlightCard
Teams shortcut
Footer
```

### Partidos page

```text
SiteHeader
PageHero: Calendario de partidos
DateTabs
Round/group filters
MatchGrid grouped by date
Footer
```

### Equipos page

```text
SiteHeader
PageHero: Equipos del Mundial 2026
Group filter rail
Team grid
Footer
```

### Match detail page

```text
SiteHeader
MatchHero
PuntosClave
Article sections
PredictionPanel or CTA
Related matches
Footer
```

### Team detail page

```text
SiteHeader
TeamHero
Group context
Upcoming matches
Team profile / analysis
Related match previews
Footer
```

## Content and Voice Guidelines

Use:

- `Pronostica los partidos del Mundial con tus amigos.`
- `Sin apuestas, solo diversion.`
- `Hoy juega Mexico.`
- `Claves para tu quiniela.`
- `Cierra antes del kickoff.`
- `Ver pronostico.`

Avoid:

- `Gana dinero`.
- `Apuesta ahora`.
- `Odds boost`.
- `Cash out`.
- `Deposita`.
- Casino or wallet language.

## Accessibility Requirements

- Minimum body text: 16px.
- Touch targets: 44px preferred.
- Focus outlines: visible on all interactive elements.
- Color contrast: WCAG AA minimum.
- State communication: icon/text plus color.
- Date tabs and filters: keyboard reachable.
- Prediction controls: semantic button/radio group.
- Motion: opt out with `prefers-reduced-motion`.
- Images: useful alt text for team flags/crests; decorative geometry should be `aria-hidden`.

Focus style:

```css
:focus-visible {
  outline: 3px solid var(--border-focus);
  outline-offset: 3px;
}
```

## Structured Data

Add `SportsEvent` JSON-LD to each match page when data is available:

```json
{
  "@context": "https://schema.org",
  "@type": "SportsEvent",
  "name": "Mexico vs Sudafrica",
  "startDate": "2026-06-11T19:00:00.000Z",
  "eventStatus": "https://schema.org/EventScheduled",
  "sport": "Football",
  "homeTeam": {
    "@type": "SportsTeam",
    "name": "Mexico"
  },
  "awayTeam": {
    "@type": "SportsTeam",
    "name": "Sudafrica"
  }
}
```

Also add `BreadcrumbList` to match and team pages.

## Brand Safety

Do not use:

- FIFA logo, trophy emblem, or World Cup 26 lockup.
- Host-city official logos.
- Official mascot.
- Mascot photos or mascot-like illustrations that copy Maple, Zayu, or Clutch.
- Official campaign hashtags as primary branding.
- FIFA/TUDN/Courtois component copies.

Allowed:

- Generic football shapes.
- Stadium light motifs.
- Radial geometry.
- Dark navy/gold sports palette.
- Zayu-inspired jungle greens, jaguar golds, spot patterns, and leaf-like curves when used as original abstract decoration.
- Open-source fonts.
- National flags where licensed or standard emoji.
- Editorial references to the 2026 World Cup in text.

## Implementation Checklist

Before shipping a new page:

1. Uses shared header and footer.
2. Uses semantic tokens, not hardcoded colors.
3. Uses Spanish page title and navigation copy.
4. Has a clear primary action.
5. Has responsive layout at mobile, tablet, and desktop widths.
6. Has visible focus states.
7. Respects reduced motion.
8. Avoids protected FIFA assets.
9. Uses match/team components when relevant.
10. Includes structured data when it is a match or team page.

## Initial Build Priority

1. Add global CSS tokens and typography.
2. Style the existing index page as a calendar-first match-card list.
3. Add `SiteHeader` and `Footer`.
4. Add match-page hero and article section styling.
5. Add date grouping and `DateTabs`.
6. Add next-match homepage hero.
7. Add progressive scroll reveal only after the static layout works.
