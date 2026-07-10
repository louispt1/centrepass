// IndexedDB persistence, owned entirely by TypeScript (ADR-0002). Each match
// is one document: metadata plus its append-only log, which is the only
// stored truth — scores, rosters, playing time, and stats are always
// re-derived by netball-core (ADR-0003).
import type { LogEntry } from "./types/LogEntry";

export interface StoredMatch {
  id: string;
  /** Name of team A — the active team, coded in detail. */
  teamAName: string;
  /** Name of team B — the opposition. */
  teamBName: string;
  /** Match date, YYYY-MM-DD. */
  date: string;
  createdAtMs: number;
  /** The append-only log: coded events plus quarter/substitution markers. */
  log: LogEntry[];
}

const DB_NAME = "centrepass";
const DB_VERSION = 3;
const MATCH_STORE = "matches";

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (upgrade) => {
      if (upgrade.oldVersion < 1) {
        request.result.createObjectStore(MATCH_STORE, { keyPath: "id" });
      } else if (upgrade.oldVersion < 3) {
        migrateToV3Log(request.transaction!.objectStore(MATCH_STORE));
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

// v3 renamed `events` to `log` and made each entry a kind-tagged LogEntry so
// quarter breaks and substitutions live in the same log as coded events.
// v1 (issue 02) is also handled here: it stored an event's action as the
// bare string "Goal", with no coded shooter, so those become TEAM-attributed
// goals.
function migrateToV3Log(store: IDBObjectStore) {
  type PreV3Event = {
    team: "A" | "B";
    action: unknown;
    flagged?: boolean;
    timestampMs: number | null;
  };
  store.openCursor().onsuccess = (found) => {
    const cursor = (found.target as IDBRequest<IDBCursorWithValue | null>).result;
    if (!cursor) return;
    const { events, ...match } = cursor.value as Omit<StoredMatch, "log"> & {
      events: PreV3Event[];
    };
    const log = events.map((event) => ({
      kind: "Event",
      team: event.team,
      action:
        event.action === "Goal"
          ? { type: "Goal", position: "TEAM", failed: false }
          : event.action,
      flagged: event.flagged ?? false,
      timestampMs: event.timestampMs,
    }));
    cursor.update({ ...match, log });
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
