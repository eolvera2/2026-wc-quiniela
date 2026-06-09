/**
 * Integrate per-group JSON files from .fleet-output/ into
 * src/data/fixtureContent/index.js.
 *
 * Validates schema, scans for forbidden internal phrases, generates
 * Spanish-name aliases, and writes the final data module.
 *
 * Usage: node scripts/integrate-fleet-output.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FLEET_DIR = join(ROOT, '.fleet-output');
const OUTPUT = join(ROOT, 'src', 'data', 'fixtureContent', 'index.js');

// Spanish display names used to generate aliases. Must match worldCupTeams.js.
const SPANISH = {
  MEX: 'México', RSA: 'Sudáfrica', KOR: 'Corea del Sur', CZE: 'Chequia',
  CAN: 'Canadá', BIH: 'Bosnia y Herzegovina', QAT: 'Catar', SUI: 'Suiza',
  BRA: 'Brasil', MAR: 'Marruecos', HAI: 'Haití', SCO: 'Escocia',
  USA: 'Estados Unidos', PAR: 'Paraguay', AUS: 'Australia', TUR: 'Turquía',
  GER: 'Alemania', CUW: 'Curazao', CIV: 'Costa de Marfil', ECU: 'Ecuador',
  NED: 'Países Bajos', JPN: 'Japón', SWE: 'Suecia', TUN: 'Túnez',
  BEL: 'Bélgica', EGY: 'Egipto', IRN: 'Irán', NZL: 'Nueva Zelanda',
  ESP: 'España', CPV: 'Cabo Verde', KSA: 'Arabia Saudita', URU: 'Uruguay',
  FRA: 'Francia', SEN: 'Senegal', IRQ: 'Irak', NOR: 'Noruega',
  ARG: 'Argentina', ALG: 'Argelia', AUT: 'Austria', JOR: 'Jordania',
  POR: 'Portugal', COD: 'RD Congo', UZB: 'Uzbekistán', COL: 'Colombia',
  ENG: 'Inglaterra', CRO: 'Croacia', GHA: 'Ghana', PAN: 'Panamá',
};

const FORBIDDEN = [
  /\bAPI\b/i,
  /llamadas?\s+API/i,
  /datos?\s+API/i,
  /FootballData/i,
  /API-?Sports/i,
  /1[.,]?000\s+llamadas/i,
  /límite\s+mensual/i,
  /T-?72h/i, /T-?48h/i, /T-?24h/i, /T-?3h/i,
  /fuentes\s+públicas/i,
  /agregadores\s+de\s+momios/i,
  /movimiento\s+del\s+1X2/i,
  /apuesta\s+segura/i,
  /\bgarantizad/i,
  /infalible/i,
];

function scanForbidden(text, where) {
  for (const re of FORBIDDEN) {
    if (re.test(text)) {
      throw new Error(`Forbidden phrase ${re} found in ${where}`);
    }
  }
}

function loadGroupFiles() {
  if (!existsSync(FLEET_DIR)) {
    throw new Error(`Fleet output directory not found: ${FLEET_DIR}`);
  }
  const files = readdirSync(FLEET_DIR)
    .filter((f) => /^group-[A-L]\.json$/i.test(f))
    .sort();
  return files.map((f) => ({
    group: f.match(/group-([A-L])/i)[1].toUpperCase(),
    data: JSON.parse(readFileSync(join(FLEET_DIR, f), 'utf-8')),
  }));
}

function validateGroup(group, data) {
  if (!data.teams || typeof data.teams !== 'object') {
    throw new Error(`Group ${group}: missing teams`);
  }
  if (!data.fixtures || typeof data.fixtures !== 'object') {
    throw new Error(`Group ${group}: missing fixtures`);
  }
  for (const [code, html] of Object.entries(data.teams)) {
    if (typeof html !== 'string' || html.length < 50) {
      throw new Error(`Group ${group}: team ${code} summary too short`);
    }
    scanForbidden(html, `Group ${group} team ${code}`);
  }
  const required = ['pronostico_momios', 'quiniela_verdict', 'alineacion_probable', 'analisis_apostar'];
  for (const [key, fx] of Object.entries(data.fixtures)) {
    if (!/^[A-Z]{3}-[A-Z]{3}-\d{4}-\d{2}-\d{2}$/.test(key)) {
      throw new Error(`Group ${group}: invalid fixture key ${key}`);
    }
    if (!fx.pgs || typeof fx.pgs.home !== 'number' || typeof fx.pgs.away !== 'number') {
      throw new Error(`Group ${group}: fixture ${key} missing pgs`);
    }
    if (!fx.sections) {
      throw new Error(`Group ${group}: fixture ${key} missing sections`);
    }
    for (const sec of required) {
      if (typeof fx.sections[sec] !== 'string') {
        throw new Error(`Group ${group}: fixture ${key} missing section ${sec}`);
      }
      scanForbidden(fx.sections[sec], `Group ${group} fixture ${key} section ${sec}`);
    }
  }
}

// MEX-RSA-2026-06-11 is hand-authored and kept verbatim.
const MEX_RSA_LITERAL = `const MEX_RSA = {
  pgs: { home: 2, away: 1 },
  teamSummaries: {
    MEX: \`<p><strong>México</strong> abre el Mundial como anfitrión con impulso, presión y ventaja contextual. El ciclo de Javier Aguirre llega respaldado por Nations League y Gold Cup 2025, con Edson Álvarez, Raúl Jiménez y Johan Vásquez como referencias de equilibrio, experiencia y solidez.</p>
        <p>Este análisis preliminar proviene de múltiples fuentes de análisis deportivo: localía en el Azteca, altura, apoyo masivo y una lectura de mercado que lo perfila favorito de grupo, no candidato fuerte al título. Los datos de momios, forma e incidencias se actualizarán cerca del partido.</p>\`,
    RSA: \`<p><strong>Sudáfrica</strong> regresa al Mundial por primera vez desde 2010 con Hugo Broos al mando y Ronwen Williams como líder. Bafana Bafana clasificó con un 3-0 ante Ruanda y combina orden, transiciones y piezas como Oswin Appollis, Lyle Foster y Teboho Mokoena.</p>
        <p>El reto es enorme: abrir contra el anfitrión en el Azteca. Sus señales recientes son mixtas, con empates ante Nicaragua y Jamaica y dudas de Broos sobre mentalidad y contundencia. El plan inicial lo trata como underdog peligroso si resiste la presión mexicana inicial.</p>\`,
  },
  sections: {
    pronostico_momios: \`<section class="initial-section">
        <h2>Análisis preliminar</h2>
        <p class="freshness-label">Versión inicial. Se actualizará con datos actuales cerca del partido.</p>
        <p>La lectura temprana favorece a México por localía, altura, contexto de anfitrión y ventaja de grupo de acuerdo a diversas fuentes de análisis deportivo. A nivel torneo, México sigue siendo un longshot para ganar el Mundial, pero el mercado lo perfila como favorito ligero para navegar el Grupo A.</p>
        <p>Sudáfrica llega como underdog amplio: tiene estructura y velocidad en transición, pero enfrenta el partido inaugural en un entorno de máxima presión. Los datos definitivos serán actualizados más adelante conforme nueva información pública esté disponible y el encuentro se encuentre más próximo.</p>
      </section>\`,
    quiniela_verdict: \`<section class="initial-section">
        <h2>México con ventaja inicial</h2>
        <p class="freshness-label">Veredicto preliminar. Se actualizará con datos actuales cerca del partido.</p>
        <p><strong>Pick inicial para quiniela: México gana.</strong> La localía en el Azteca, el impulso reciente en CONCACAF y la presión ambiental inclinan la balanza hacia el anfitrión.</p>
        <p>El empate no se descarta si Sudáfrica sostiene el 0-0 durante el primer tramo y logra correr con Appollis o Foster en campo abierto. Para una quiniela conservadora, México es la selección lógica; para una quiniela de riesgo, el empate gana valor si las alineaciones o momios finales muestran rotaciones mexicanas.</p>
      </section>\`,
    alineacion_probable: \`<section class="initial-section">
        <h2>Lectura preliminar</h2>
        <p class="freshness-label">Alineaciones no confirmadas. Esta sección se actualizará con datos actuales cerca del partido.</p>
        <p><strong>México:</strong> la expectativa pública apunta a una estructura flexible de Aguirre, con Edson Álvarez como pieza de equilibrio, Johan Vásquez en la zaga y Raúl Jiménez como referencia ofensiva principal. Guillermo Martínez y otros atacantes aparecen como alternativas, pero no como titulares confirmados. La portería debe vigilarse por el debate mediático entre experiencia y forma reciente.</p>
        <p><strong>Sudáfrica:</strong> Broos suele priorizar orden, salida rápida y disciplina colectiva. Ronwen Williams parte como referencia en portería; Mokoena debe marcar el ritmo en medio campo, mientras Appollis y Foster son los focos de peligro en transición y pelota parada.</p>
      </section>\`,
    analisis_apostar: \`<section class="initial-section">
        <h2>Ángulos educativos iniciales</h2>
        <p class="freshness-label">Contenido informativo y de entretenimiento. No es recomendación financiera; se actualizará con datos actuales cerca del partido.</p>
        <p>Los ángulos tempranos giran alrededor de tres factores: presión inicial de México, resistencia sudafricana en los primeros 30 minutos y posible valor de mercados conservadores si la línea favorece demasiado al anfitrión. Sin cuotas frescas, conviene evitar conclusiones rígidas.</p>
        <p>Qué revisar cerca del partido: cambios en los momios para triunfo de México, empate o triunfo de Sudáfrica, total de goles, noticias de Edson Álvarez y los delanteros mexicanos, estado físico de Sudáfrica tras su campamento en Pachuca y si Broos ajusta para protegerse de la presión alta mexicana. Los datos definitivos serán actualizados más adelante conforme nueva información pública esté disponible y el encuentro se encuentre más próximo.</p>
      </section>\`,
  },
};`;

function tsLit(html) {
  // Escape backticks and ${ in the HTML string to safely use as a template literal.
  return '`' + html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
}

function emitFixture(varName, fx, homeCode, awayCode, teamSummaries) {
  return `const ${varName} = {
  pgs: { home: ${fx.pgs.home}, away: ${fx.pgs.away} },
  teamSummaries: {
    ${homeCode}: ${tsLit(teamSummaries[homeCode])},
    ${awayCode}: ${tsLit(teamSummaries[awayCode])},
  },
  sections: {
    pronostico_momios: ${tsLit(fx.sections.pronostico_momios)},
    quiniela_verdict: ${tsLit(fx.sections.quiniela_verdict)},
    alineacion_probable: ${tsLit(fx.sections.alineacion_probable)},
    analisis_apostar: ${tsLit(fx.sections.analisis_apostar)},
  },
};`;
}

function build() {
  const groups = loadGroupFiles();
  console.log(`Loaded ${groups.length} group files: ${groups.map((g) => g.group).join(', ')}`);

  const teamSummaries = {};
  const fixturesIn = {};
  for (const { group, data } of groups) {
    validateGroup(group, data);
    Object.assign(teamSummaries, data.teams);
    Object.assign(fixturesIn, data.fixtures);
  }
  console.log(`Teams: ${Object.keys(teamSummaries).length}, fixtures: ${Object.keys(fixturesIn).length}`);

  const varDecls = [MEX_RSA_LITERAL];
  const mainEntries = [`  'MEX-RSA-2026-06-11': MEX_RSA,`];
  const aliasEntries = [
    `  'MEX-SUDÁFRICA-2026-06-11': MEX_RSA,`,
    `  'MÉXICO-RSA-2026-06-11': MEX_RSA,`,
    `  'MÉXICO-SUDÁFRICA-2026-06-11': MEX_RSA,`,
  ];

  const keys = Object.keys(fixturesIn).sort();
  for (const key of keys) {
    const [home, away, y, m, d] = key.split('-');
    const date = `${y}-${m}-${d}`;
    const fx = fixturesIn[key];
    const varName = `FX_${home}_${away}_${y}${m}${d}`;
    varDecls.push(emitFixture(varName, fx, home, away, teamSummaries));
    mainEntries.push(`  '${key}': ${varName},`);
    const homeEs = (SPANISH[home] || home).toUpperCase();
    const awayEs = (SPANISH[away] || away).toUpperCase();
    aliasEntries.push(`  '${homeEs}-${awayEs}-${date}': ${varName},`);
    aliasEntries.push(`  '${home}-${awayEs}-${date}': ${varName},`);
    aliasEntries.push(`  '${homeEs}-${away}-${date}': ${varName},`);
  }

  const body = `/**
 * Initial editorial content for World Cup 2026 fixture pages.
 *
 * Each entry is keyed by \`<HOMECODE>-<AWAYCODE>-<YYYY-MM-DD>\` (FIFA codes).
 * Spanish-name aliases live in INITIAL_FIXTURE_CONTENT_ALIASES.
 *
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Re-generate with: node scripts/integrate-fleet-output.mjs
 *
 * Content rules: see plan in session state plan.md.
 */

${varDecls.join('\n\n')}

export const INITIAL_FIXTURE_CONTENT = {
${mainEntries.join('\n')}
};

export const INITIAL_FIXTURE_CONTENT_ALIASES = {
${aliasEntries.join('\n')}
};
`;

  writeFileSync(OUTPUT, body, 'utf-8');
  console.log(`Wrote ${OUTPUT} (${body.length} bytes)`);
}

build();
