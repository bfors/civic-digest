import { Database } from "bun:sqlite";

// civic.db lives at the repo root (two levels up from packages/shared/).
// Override with CIVIC_DB to point at a fixture/throwaway DB (used by tests).
export const DB_PATH =
  process.env.CIVIC_DB ?? new URL("../../civic.db", import.meta.url).pathname;

let _db: Database | undefined;

// Open the shared connection. Read-only by default; the registry-tool sets
// CIVIC_WRITE=1 so only it can mutate the database. Pass `fresh` to bypass the
// singleton (the seed script needs a writable handle to a file it just created).
export function openDb(opts?: { fresh?: boolean; write?: boolean }): Database {
  const write = opts?.write ?? !!process.env.CIVIC_WRITE;
  if (opts?.fresh) {
    return new Database(DB_PATH, { create: write, readonly: !write });
  }
  if (!_db) {
    _db = new Database(DB_PATH, { create: write, readonly: !write });
  }
  return _db;
}

// Reset the cached singleton (tests that swap CIVIC_DB between cases).
export function closeDb(): void {
  _db?.close();
  _db = undefined;
}
