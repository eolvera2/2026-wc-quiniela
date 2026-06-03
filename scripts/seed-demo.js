/**
 * seed-demo.js
 *
 * Generates a local demo `dist/` for previewing the static site without the DB
 * or live APIs. Run with:
 *
 *   node scripts/seed-demo.js
 *
 * After it finishes, open dist/index.html in a browser or serve the folder with:
 *
 *   npx swa start dist
 */

import { buildSite } from '../src/publish/staticSite.js';

// ---------------------------------------------------------------------------
// Hand-crafted demo articles — World Cup 2026, pronostico_momios type
// ---------------------------------------------------------------------------

const articles = [
  {
    fixtureId: 1,
    articleType: 'pronostico_momios',
    homeTeam: 'México',
    awayTeam: 'Alemania',
    contentJson: {
      h1_title: 'Pronóstico México vs Alemania — Mundial 2026',
      meta_description:
        'Análisis táctico y momios para México vs Alemania en el Mundial 2026. Apuesta con información.',
      analisis_tactico_html: `
<h2>Contexto del partido</h2>
<p>México llega a este duelo del Grupo C con la presión de demostrar que puede competir de igual a igual con las potencias europeas. El Tri ha reforzado su mediocampo y apuesta por una presión alta que limite las salidas de balón alemanas.</p>

<h2>Claves tácticas</h2>
<p>Alemania ha recuperado su solidez defensiva y el bloque de cuatro líneas que Nagelsmann ha perfeccionado le permite transitar rápido al ataque. La clave será si México logra cerrar los espacios entre líneas donde Wirtz y Musiala son letales.</p>

<h2>Momios y recomendación</h2>
<p>En Caliente los momios actuales sitúan a Alemania como favorita con cuota de 1.80, mientras México paga 4.20 y el empate 3.50. Dado el historial mundialista de México como local de grupo y la motivación extra de jugar en casa, el valor está en apostar al empate o a una victoria azteca con gol temprano.</p>
`,
    },
  },
  {
    fixtureId: 2,
    articleType: 'pronostico_momios',
    homeTeam: 'Argentina',
    awayTeam: 'Brasil',
    contentJson: {
      h1_title: 'Pronóstico Argentina vs Brasil — Clásico del Mundo 2026',
      meta_description:
        'Momios y análisis táctico del superclásico sudamericano en el Mundial 2026. Todo lo que necesitas saber antes de apostar.',
      analisis_tactico_html: `
<h2>El partido del siglo en fase de grupos</h2>
<p>Cuando el sorteo emparejó a Argentina y Brasil en el mismo grupo, el mundo del fútbol se detuvo. Los actuales campeones del mundo enfrentan a la Verdeamarela en un duelo que podría definir ya el liderato del grupo con dos jornadas de antelación.</p>

<h2>Análisis táctico</h2>
<p>Argentina dispone de Messi —en lo que puede ser su último Mundial— rodeado de una generación brillante. Brasil responde con un bloque compacto y la velocidad de Endrick por las bandas. El duelo en el mediocampo entre De Paul y Casemiro será determinante para quién domine la posesión.</p>

<h2>Dónde apostar y qué cuotas mirar</h2>
<p>Las casas de apuestas como bet365 ofrecen una cuota equilibrada: Argentina 2.10, empate 3.30, Brasil 3.20. El mercado de ambos equipos marcan paga bien a 1.95, dado el perfil ofensivo de ambas selecciones. Apostar al Over 2.5 goles parece valor razonable a cuota 2.05.</p>
`,
    },
  },
  {
    fixtureId: 3,
    articleType: 'pronostico_momios',
    homeTeam: 'Francia',
    awayTeam: 'Inglaterra',
    contentJson: {
      h1_title: 'Pronóstico Francia vs Inglaterra — Duelo Europeo Mundial 2026',
      meta_description:
        'Análisis y momios para Francia vs Inglaterra en la fase de grupos del Mundial 2026. Quiniela y apuestas informadas.',
      analisis_tactico_html: `
<h2>Europa se mide en el verde</h2>
<p>Francia e Inglaterra protagonizan el duelo más atractivo de la fase de grupos europea. Los Bleus, con Mbappé como capitán y figura, llegan como uno de los grandes favoritos al título. Los Tres Leones de Southgate han madurado y vienen de dos finales de Eurocopa consecutivas.</p>

<h2>Claves del encuentro</h2>
<p>Francia optará por un 4-3-3 con Camavinga y Tchouaméni cerrando el centro del campo. Inglaterra responde con un mediocampo físico y la dualidad Bellingham-Saka en ataque. La batalla aérea en las dos áreas será decisiva en un partido que se espera disputado.</p>

<h2>Momios y quiniela</h2>
<p>En Caliente la victoria francesa ronda los 2.00, el empate 3.40 y la victoria inglesa 3.60. Francia tiene más recursos técnicos, pero Inglaterra es difícil de batir en partidos de alto voltaje. Para la quiniela: 1X como opción más segura, con un ligero favor a los galos. Considera también el mercado de primer goleador, donde Mbappé paga 4.50.</p>
`,
    },
  },
];

// ---------------------------------------------------------------------------
// Build the site
// ---------------------------------------------------------------------------

const slugs = buildSite({
  articles,
  siteBaseUrl: 'https://wc26quiniela.example.com',
  outputDir: 'dist',
  affiliateUrls: {
    caliente: 'https://www.caliente.mx/?aff=demo',
    bet365: 'https://www.bet365.mx/?aff=demo',
    skimlinks: '',
  },
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const totalPages = slugs.length + 1; // articles + index
console.log(`\n✓ Demo site built — ${totalPages} pages written to dist/\n`);
console.log('  Pages:');
console.log('    dist/index.html');
for (const { slug } of slugs) {
  console.log(`    dist/${slug}.html`);
}
console.log('    dist/sitemap.xml\n');
console.log('Preview options:');
console.log('  npx swa start dist');
console.log('  open dist/index.html   (macOS)');
console.log('  start dist\\index.html  (Windows)\n');
