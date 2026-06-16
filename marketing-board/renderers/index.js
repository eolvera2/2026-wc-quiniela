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
};

const SIZES = [
  { key: '1080x1920', w: 1080, h: 1920 },
  { key: '1080x1350', w: 1080, h: 1350 },
  { key: '1080x1080', w: 1080, h: 1080 },
];

const DATA_CALLOUT_SIZES = [{ key: '1080x1080', w: 1080, h: 1080 }];
const POLL_VIDEO_SIZE = { key: '1080x1080', w: 1080, h: 1080 };
const POLL_VIDEO_FRAMES = 36;

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
  const framesDir = join(outDir, '.frames');
  mkdirSync(dirname(pngPath), { recursive: true });
  writeFileSync(pngPath, fallbackPng);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  frames.forEach((frame, index) => {
    writeFileSync(join(framesDir, `frame_${String(index).padStart(3, '0')}.png`), frame);
  });
  execFileSync(ffmpeg.path, [
    '-y',
    '-framerate', '12',
    '-i', join(framesDir, 'frame_%03d.png'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-r', '30',
    mp4Path,
  ], { stdio: 'ignore' });
  rmSync(framesDir, { recursive: true, force: true });
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
