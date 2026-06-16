import 'dotenv/config';
import { getDb, runMigrations } from '../lib/db.js';
import { insertCard } from '../lib/cards.js';

const db = getDb();
runMigrations(db);

const pulseSeeds = Array.from({ length: 100 }, (_, index) => ({
  id: `c_${(0x2000 + index).toString(16)}`,
  title:
    index === 0
      ? 'Pulso masivo: 99+ señales de México rumbo al sorteo'
      : `Pulso demo ${String(index + 1).padStart(3, '0')}: señal social rumbo al Mundial`,
  stage: 'pulse_signals',
  owner: 'widow',
  pillar: 'pulse',
  platforms: ['x', 'threads'],
  priority: 99 - Math.min(index, 98),
  payload: {
    demo_count_label: '99+',
    hook: 'La conversación ya empezó antes del silbatazo.',
    source: 'wave-1-demo',
    signal_rank: index + 1,
  },
}));

const seeds = [
  ...pulseSeeds,
  {
    id: 'c_1001',
    title: 'Pulso curado: tendencia principal para briefing creativo',
    stage: 'pulse_signals',
    owner: 'widow',
    pillar: 'pulse',
    platforms: ['x', 'threads'],
    priority: 99,
    payload: { demo_count_label: '99+', hook: 'La conversación ya empezó antes del silbatazo.' },
  },
  {
    id: 'c_1002',
    title: 'Idea: ¿Quién será el caballo negro del Mundial 2026?',
    stage: 'ideas',
    owner: 'strange',
    pillar: 'quiniela_challenge',
    platforms: ['x', 'instagram', 'threads'],
    priority: 20,
    payload: { caption: 'Pregunta rápida para activar comentarios y quinielas.' },
  },
  {
    id: 'c_1003',
    title: 'Idea: tres datos que cambian tu pronóstico del partido inaugural',
    stage: 'ideas',
    owner: 'strange',
    pillar: 'datos_curiosos',
    platforms: ['youtube', 'tiktok'],
    priority: 18,
    payload: { beats: ['dato histórico', 'forma reciente', 'factor localía'] },
  },
  {
    id: 'c_1004',
    title: 'Listo para publicar: México vs rival del día — pick con confianza',
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'pronostico_del_dia',
    platforms: ['x', 'instagram', 'threads', 'tiktok'],
    priority: 50,
    payload: { caption: 'Pronóstico del día con CTA a PredictaGol.', hashtags: ['#Mundial2026', '#PredictaGol'] },
  },
  {
    id: 'c_1005',
    title: 'Listo para publicar: el XI de datos para tu quiniela',
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'tu_equipo_tu_data',
    platforms: ['instagram', 'threads'],
    priority: 48,
    payload: { asset: 'carousel-demo', alt: 'Carrusel con 11 datos clave para quiniela.' },
  },
  {
    id: 'c_1006',
    title: 'Listo para publicar: momento del partido que nadie está mirando',
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'momento_del_partido',
    platforms: ['x', 'youtube', 'tiktok'],
    priority: 46,
    payload: { script: 'Abrimos con tensión, cerramos con pregunta para comentarios.' },
  },
  {
    id: 'c_1007',
    title: 'Listo para publicar: encuesta express de favoritos Concacaf',
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'quiniela_challenge',
    platforms: ['x', 'threads'],
    priority: 44,
    payload: { poll: ['México', 'Estados Unidos', 'Canadá', 'Sorpresa'] },
  },
  {
    id: 'c_1008',
    title: 'Listo para publicar: dato curioso para abrir debate',
    stage: 'to_be_posted',
    owner: 'stark',
    pillar: 'datos_curiosos',
    platforms: ['instagram', 'tiktok'],
    priority: 42,
    payload: { hook: 'Este dato cambia cómo ves el grupo.' },
  },
  {
    id: 'c_1009',
    title: 'Publicado: calendario emocional de la semana mundialista',
    stage: 'posted',
    owner: 'stark',
    pillar: 'pulse',
    platforms: ['instagram'],
    priority: 10,
    payload: { permalink: 'demo://instagram/calendario-emocional' },
  },
  {
    id: 'c_1010',
    title: 'Publicado: quiniela relámpago con marcador exacto',
    stage: 'posted',
    owner: 'stark',
    pillar: 'quiniela_challenge',
    platforms: ['x'],
    priority: 9,
    payload: { permalink: 'demo://x/quiniela-relampago' },
  },
  {
    id: 'c_1011',
    title: 'Publicado: mapa de conversación de la afición mexicana',
    stage: 'posted',
    owner: 'stark',
    pillar: 'pulse',
    platforms: ['threads'],
    priority: 8,
    payload: { permalink: 'demo://threads/mapa-aficion' },
  },
  {
    id: 'c_1012',
    title: 'Publicado: video corto con tres claves del grupo',
    stage: 'posted',
    owner: 'stark',
    pillar: 'datos_curiosos',
    platforms: ['tiktok'],
    priority: 7,
    payload: { permalink: 'demo://tiktok/tres-claves' },
  },
  {
    id: 'c_1013',
    title: 'Publicado: carrusel “tu equipo, tu data”',
    stage: 'posted',
    owner: 'stark',
    pillar: 'tu_equipo_tu_data',
    platforms: ['instagram'],
    priority: 6,
    payload: { permalink: 'demo://instagram/tu-equipo-tu-data' },
  },
  {
    id: 'c_1014',
    title: 'Publicado: thread de momentos que cambiaron quinielas',
    stage: 'posted',
    owner: 'stark',
    pillar: 'momento_del_partido',
    platforms: ['threads'],
    priority: 5,
    payload: { permalink: 'demo://threads/momentos-quiniela' },
  },
  {
    id: 'c_1015',
    title: 'Publicado: pick conservador vs pick valiente',
    stage: 'posted',
    owner: 'stark',
    pillar: 'pronostico_del_dia',
    platforms: ['x'],
    priority: 4,
    payload: { permalink: 'demo://x/pick-conservador-valiente' },
  },
  {
    id: 'c_1016',
    title: 'Publicado: pregunta de sobremesa para la quiniela familiar',
    stage: 'posted',
    owner: 'stark',
    pillar: 'quiniela_challenge',
    platforms: ['instagram', 'threads'],
    priority: 3,
    payload: { permalink: 'demo://instagram/quiniela-familiar' },
  },
];

let inserted = 0;
let skipped = 0;

for (const seed of seeds) {
  try {
    await insertCard(db, { ...seed, actor: 'seed-wave1', note: 'Wave-1 demo seed' });
    inserted += 1;
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) {
      skipped += 1;
    } else {
      throw error;
    }
  }
}

console.log(`[board:seed] inserted=${inserted} skipped=${skipped} schema=v1`);
