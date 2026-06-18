import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import datosCuriosos from './templates/datos-curiosos.js';
import launchAnnouncement from './templates/launch-announcement.js';
import pronosticoDelDia from './templates/pronostico-del-dia.js';
import quinielaChallenge from './templates/quiniela-challenge.js';
import tuEquipoTuData from './templates/tu-equipo-tu-data.js';
import dataCallout from './templates/data-callout.js';
import pronosticoCarousel3up from './templates/pronostico-carousel-3up.js';
import pollQuestionGif from './templates/poll-question-gif.js';
import accountabilityRecap from './templates/accountability-recap.js';
import nextMorningSaveable from './templates/next-morning-saveable.js';
import halftimeDebate from './templates/halftime-debate.js';
import { renderSvgToPng } from './render.js';
import { ensureFlagsForCard } from './flags.js';

// Templates that emit a single SVG per requested size (legacy/default contract).
const templates = {
  'datos-curiosos': datosCuriosos,
  'launch-announcement': launchAnnouncement,
  'pronostico-del-dia': pronosticoDelDia,
  'quiniela-challenge': quinielaChallenge,
  'tu-equipo-tu-data': tuEquipoTuData,
  'data-callout': dataCallout,
  'poll-question-gif': pollQuestionGif,
  'poll-question-video': pollQuestionGif,
  'accountability-recap': accountabilityRecap,
  'next-morning-saveable': nextMorningSaveable,
  'halftime-debate': halftimeDebate,
};

// Templates that emit an array of { slide, key, svg } objects. Each slide is
// exported as its own PNG. Used by Instagram carousels and FB multi-image posts.
const multiSlideTemplates = {
  'pronostico-carousel-3up': { build: pronosticoCarousel3up, size: { width: 1080, height: 1350 } },
};

const TEMPLATE_BY_PILLAR = {
  pronostico_del_dia: 'pronostico-del-dia',
  quiniela_challenge: 'quiniela-challenge',
  datos_curiosos: 'datos-curiosos',
  tu_equipo_tu_data: 'tu-equipo-tu-data',
  launch: 'launch-announcement',
};

const FORMAT_VARIANT_TEMPLATE = {
  static_hero: null, // use default pillar template
  data_callout: 'data-callout',
  carousel_3up: 'pronostico-carousel-3up',
  poll_question_gif: 'poll-question-gif',
  poll_question_mp4: 'poll-question-video',
  accountability_recap: 'accountability-recap',
  saveable_recap_visual: 'next-morning-saveable',
  halftime_debate_visual: 'halftime-debate',
};

const SIZES = [
  { key: '1080x1920', w: 1080, h: 1920 },
  { key: '1080x1350', w: 1080, h: 1350 },
  { key: '1080x1080', w: 1080, h: 1080 },
];

const DATA_CALLOUT_SIZES = [{ key: '1080x1080', w: 1080, h: 1080 }];
const POLL_VIDEO_SIZE = { key: '1080x1080', w: 1080, h: 1080 };
const POLL_VIDEO_FRAMES = 36;
const POLL_VIDEO_FPS = 12;
const AUDIO_SAMPLE_RATE = 44100;

function writeUint16LE(buffer, offset, value) {
  buffer.writeUInt16LE(value, offset);
}

function writeUint32LE(buffer, offset, value) {
  buffer.writeUInt32LE(value, offset);
}

function clamp16(value) {
  return Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
}

function pluckedTone(t, start, freq, duration, gain) {
  const local = t - start;
  if (local < 0 || local > duration) return 0;
  const envelope = Math.exp(-local * 4.2) * Math.min(1, local / 0.018);
  const shimmer = Math.sin(2 * Math.PI * freq * t) +
    0.42 * Math.sin(2 * Math.PI * freq * 2.01 * t) +
    0.18 * Math.sin(2 * Math.PI * freq * 3.02 * t);
  return shimmer * envelope * gain;
}

function percussionTap(t, start, gain) {
  const local = t - start;
  if (local < 0 || local > 0.12) return 0;
  return Math.sin(2 * Math.PI * 118 * t) * Math.exp(-local * 24) * gain;
}

function createSuspenseSportsWav({ durationSeconds }) {
  const samples = Math.ceil(durationSeconds * AUDIO_SAMPLE_RATE);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  writeUint32LE(buffer, 4, 36 + dataSize);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  writeUint32LE(buffer, 16, 16);
  writeUint16LE(buffer, 20, 1);
  writeUint16LE(buffer, 22, 1);
  writeUint32LE(buffer, 24, AUDIO_SAMPLE_RATE);
  writeUint32LE(buffer, 28, AUDIO_SAMPLE_RATE * 2);
  writeUint16LE(buffer, 32, 2);
  writeUint16LE(buffer, 34, 16);
  buffer.write('data', 36);
  writeUint32LE(buffer, 40, dataSize);

  const phrase = [
    [0.00, 220.00, 0.25], [0.38, 261.63, 0.22], [0.76, 329.63, 0.22], [1.14, 392.00, 0.20],
    [1.52, 293.66, 0.23], [1.90, 349.23, 0.22], [2.28, 440.00, 0.22], [2.66, 523.25, 0.18],
  ];
  const taps = [0, 0.75, 1.5, 2.25];
  for (let i = 0; i < samples; i += 1) {
    const t = i / AUDIO_SAMPLE_RATE;
    let sample = 0;
    for (const [start, freq, gain] of phrase) sample += pluckedTone(t, start, freq, 0.95, gain);
    for (const start of taps) sample += percussionTap(t, start, 0.16);
    sample += 0.045 * Math.sin(2 * Math.PI * 110 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.75 * t));
    buffer.writeInt16LE(clamp16(sample * 0.58), 44 + i * 2);
  }
  return buffer;
}

