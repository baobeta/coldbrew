import { LeveldbPersistence } from 'y-leveldb';
import * as Y from 'yjs';

const DB_PATH = process.env.LEVELDB_PATH || './.writeboard-db';

let ldb = null;
function getLdb() {
  if (!ldb) ldb = new LeveldbPersistence(DB_PATH);
  return ldb;
}

// Per-room store counters for periodic compaction.
const storeCounts = new Map();
const COMPACT_EVERY = 100;

/**
 * Load persisted state for `roomName` into `doc`.
 * getYDoc returns a full Y.Doc; we encode its state as an update and apply it.
 * Safe to call on a fresh doc; no-op if nothing is stored.
 *
 * @param {string} roomName
 * @param {Y.Doc} doc
 */
export async function loadRoom(roomName, doc) {
  const persisted = await getLdb().getYDoc(roomName);
  const update = Y.encodeStateAsUpdate(persisted);
  Y.applyUpdate(doc, update);
}

/**
 * Persist the current state of `doc` under `roomName`.
 * Every COMPACT_EVERY stores, calls flushDocument to compact accumulated updates
 * into a single snapshot, preventing unbounded LevelDB growth.
 *
 * @param {string} roomName
 * @param {Y.Doc} doc
 */
export async function storeRoom(roomName, doc) {
  const db = getLdb();
  await db.storeUpdate(roomName, Y.encodeStateAsUpdate(doc));
  const n = (storeCounts.get(roomName) || 0) + 1;
  if (n >= COMPACT_EVERY) {
    storeCounts.set(roomName, 0);
    await db.flushDocument(roomName);
  } else {
    storeCounts.set(roomName, n);
  }
}

/**
 * Force-flush a room to LevelDB and verify by reading it back into a fresh doc.
 * Returns the freshly-loaded Y.Doc so callers can compare content.
 *
 * @param {string} roomName
 * @param {Y.Doc} doc
 * @returns {Promise<Y.Doc>}
 */
export async function flushAndReload(roomName, doc) {
  const db = getLdb();
  await db.storeUpdate(roomName, Y.encodeStateAsUpdate(doc));
  await db.flushDocument(roomName); // force compaction/durability
  const check = new Y.Doc();
  const persisted = await db.getYDoc(roomName);
  Y.applyUpdate(check, Y.encodeStateAsUpdate(persisted));
  return check;
}

/**
 * Flush and close the DB. Best-effort; called on graceful shutdown.
 */
export async function closePersistence() {
  if (ldb) {
    await ldb.destroy?.();
    ldb = null;
  }
}
