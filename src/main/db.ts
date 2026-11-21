import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

let db: SqlJsDatabase | null = null
let dbPath = ''
let initPromise: Promise<SqlJsDatabase> | null = null

async function createDb(): Promise<SqlJsDatabase> {
  const require = createRequire(import.meta.url)
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath, useOldExtensionFunctions: true } as any)
  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  dbPath = path.join(dir, 'sudosmart.db')
  db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database()
  db.run(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ha_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      url TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    INSERT OR IGNORE INTO ha_config (id, url, updated_at) VALUES (1, '', datetime('now'));
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_device_id TEXT NOT NULL,
      name TEXT NOT NULL,
      manufacturer TEXT,
      model TEXT,
      category TEXT NOT NULL DEFAULT 'other',
      room_id TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      capabilities TEXT NOT NULL DEFAULT '[]',
      config TEXT NOT NULL DEFAULT '{}',
      address TEXT,
      last_seen TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(provider, provider_device_id)
    );
    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      actions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
  `)
  persist()
  return db
}

export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db
  if (!initPromise) initPromise = createDb()
  return initPromise
}

export async function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const d = await getDb()
  const stmt = d.prepare(sql)
  stmt.bind(params as any)
  let row: T | undefined
  if (stmt.step()) row = stmt.getAsObject() as T
  stmt.free()
  return row
}

export async function queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d = await getDb()
  const stmt = d.prepare(sql)
  stmt.bind(params as any)
  const rows: T[] = []
  while (stmt.step()) rows.push(stmt.getAsObject() as T)
  stmt.free()
  return rows
}

export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  const d = await getDb()
  d.run(sql, params as any)
  persist()
}

export function persist(): void {
  if (!db || !dbPath) return
  fs.writeFileSync(dbPath, Buffer.from(db.export()))
}

export function closeDb(): void {
  if (db) {
    persist()
    db.close()
    db = null
    initPromise = null
  }
}
