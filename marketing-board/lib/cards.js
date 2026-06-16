import crypto from 'node:crypto';
import { parseJson } from './db.js';
import { writeCardSnapshot } from './snapshot.js';
import { notifyToBePosted } from './notify.js';
import { ACTIVE_SOCIAL_PLATFORMS, OPTIONAL_SOCIAL_PLATFORMS, normalizePlatform } from './socialStrategy.js';

export const STAGES = [
  'pulse_signals',
  'ideas',
  'copywritten',
  'review',
  'revising',
  'to_be_posted',
  'posted',
  'killed',
];

const OWNERS = ['widow', 'strange', 'shuri', 'cap', 'stark', 'you'];
const PLATFORMS = [...ACTIVE_SOCIAL_PLATFORMS, ...OPTIONAL_SOCIAL_PLATFORMS];
const PILLARS = [
  'pronostico_del_dia',
  'quiniela_challenge',
  'datos_curiosos',
  'tu_equipo_tu_data',
  'momento_del_partido',
  'pulse',
];

export function rowToCard(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    stage: row.stage,
    owner: row.owner,
    pillar: row.pillar,
    platforms: parseJson(row.platforms_json, []),
    payload: parseJson(row.payload_json, {}),
    priority: row.priority,
    stalled_at: row.stalled_at,
    expires_at: row.expires_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizePlatforms(value = []) {
  if (!Array.isArray(value)) throw Object.assign(new Error('platforms must be an array'), { status: 400 });
  const normalized = value.map(normalizePlatform);
  return normalized.filter((platform, index) => PLATFORMS.includes(platform) && normalized.indexOf(platform) === index);
}

function assertEnum(value, values, field) {
  if (!values.includes(value)) {
    throw Object.assign(new Error(`${field} must be one of: ${values.join(', ')}`), { status: 400 });
  }
}

function cardId() {
  return `c_${crypto.randomInt(0, 0x10000).toString(16).padStart(4, '0')}`;
}

function ensureCardId(inputId) {
  if (!inputId) return cardId();
  if (!/^c_[0-9a-f]{4}$/.test(inputId)) {
    throw Object.assign(new Error('id must match c_ plus 4 lowercase hex chars'), { status: 400 });
  }
  return inputId;
}

export function getCard(db, id) {
  return rowToCard(db.prepare('SELECT * FROM cards WHERE id = ?').get(id));
}

export function getCardFull(db, id) {
  const card = getCard(db, id);
  if (!card) return null;
  const posts = db
    .prepare('SELECT * FROM posts WHERE card_id = ? ORDER BY created_at DESC, id DESC')
    .all(id)
    .map((post) => ({ ...post, meta: parseJson(post.meta_json, {}) }));
  const events = db
    .prepare('SELECT * FROM card_events WHERE card_id = ? ORDER BY created_at DESC, id DESC LIMIT 10')
    .all(id)
    .map((event) => ({ ...event, meta: parseJson(event.meta_json, {}) }));
  return { ...card, posts, events };
}

export function listCards(db) {
  const cards = db
    .prepare('SELECT * FROM cards ORDER BY priority DESC, updated_at DESC')
    .all()
    .map(rowToCard);
  if (!cards.length) return cards;
  const postsByCard = new Map();
  const postRows = db
    .prepare('SELECT card_id, platform, status, permalink FROM posts WHERE card_id IN ('
      + cards.map(() => '?').join(',')
      + ')')
    .all(...cards.map((c) => c.id));
  for (const row of postRows) {
    if (!postsByCard.has(row.card_id)) postsByCard.set(row.card_id, []);
    postsByCard.get(row.card_id).push({ platform: row.platform, status: row.status, permalink: row.permalink });
  }
  for (const card of cards) {
    card.posts = postsByCard.get(card.id) || [];
  }
  return cards;
}

export async function insertCard(db, input) {
  if (!input?.title || typeof input.title !== 'string') {
    throw Object.assign(new Error('title is required'), { status: 400 });
  }

  const stage = input.stage || 'ideas';
  const owner = input.owner || 'you';
  assertEnum(stage, STAGES, 'stage');
  assertEnum(owner, OWNERS, 'owner');
  if (input.pillar != null) assertEnum(input.pillar, PILLARS, 'pillar');

  const platforms = normalizePlatforms(input.platforms ?? input.platforms_json ?? []);
  const payload = input.payload ?? input.payload_json ?? {};
  const actor = input.actor || owner;

  let createdId;
  const create = db.transaction(() => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = ensureCardId(input.id);
      try {
        db.prepare(
          `INSERT INTO cards (id, title, stage, owner, pillar, platforms_json, payload_json, priority, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          input.title.trim(),
          stage,
          owner,
          input.pillar ?? null,
          JSON.stringify(platforms),
          JSON.stringify(payload),
          Number(input.priority || 0),
          input.expires_at ?? null,
        );
        createdId = id;
        break;
      } catch (error) {
        if (!String(error.message).includes('UNIQUE') || input.id || attempt === 4) throw error;
      }
    }
    db.prepare(
      `INSERT INTO card_events (card_id, actor, type, to_stage, note, meta_json)
       VALUES (?, ?, 'create', ?, ?, ?)`,
    ).run(createdId, actor, stage, input.note ?? null, JSON.stringify({ owner, pillar: input.pillar ?? null, expires_at: input.expires_at ?? null }));
  });

  create();
  const card = getCardFull(db, createdId);
  await writeCardSnapshot(card, { type: 'create', actor, to_stage: stage });
  return card;
}

export async function updateCard(db, id, input = {}, actor = input?.actor || 'you', type = 'edit') {
  const current = getCard(db, id);
  if (!current) throw Object.assign(new Error('card not found'), { status: 404 });

  const fields = [];
  const values = [];
  const meta = {};

  for (const field of ['title', 'stage', 'owner', 'pillar', 'priority', 'stalled_at', 'expires_at']) {
    if (Object.hasOwn(input, field)) {
      if (field === 'stage') assertEnum(input[field], STAGES, 'stage');
      if (field === 'owner') assertEnum(input[field], OWNERS, 'owner');
      if (field === 'pillar' && input[field] != null) assertEnum(input[field], PILLARS, 'pillar');
      fields.push(`${field} = ?`);
      values.push(input[field]);
      meta[field] = input[field];
    }
  }

  if (Object.hasOwn(input, 'platforms')) {
    fields.push('platforms_json = ?');
    const platforms = normalizePlatforms(input.platforms);
    values.push(JSON.stringify(platforms));
    meta.platforms = platforms;
  }

  if (Object.hasOwn(input, 'payload')) {
    fields.push('payload_json = ?');
    values.push(JSON.stringify(input.payload ?? {}));
    meta.payload = input.payload ?? {};
  }

  if (!fields.length) return getCardFull(db, id);

  const edit = db.transaction(() => {
    db.prepare(`UPDATE cards SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, id);
    db.prepare(
      `INSERT INTO card_events (card_id, actor, type, from_stage, to_stage, note, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, actor, type, current.stage, input.stage ?? current.stage, input.note ?? null, JSON.stringify(meta));
  });

  edit();
  const card = getCardFull(db, id);
  await writeCardSnapshot(card, { type, actor, meta });
  return card;
}

export async function recordCardEvent(
  db,
  id,
  { actor = 'you', type = 'edit', note = null, from_stage = null, to_stage = null, meta = {} },
) {
  const card = getCard(db, id);
  if (!card) throw Object.assign(new Error('card not found'), { status: 404 });
  db.prepare(
    `INSERT INTO card_events (card_id, actor, type, from_stage, to_stage, note, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, actor, type, from_stage ?? card.stage, to_stage ?? card.stage, note, JSON.stringify(meta));
  const fullCard = getCardFull(db, id);
  await writeCardSnapshot(fullCard, { type, actor, note, meta });
  return fullCard;
}

export async function advanceCard(
  db,
  id,
  { to_stage, actor = 'you', note = null, owner = null, type = 'advance', meta = {} } = {},
) {
  assertEnum(to_stage, STAGES, 'to_stage');
  if (owner != null) assertEnum(owner, OWNERS, 'owner');
  const current = getCard(db, id);
  if (!current) throw Object.assign(new Error('card not found'), { status: 404 });

  const move = db.transaction(() => {
    const ownerSql = owner ? ', owner = ?' : '';
    const params = owner ? [to_stage, owner, id] : [to_stage, id];
    db.prepare(`UPDATE cards SET stage = ?, stalled_at = NULL, updated_at = CURRENT_TIMESTAMP${ownerSql} WHERE id = ?`).run(
      ...params,
    );
    db.prepare(
      `INSERT INTO card_events (card_id, actor, type, from_stage, to_stage, note, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, actor, type, current.stage, to_stage, note, JSON.stringify(meta));
  });

  move();
  const card = getCardFull(db, id);
  await writeCardSnapshot(card, { type, actor, from_stage: current.stage, to_stage, note, meta });
  if (to_stage === 'to_be_posted') await notifyToBePosted(card);
  return card;
}

export async function upsertPost(db, cardId, { platform, status, permalink = null, error = null, meta = {} }) {
  if (!PLATFORMS.includes(platform)) throw Object.assign(new Error('invalid platform'), { status: 400 });
  const postedAt = status === 'posted' || status === 'posted_manual' ? new Date().toISOString() : null;
  db.prepare(
    `INSERT INTO posts (card_id, platform, status, permalink, error, posted_at, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(card_id, platform) DO UPDATE SET
       status = excluded.status,
       permalink = excluded.permalink,
       error = excluded.error,
       posted_at = excluded.posted_at,
       meta_json = excluded.meta_json`,
  ).run(cardId, platform, status, permalink, error, postedAt, JSON.stringify(meta));
}

export function allPlatformsDone(card, posts) {
  const required = card.platforms.length ? card.platforms : ['tiktok'];
  const done = new Set(posts.filter((post) => ['posted', 'posted_manual', 'skipped'].includes(post.status)).map((post) => post.platform));
  return required.every((platform) => done.has(platform));
}