function renderPollQuestionAssets(card, outDir) {
  const { w: width, h: height } = POLL_VIDEO_SIZE;
  const frames = [];
  for (let index = 0; index < POLL_VIDEO_FRAMES; index += 1) {
    const progress = Math.min(1, index / 16);
    const svg = pollQuestionGif(card, { width, height }, { progress });
    frames.push(renderSvgToPng(svg, { width, height }));
  }

  const fallbackPng = frames.at(-1);
  const pngPath = join(outDir, `${POLL_VIDEO_SIZE.key}.png`);
  const mp4Path = join(outDir, 'animated_mp4.mp4');
  const wavPath = join(outDir, 'poll_music.wav');
  const framesDir = join(outDir, '.frames');
  mkdirSync(dirname(pngPath), { recursive: true });
  writeFileSync(pngPath, fallbackPng);
  writeFileSync(wavPath, createSuspenseSportsWav({ durationSeconds: POLL_VIDEO_FRAMES / POLL_VIDEO_FPS }));
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  frames.forEach((frame, index) => {
    writeFileSync(join(framesDir, `frame_${String(index).padStart(3, '0')}.png`), frame);
  });
  execFileSync(ffmpeg.path, [
    '-y',
    '-framerate', String(POLL_VIDEO_FPS),
    '-i', join(framesDir, 'frame_%03d.png'),
    '-i', wavPath,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-shortest',
    '-r', '30',
    mp4Path,
  ], { stdio: 'ignore' });
  rmSync(framesDir, { recursive: true, force: true });
  rmSync(wavPath, { force: true });
  return {
    [POLL_VIDEO_SIZE.key]: pngPath,
    animated_mp4: mp4Path,
  };
}

function resolveTemplateName(card) {
  // Order of precedence:
  //   1. Explicit payload.template (back-compat hint)
  //   2. payload.format_variant maps to a template
  //   3. Pillar-based default
  //   4. Fallback launch-announcement
  const templateHint = card?.payload?.template;
  if (templateHint && (templates[templateHint] || multiSlideTemplates[templateHint])) {
    return templateHint;
  }
  const variant = card?.payload?.format_variant;
  if (variant && FORMAT_VARIANT_TEMPLATE[variant]) {
    return FORMAT_VARIANT_TEMPLATE[variant];
  }
  return TEMPLATE_BY_PILLAR[card?.pillar] || 'launch-announcement';
}

export async function renderCardAssets(card, { outDir } = {}) {
  if (!outDir) throw new Error('renderCardAssets requires an outDir option.');
  const templateName = resolveTemplateName(card);

  // Pre-warm flag cache (templates are synchronous).
  try {
    await ensureFlagsForCard(card);
  } catch (error) {
    console.warn(`[renderCardAssets] flag prefetch failed: ${error.message}`);
  }

  // Multi-slide flow (e.g., carousels). Each slide is a separate PNG.
  if (multiSlideTemplates[templateName]) {
    const { build, size } = multiSlideTemplates[templateName];
    let slides;
    try {
      slides = build(card, size);
    } catch (error) {
      error.message = `[${templateName}] card ${card?.id || '?'}: ${error.message}`;
      throw error;
    }
    if (!Array.isArray(slides) || !slides.length) {
      throw new Error(`[${templateName}] multi-slide template must return a non-empty array.`);
    }
    const results = { slides: [] };
    for (const { slide, key, svg } of slides) {
      const png = renderSvgToPng(svg, { width: size.width, height: size.height });
      const path = join(outDir, `${key}.png`);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, png);
      results[key] = path;
      results.slides.push({ slide, key, path, width: size.width, height: size.height });
    }
    return results;
  }

  if (templateName === 'poll-question-gif' || templateName === 'poll-question-video') {
    return renderPollQuestionAssets(card, outDir);
  }

  // Single-template flow. Pick the size list based on the chosen template.
  const sizesToRender = templateName === 'data-callout' ? DATA_CALLOUT_SIZES : SIZES;
  const template = templates[templateName] || templates['launch-announcement'];
  const results = {};
  for (const { key, w, h } of sizesToRender) {
    let svg;
    try {
      svg = template(card, { width: w, height: h });
    } catch (error) {
      const cardLabel = card?.id ? `card ${card.id}` : 'card';
      error.message = `[${templateName} ${key}] ${cardLabel}: ${error.message}`;
      throw error;
    }
    const png = renderSvgToPng(svg, { width: w, height: h });
    const path = join(outDir, `${key}.png`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, png);
    results[key] = path;
  }
  return results;
}

export { templates, multiSlideTemplates, resolveTemplateName };
