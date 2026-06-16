import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import datosCuriosos from './templates/datos-curiosos.js';
import launchAnnouncement from './templates/launch-announcement.js';
import pronosticoDelDia from './templates/pronostico-del-dia.js';
import quinielaChallenge from './templates/quiniela-challenge.js';
import tuEquipoTuData from './templates/tu-equipo-tu-data.js';
import { SIZES } from './tokens.js';

const templates = {
  'datos-curiosos': datosCuriosos,
  'launch-announcement': launchAnnouncement,
  'pronostico-del-dia': pronosticoDelDia,
  'quiniela-challenge': quinielaChallenge,
  'tu-equipo-tu-data': tuEquipoTuData,
};

const [templateName = 'launch-announcement', sizeKey = '1080x1080'] = process.argv.slice(2);
const size = SIZES[sizeKey];
const template = templates[templateName];

if (!template || !size) {
  console.error(`Uso: node marketing-board/renderers/preview.js <${Object.keys(templates).join('|')}> <${Object.keys(SIZES).join('|')}>`);
  process.exit(1);
}

const sampleCard = {
  id: 'c_preview',
  title: sampleTitle(templateName),
  pillar: templateName.replaceAll('-', '_'),
  payload: {
    homeTeam: 'México',
    awayTeam: 'Polonia',
    kickoff: '2026-06-11T19:00:00Z',
    venue: 'Estadio Azteca',
    statLine: '7 DE LOS ÚLTIMOS 10 partidos en casa terminaron con celebración local.',
    challengeQuestion: '¿Quién gana hoy?',
    flagEmojiHome: '🇲🇽',
    flagEmojiAway: '🇵🇱',
    eyebrow: 'PRONÓSTICO DEL DÍA',
    cta: 'Tu pick en predictagol.com',
  },
};

try {
  const { renderSvgToPng } = await import('./render.js');
  const png = renderSvgToPng(template(sampleCard, size), size);
  const outDir = join('marketing-board', '.assets', 'preview');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${templateName}-${sizeKey}.png`);
  writeFileSync(outPath, png);
  console.log(`Preview escrito: ${outPath} (${png.length} bytes)`);
} catch (error) {
  console.log(`Templates escritos; verificación PNG pendiente: ${error.message}`);
}

function sampleTitle(name) {
  return {
    'datos-curiosos': '7 DE LOS ÚLTIMOS 10 partidos en casa tuvieron gol mexicano.',
    'launch-announcement': 'La quiniela mundialista empieza aquí',
    'pronostico-del-dia': 'México busca imponer ritmo desde el primer tiempo',
    'quiniela-challenge': '¿Quién gana hoy?',
    'tu-equipo-tu-data': 'Tu equipo, tu data',
  }[name];
}
