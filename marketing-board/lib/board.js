import { listCards, STAGES } from './cards.js';
import { POST_WINDOWS, dueStatus } from './socialStrategy.js';

const HOUR = 60 * 60 * 1000;
const AGENT_OWNERS = new Set(['widow', 'strange', 'shuri', 'cap', 'stark']);

function withStalled(card, now = new Date()) {
  const updatedAt = new Date(card.updated_at);
  const age = now - updatedAt;
  const stalled =
    (card.stage === 'to_be_posted' && age > HOUR) ||
    (AGENT_OWNERS.has(card.owner) && !['to_be_posted', 'posted', 'killed'].includes(card.stage) && age > 24 * HOUR);

  return {
    ...card,
    stalled_at: card.stalled_at || (stalled ? card.updated_at : null),
  };
}

function withDueStatus(card, now = new Date()) {
  const scheduledFor = card.payload?.scheduled_for || null;
  const windowKey = card.payload?.window_key || null;
  const window = POST_WINDOWS[windowKey] || null;
  return {
    ...card,
    due: dueStatus(scheduledFor, {
      expiresAt: card.expires_at || card.payload?.expires_at || null,
      now,
      urgencyMinutes: window?.urgencyMinutes ?? 20,
    }),
    window_label: card.payload?.window_label || window?.label || null,
  };
}

function sortColumnCards(cards) {
  return cards.sort((a, b) => {
    if (a.stage === 'to_be_posted' && b.stage === 'to_be_posted') {
      const aDue = a.payload?.scheduled_for ? new Date(a.payload.scheduled_for).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.payload?.scheduled_for ? new Date(b.payload.scheduled_for).getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
    }
    return Number(b.priority || 0) - Number(a.priority || 0) || String(b.updated_at).localeCompare(String(a.updated_at));
  });
}

export function getBoardPayload(db) {
  const now = new Date();
  const columns = Object.fromEntries(STAGES.map((stage) => [stage, { count: 0, cards: [] }]));

  for (const card of listCards(db).map((item) => withDueStatus(withStalled(item, now), now))) {
    if (!columns[card.stage]) columns[card.stage] = { count: 0, cards: [] };
    columns[card.stage].cards.push(card);
    columns[card.stage].count += 1;
  }

  for (const column of Object.values(columns)) {
    sortColumnCards(column.cards);
  }

  return {
    columns,
    generated_at: now.toISOString(),
    active_platforms: ['instagram', 'x', 'threads'],
  };
}
