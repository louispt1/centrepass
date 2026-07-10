// IndexedDB persistence, owned entirely by TypeScript (ADR-0002). Each match
// is one document: metadata plus its append-only event log, which is the only
// stored truth — scores and stats are always re-derived by netball-core
// (ADR-0003).
import type { Event } from "./types/Event";

export interface StoredMatch {
  id: string;
  /** Name of team A — the active team, coded in detail. */
  teamAName: string;
  /** Name of team B — the opposition. */
  teamBName: string;
  /** Match date, YYYY-MM-DD. */
  date: string;
  createdAtMs: number;
  events: Event[];
}

const DB_NAME = "centrepass";
const DB_VERSION = 2;
const MATCH_STORE = "matches";

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (upgrade) => {
      if (upgrade.oldVersion < 1) {
        request.result.createObjectStore(MATCH_STORE, { keyPath: "id" });
      }
      if (upgrade.oldVersion === 1) {
        migrateV1Events(request.transaction!.objectStore(MATCH_STORE));
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

// v1 (issue 02) stored an event's action as the bare string "Goal"; the full
// taxonomy made Action a tagged object and added the flagged modifier. Those
// early goals had no coded shooter, so they become TEAM-attributed goals.
function migrateV1Events(store: IDBObjectStore) {
  type V1Event = { team: "A" | "B"; action: unknown; timestampMs: number | null };
  store.openCursor().onsuccess = (found) => {
    const cursor = (found.target as IDBRequest<IDBCursorWithValue | null>).result;
    if (!cursor) return;
    const match = cursor.value as Omit<StoredMatch, "events"> & { events: V1Event[] };
    const events = match.events.map((event) =>
      event.action === "Goal"
        ? {
            team: event.team,
            action: { type: "Goal", position: "TEAM", failed: false },
            flagged: false,
            timestampMs: event.timestampMs,
          }
        : event,
    );
    cursor.update({ ...match, events });
    cursor.continue();
  };
}

function asPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function matchStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(MATCH_STORE, mode).objectStore(MATCH_STORE);
}

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

export async function putMatch(match: StoredMatch): Promise<void> {
  const store = await matchStore("readwrite");
  await asPromise(store.put(match));
}
