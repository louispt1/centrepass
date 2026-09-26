// IndexedDB persistence, owned entirely by TypeScript (ADR-0002). Each match
// is one document: metadata plus its append-only log, which is the only
// stored truth - scores, rosters, playing time, and stats are always
// re-derived by netball-core (ADR-0003).
import type { LogEntry } from "./types/LogEntry";

export interface StoredMatch {
  id: string;
  teamAName: string;
  teamBName: string;
  /** Match date, YYYY-MM-DD. */
  date: string;
  createdAtMs: number;
  /** The append-only log: coded events plus quarter/substitution markers. */
  log: LogEntry[];
  /** Local only, never in the Match File: when this copy last changed and was
   * last sent (exported or shared). Absent on matches from before tracking. */
  changedAtMs?: number;
  sentAtMs?: number;
}

/** Changed since it was last sent to the club, or never sent at all. */
export function notSent(match: StoredMatch): boolean {
  return match.sentAtMs === undefined || (match.changedAtMs ?? 0) > match.sentAtMs;
}

/** A named, local-only grouping of matches for cross-match stats. A match
 * deleted since is simply skipped wherever its id is read. */
export interface StoredCollection {
  id: string;
  name: string;
  matchIds: string[];
  /** "Ali" -> "Alice"; resolved transitively (merging A->B then B->C moves A's stats to C). */
  playerAliases: Record<string, string>;
  createdAtMs: number;
}

const DB_NAME = "centrepass";
const DB_VERSION = 5;
const MATCH_STORE = "matches";
const COLLECTION_STORE = "collections";

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (upgrade) => {
      if (upgrade.oldVersion < 1) {
        request.result.createObjectStore(MATCH_STORE, { keyPath: "id" });
      } else if (upgrade.oldVersion < 4) {
        migrateMatches(request.transaction!.objectStore(MATCH_STORE), upgrade.oldVersion);
      }
      if (upgrade.oldVersion < 5) {
        request.result.createObjectStore(COLLECTION_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

// One cursor pass applying every migration step newer than the stored
// version, in order (separate cursors over the same store would interleave).
function migrateMatches(store: IDBObjectStore, oldVersion: number) {
  store.openCursor().onsuccess = (found) => {
    const cursor = (found.target as IDBRequest<IDBCursorWithValue | null>).result;
    if (!cursor) return;
    let match = cursor.value;
    if (oldVersion < 3) match = migrateToV3Log(match);
    if (oldVersion < 4) match = migrateToV4Log(match);
    cursor.update(match);
    cursor.continue();
  };
}

// v4 (Match File v2, ADR-0004): a Centre Pass Receive can no longer fail. A
// failed one becomes the Unforced Turnover it is now coded as, same position
// and team; a successful one just drops the flag. Mirrors the core's Match
// File migration.
function migrateToV4Log(match: StoredMatch): StoredMatch {
  const log = match.log.map((entry) => {
    if (entry.kind !== "Event" || entry.action.type !== "CentrePassReceive") return entry;
    const { failed, ...action } = entry.action as typeof entry.action & { failed?: boolean };
    return {
      ...entry,
      action: failed ? { type: "UnforcedTurnover" as const, position: action.position } : action,
    };
  });
  return { ...match, log };
}

// v3 renamed `events` to `log` and made each entry a kind-tagged LogEntry so
// quarter breaks and substitutions live in the same log as coded events.
// v1 (issue 02) is also handled here: it stored an event's action as the
// bare string "Goal", with no coded shooter, so those become TEAM-attributed
// goals.
function migrateToV3Log(stored: unknown): StoredMatch {
  type PreV3Event = {
    team: "A" | "B";
    action: unknown;
    flagged?: boolean;
    timestampMs: number | null;
  };
  const { events, ...match } = stored as Omit<StoredMatch, "log"> & {
    events: PreV3Event[];
  };
  const log = events.map((event) => ({
    kind: "Event",
    team: event.team,
    action:
      event.action === "Goal" ? { type: "Goal", position: "TEAM", failed: false } : event.action,
    flagged: event.flagged ?? false,
    timestampMs: event.timestampMs,
  }));
  return { ...match, log } as StoredMatch;
}

function asPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function objectStore(name: string, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

const matchStore = (mode: IDBTransactionMode) => objectStore(MATCH_STORE, mode);
const collectionStore = (mode: IDBTransactionMode) => objectStore(COLLECTION_STORE, mode);

/** All matches, most recently created first. */
export async function listMatches(): Promise<StoredMatch[]> {
  const store = await matchStore("readonly");
  const matches = await asPromise(store.getAll() as IDBRequest<StoredMatch[]>);
  return matches.sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function getMatch(id: string): Promise<StoredMatch | undefined> {
  const store = await matchStore("readonly");
  return asPromise(store.get(id) as IDBRequest<StoredMatch | undefined>);
}

/** Save a match; every save counts as a change for the "not sent" marker. */
export async function putMatch(match: StoredMatch): Promise<void> {
  const store = await matchStore("readwrite");
  await asPromise(store.put({ ...match, changedAtMs: Date.now() }));
}

/** Record that the match, as currently stored, has been sent. */
export async function markSent(id: string): Promise<void> {
  const match = await getMatch(id);
  if (!match) return;
  const store = await matchStore("readwrite");
  await asPromise(store.put({ ...match, sentAtMs: Date.now() }));
}

export async function deleteMatch(id: string): Promise<void> {
  const store = await matchStore("readwrite");
  await asPromise(store.delete(id));
}

/** All collections, oldest first. */
export async function listCollections(): Promise<StoredCollection[]> {
  const store = await collectionStore("readonly");
  const collections = await asPromise(store.getAll() as IDBRequest<StoredCollection[]>);
  return collections.sort((a, b) => a.createdAtMs - b.createdAtMs);
}

export async function getCollection(id: string): Promise<StoredCollection | undefined> {
  const store = await collectionStore("readonly");
  return asPromise(store.get(id) as IDBRequest<StoredCollection | undefined>);
}

/** Create, rename, or change a collection's matches or aliases. */
export async function putCollection(collection: StoredCollection): Promise<void> {
  const store = await collectionStore("readwrite");
  await asPromise(store.put(collection));
}

export async function deleteCollection(id: string): Promise<void> {
  const store = await collectionStore("readwrite");
  await asPromise(store.delete(id));
}

/** A new, empty collection, saved. */
export async function createCollection(name: string): Promise<StoredCollection> {
  const collection: StoredCollection = {
    id: crypto.randomUUID(),
    name: name.trim(),
    matchIds: [],
    playerAliases: {},
    createdAtMs: Date.now(),
  };
  await putCollection(collection);
  return collection;
}
