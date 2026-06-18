import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Plugin } from 'vite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mapping_type (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS list_values (
  id INTEGER PRIMARY KEY,
  value TEXT NOT NULL,
  type_id TEXT NOT NULL,
  abbreviation TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(value, type_id),
  UNIQUE(abbreviation, type_id)
);
CREATE TABLE IF NOT EXISTS mapping_instance (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  expansion TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS token_usage (
  id       INTEGER PRIMARY KEY,
  raw_input    TEXT NOT NULL,
  mapping_name TEXT,              -- NULL when no mapping fired
  expansion    TEXT NOT NULL,
  used_at      TEXT NOT NULL      -- ISO 8601
);
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS form_history (
  date      TEXT PRIMARY KEY,
  bathe     TEXT,
  wake      TEXT,
  sleep     TEXT,
  nap       TEXT,
  worked    TEXT,
  stress    TEXT,
  tired     TEXT,
  game      TEXT,
  music     TEXT,
  grateful  TEXT,
  learn     TEXT,
  exercise  TEXT,
  remember  TEXT,
  day_rating TEXT,
  feeling   TEXT,
  why       TEXT,
  phase     TEXT,
  time      TEXT,
  happened  TEXT,
  day_name  TEXT,
  output    TEXT,
  saved_at  TEXT
);
`

const DEFAULT_SETTINGS = `
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('frecency_halflife_days',    '7'),
  ('suggestion_threshold',      '3'),
  ('suggestion_min_length',     '4'),
  ('token_usage_max_rows',      '10000'),
  ('autocomplete_max_results',  '5'),
  ('autocomplete_debounce_ms',  '80');
`

const SUGGESTION_TYPES = `
INSERT OR IGNORE INTO mapping_type (id, name) VALUES
  ('exercise', 'Exercise'),
  ('game', 'Game'),
  ('music', 'Music'),
  ('phase', 'Phase');
`

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => resolve(raw))
  })
}

function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

export function sqlitePlugin(dbPath: string): Plugin {
  let db: import('sql.js').Database | null = null

  async function init() {
    // sql.js CJS module — handle default export interop
    const mod = await import('sql.js')
    const initSqlJs: typeof import('sql.js').default = (mod as any).default ?? mod

    const SQL = await initSqlJs()

    if (existsSync(dbPath)) {
      db = new SQL.Database(readFileSync(dbPath))
    } else {
      db = new SQL.Database()
    }

    db.run(SCHEMA)
    db.run(SUGGESTION_TYPES)
    db.run(DEFAULT_SETTINGS)
    // Add enabled columns to existing DBs that predate the schema change
    try { db.run('ALTER TABLE mapping_instance ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1') } catch {}
    try { db.run('ALTER TABLE list_values ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1') } catch {}
    flush()
    console.log(`[sqlite] using ${dbPath}`)
  }

  function flush() {
    if (!db) return
    writeFileSync(dbPath, Buffer.from(db.export()))
  }

  return {
    name: 'vite-plugin-sqlite',

    async configureServer(server) {
      await init()

      server.middlewares.use('/api/db', async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!db) { json(res, { error: 'DB not ready' }, 503); return }
        if (req.method !== 'POST') { next(); return }

        let body: { sql: string; params?: unknown[] }
        try {
          body = JSON.parse(await readBody(req))
        } catch {
          json(res, { error: 'Invalid JSON' }, 400)
          return
        }

        const route = (req.url ?? '').replace(/\/$/, '')

        try {
          if (route === '/query') {
            json(res, db.exec(body.sql, body.params as any))
          } else if (route === '/exec') {
            db.run(body.sql, body.params as any)
            flush()
            json(res, { ok: true })
          } else {
            next()
          }
        } catch (e: any) {
          json(res, { error: e.message }, 400)
        }
      })
    },
  }
}
