import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ownerTargets = {
  widow: (date, id) => ['.squad', 'agents', 'widow', 'outputs', 'pulse', date, `${id}.json`],
  strange: (date, id) => ['.squad', 'agents', 'strange', 'outputs', 'briefs', date, `${id}.json`],
  shuri: (date, id) => ['.squad', 'agents', 'shuri', 'outputs', 'creative', date, id, 'card.json'],
  cap: (date, id) => ['.squad', 'agents', 'cap', 'outputs', 'reviews', date, `${id}.json`],
  stark: (date, id) => ['.squad', 'agents', 'stark', 'outputs', 'posts', date, `${id}.json`],
  you: (date, id) => ['.squad', 'agents', 'stark', 'outputs', 'posts', date, `${id}.json`],
};

function dayStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function snapshotPathFor(card, date = new Date()) {
  const owner = ownerTargets[card.owner] ? card.owner : 'stark';
  return path.resolve(process.cwd(), ...ownerTargets[owner](dayStamp(date), card.id));
}

export async function writeCardSnapshot(card, event = {}) {
  const filePath = snapshotPathFor(card);
  await mkdir(path.dirname(filePath), { recursive: true });
  const snapshot = {
    schema_version: 1,
    snapshot_at: new Date().toISOString(),
    event,
    card,
  };
  await writeFile(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return filePath;
}
