import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, runMigrations } from './lib/db.js';
import { authenticatePassphrase, isAuthEnabled, requireBoardAuth, setAuthCookie } from './lib/auth.js';
import { getBoardPayload } from './lib/board.js';
import { isPlatformPaused, normalizePlatform, platformDisplayName } from './lib/socialStrategy.js';
import {
  advanceCard,
  allPlatformsDone,
  getCard,
  getCardFull,
  insertCard,
  recordCardEvent,
  updateCard,
  upsertPost,
} from './lib/cards.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const db = getDb();
const migration = runMigrations(db);
const port = Number(process.env.MARKETING_BOARD_PORT || 5173);

app.use(express.json({ limit: '2mb' }));
app.use('/api', requireBoardAuth);

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

app.post('/api/auth', (req, res) => {
  if (!isAuthEnabled()) return res.json({ ok: true, dev_mode: true });
  if (!authenticatePassphrase(req.body?.passphrase)) return res.status(401).json({ error: 'unauthorized' });
  setAuthCookie(res);
  return res.json({ ok: true });
});

app.get('/api/board', (req, res) => {
  res.json(getBoardPayload(db));
});

app.get(
  '/api/cards/:id',
  asyncRoute(async (req, res) => {
    const card = getCardFull(db, req.params.id);
    if (!card) return res.status(404).json({ error: 'card not found' });
    return res.json(card);
  }),
);

app.post(
  '/api/cards',
  asyncRoute(async (req, res) => {
    const card = await insertCard(db, req.body);
    res.status(201).json(card);
  }),
);

app.patch(
  '/api/cards/:id',
  asyncRoute(async (req, res) => {
    const card = await updateCard(db, req.params.id, req.body);
    res.json(card);
  }),
);

app.post(
  '/api/cards/:id/advance',
  asyncRoute(async (req, res) => {
    const card = await advanceCard(db, req.params.id, req.body);
    res.json(card);
  }),
);

app.post(
  '/api/cards/:id/approve',
  asyncRoute(async (req, res) => {
    const card = getCard(db, req.params.id);
    if (!card) return res.status(404).json({ error: 'card not found' });

    if (card.stage === 'review') {
      const advanced = await advanceCard(db, card.id, {
        to_stage: 'to_be_posted',
        actor: req.body?.actor || 'you',
        note: req.body?.note || 'Approved for publishing',
        type: 'approve',
      });
      return res.json(advanced);
    }

    if (card.stage === 'to_be_posted') {
      // TODO(adapter sub-agent): implement marketing-board/adapters/index.js publishCard(card).
      try {
        const { publishCard } = await import('./adapters/index.js');
        const result = await publishCard(getCardFull(db, card.id));
        return res.json({ status: 'publish_requested', result });
      } catch (error) {
        console.warn(`[board] adapters pending: ${error.message}`);
        return res.json({ status: 'adapters_pending' });
      }
    }

    return res.status(409).json({ error: 'card must be in review or to_be_posted' });
  }),
);

app.post(
  '/api/cards/:id/revise',
  asyncRoute(async (req, res) => {
    const card = await advanceCard(db, req.params.id, {
      to_stage: 'revising',
      actor: req.body?.actor || 'you',
      note: req.body?.note || 'Needs revision',
      owner: 'shuri',
      type: 'revise',
    });
    res.json(card);
  }),
);

app.post(
  '/api/cards/:id/kill',
  asyncRoute(async (req, res) => {
    const card = await advanceCard(db, req.params.id, {
      to_stage: 'killed',
      actor: req.body?.actor || 'you',
      note: req.body?.reason || 'Killed',
      type: 'kill',
    });
    res.json(card);
  }),
);

app.post(
  '/api/cards/bulk-kill-expired',
  asyncRoute(async (req, res) => {
    const board = getBoardPayload(db);
    const expired = (board.columns?.to_be_posted?.cards || []).filter((card) => card.due?.key === 'expired');
    const killed = [];
    for (const card of expired) {
      const result = await advanceCard(db, card.id, {
        to_stage: 'killed',
        actor: req.body?.actor || 'you',
        note: req.body?.reason || 'Bulk killed expired To Be Posted card',
        type: 'kill',
        meta: { bulk: true, due: card.due },
      });
      killed.push(result.id);
    }
    res.json({ killed: killed.length, ids: killed });
  }),
);

app.post(
  '/api/cards/:id/snooze',
  asyncRoute(async (req, res) => {
    const current = getCard(db, req.params.id);
    if (!current) return res.status(404).json({ error: 'card not found' });
    const hours = Math.max(1, Number(req.body?.hours || 1));
    const card = await updateCard(
      db,
      req.params.id,
      {
        priority: current.priority - hours,
        note: `Snoozed for ${hours} hour(s)`,
      },
      req.body?.actor || 'you',
      'snooze',
    );
    res.json(card);
  }),
);

app.post(
  '/api/cards/:id/confirm-posted',
  asyncRoute(async (req, res) => {
    const card = getCardFull(db, req.params.id);
    if (!card) return res.status(404).json({ error: 'card not found' });
    const platform = normalizePlatform(req.body?.platform || 'tiktok');
    if (isPlatformPaused(platform)) {
      return res.status(409).json({ error: `${platformDisplayName(platform)} is paused for account review` });
    }
    await upsertPost(db, card.id, {
      platform,
      status: 'posted_manual',
      permalink: req.body?.permalink || null,
      meta: { actor: req.body?.actor || 'you', manual: true },
    });
    await recordCardEvent(db, card.id, {
      actor: req.body?.actor || 'you',
      type: 'manual_post_confirmed',
      note: `Manual ${platform} post confirmed`,
      meta: { platform, permalink: req.body?.permalink || null },
    });
    const updated = getCardFull(db, card.id);
    if (allPlatformsDone(updated, updated.posts) && updated.stage !== 'posted') {
      const advanced = await advanceCard(db, card.id, {
        to_stage: 'posted',
        actor: req.body?.actor || 'you',
        note: `Manual ${platform} post confirmed`,
        type: 'manual_post_confirmed',
      });
      return res.json(advanced);
    }
    return res.json(updated);
  }),
);

app.use(
  express.static(path.join(__dirname, 'public'), {
    etag: true,
    lastModified: true,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    },
  }),
);
app.use('/PredictaGol_Logo.png', express.static(path.join(__dirname, '..', 'public', 'PredictaGol_Logo.png')));
app.use('/fonts', express.static(path.join(__dirname, '..', 'public', 'fonts')));
app.use('/brand-assets', express.static(path.join(__dirname, '..', 'public')));
app.use(
  '/creative',
  express.static(path.join(__dirname, '..', '.squad', 'agents', 'shuri', 'outputs', 'creative'), {
    etag: true,
    maxAge: '1d',
  }),
);

app.use((error, req, res, _next) => {
  console.error(`[board] ${error.stack || error.message}`);
  res.status(error.status || 500).json({ error: error.message || 'server error' });
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[board] PredictaGol Agent Board listening at http://0.0.0.0:${port}`);
  console.log(`[board] SQLite schema v${migration.schemaVersion}: ${migration.dbPath}`);
  console.log(`[board] ${isAuthEnabled() ? 'AUTH ENABLED' : 'DEV MODE (no auth) - MARKETING_BOARD_PASSPHRASE is unset'}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

export default app;
