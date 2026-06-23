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
  enabled INTEGER NOT NULL DEFAULT 1,
  grp TEXT NOT NULL DEFAULT 'main'
);
CREATE TABLE IF NOT EXISTS token_usage (
  id       INTEGER PRIMARY KEY,
  raw_input    TEXT NOT NULL,
  mapping_name TEXT,
  expansion    TEXT NOT NULL,
  used_at      TEXT NOT NULL
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
  saved_at  TEXT,
  responses TEXT,
  schema_version_id INTEGER
);
CREATE TABLE IF NOT EXISTS form_schema_version (
  id             INTEGER PRIMARY KEY,
  effective_from TEXT NOT NULL UNIQUE,
  note           TEXT
);
CREATE TABLE IF NOT EXISTS form_schema_field (
  id         INTEGER PRIMARY KEY,
  version_id INTEGER NOT NULL REFERENCES form_schema_version(id),
  field_key  TEXT NOT NULL,
  label      TEXT NOT NULL,
  field_type TEXT NOT NULL,
  config     TEXT,
  row_group  INTEGER,
  sort_order INTEGER NOT NULL
);
`

const DEFAULT_SETTINGS = `
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('frecency_halflife_days',    '7'),
  ('suggestion_threshold',      '3'),
  ('suggestion_min_length',     '4'),
  ('token_usage_max_rows',      '10000'),
  ('autocomplete_max_results',  '5');
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
  let flushTimer: ReturnType<typeof setTimeout> | null = null

  function writeDb() {
    if (!db) return
    writeFileSync(dbPath, Buffer.from(db.export()))
  }

  // Batches rapid writes into a single disk write after a short idle period.
  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(() => { flushTimer = null; writeDb() }, 500)
  }

  function flushImmediate() {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null }
    writeDb()
  }

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
    // Migrations for existing DBs
    try { db.run('ALTER TABLE mapping_instance ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1') } catch {}
    try { db.run('ALTER TABLE list_values ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1') } catch {}
    try { db.run("ALTER TABLE mapping_instance ADD COLUMN grp TEXT NOT NULL DEFAULT 'main'") } catch {}
    try { db.run('ALTER TABLE form_history ADD COLUMN responses TEXT') } catch {}
    try { db.run('ALTER TABLE form_history ADD COLUMN schema_version_id INTEGER') } catch {}
    // Seed 2025 schema if no schema versions exist
    const existing = db.exec('SELECT COUNT(*) as n FROM form_schema_version')
    if ((existing[0]?.values[0]?.[0] as number) === 0) {
      db.run(`INSERT INTO form_schema_version (effective_from, note) VALUES ('2025-01-01', '2025 reflection')`)
      const vid = (db.exec('SELECT last_insert_rowid()')[0].values[0][0]) as number
      const fields: [string, string, string, string | null, number | null, number][] = [
        ['date',      'Date',           'date',             null,                                          null, 10],
        ['bathe',     'Bathe',          'yes_no',           null,                                          1,    20],
        ['wake',      'Wake',           'time',             null,                                          1,    30],
        ['sleep',     'Sleep',          'time',             '{"defaultToFuture":true,"futureMinutes":25}', 1,    40],
        ['nap',       'Nap',            'float',            '{"max":10}',                                  2,    50],
        ['worked',    'Worked',         'float',            '{"max":24}',                                  2,    60],
        ['stress',    'Stress',         'float',            '{"max":10,"required":true}',                  3,    70],
        ['tired',     'Tired',          'float',            '{"max":10,"required":true}',                  3,    80],
        ['game',      'Game',           'autocomplete_list','{"listTypeId":"game","defaultN":true}',       null, 90],
        ['music',     'Music',          'autocomplete_list','{"listTypeId":"music","defaultN":true,"required":true}', null, 100],
        ['grateful',  'Grateful',       'list',             '{"required":true}',                           null, 110],
        ['learn',     'Learn (Ctrl+Y)', 'list',             '{"required":true}',                           null, 120],
        ['exercise',  'Exercise',       'autocomplete_list','{"listTypeId":"exercise","defaultN":true,"required":true}', null, 130],
        ['remember',  'Remember',       'float',            '{"max":10,"required":true}',                  null, 140],
        ['dayRating', 'Day rating',     'float',            '{"max":10,"required":true}',                  null, 150],
        ['feeling',   'Feeling',        'int',              '{"max":100,"required":true}',                 null, 160],
        ['why',       'Why',            'string',           '{"required":true}',                           null, 170],
        ['phase',     'Phase',          'autocomplete_list','{"listTypeId":"phase","required":true,"autoSelect":false}', null, 180],
        ['happened',  'Happened',       'shortcode_text',   '{"group":"main","required":true}',            null, 190],
        ['time',      'Time',           'time_display',     null,                                          null, 200],
        ['dayName',   'Day name',       'string',           null,                                          null, 210],
      ]
      for (const [key, label, type, config, rowGroup, sortOrder] of fields) {
        db.run(
          'INSERT INTO form_schema_field (version_id, field_key, label, field_type, config, row_group, sort_order) VALUES (?,?,?,?,?,?,?)',
          [vid, key, label, type, config, rowGroup, sortOrder]
        )
      }
    }
    writeDb()
    console.log(`[sqlite] using ${dbPath}`)
  }

  // Ensure in-flight debounced writes land before the process exits
  process.on('exit', flushImmediate)
  process.on('SIGINT', () => { flushImmediate(); process.exit(0) })
  process.on('SIGTERM', () => { flushImmediate(); process.exit(0) })

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
            // Return immediately; flush to disk after a short debounce.
            // Rapid writes (e.g. token_usage inserts) share one disk write.
            scheduleFlush()
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
