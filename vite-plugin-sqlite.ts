import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Plugin } from 'vite'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mapping_type (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS list_value (
  id INTEGER PRIMARY KEY,
  abbreviation TEXT NOT NULL,
  value TEXT NOT NULL,
  type_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mapping_instance (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  expansion TEXT NOT NULL,
  implicit_add_base INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS shortcut_group (
  id INTEGER PRIMARY KEY,
  shortcode TEXT NOT NULL UNIQUE,
  expansion TEXT NOT NULL
);
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
