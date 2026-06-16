import SqlJsModule, { type Database } from 'sql.js'
// sql.js ships CJS; after Vite pre-bundling, the factory may land on .default or the module itself
const initSqlJs: typeof SqlJsModule = (SqlJsModule as any).default ?? SqlJsModule

export interface MappingInstance {
  id: number
  name: string
  expansion: string
  implicit_add_base: boolean
}

export interface ListValue {
  id: number
  abbreviation: string
  value: string
  type_id: string
}

export interface MappingType {
  id: string
  name: string
}

export interface ShortcutGroup {
  id: number
  shortcode: string
  expansion: string
}

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

const LS_KEY = 'mappings_db_v1'

let _db: Database | null = null

function persist(db: Database): void {
  try {
    const data = db.export()
    // Store as comma-separated numbers — avoids btoa surrogate issues with raw binary
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(data)))
  } catch {
    // localStorage full — silently ignore; data is still in memory
  }
}

export async function getDb(): Promise<Database> {
  if (_db) return _db

  const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' })

  const saved = localStorage.getItem(LS_KEY)
  if (saved) {
    try {
      const bytes = new Uint8Array(JSON.parse(saved))
      _db = new SQL.Database(bytes)
      _db.run(SCHEMA) // idempotent — adds any new tables if schema evolved
    } catch {
      _db = new SQL.Database()
      _db.run(SCHEMA)
    }
  } else {
    _db = new SQL.Database()
    _db.run(SCHEMA)
  }

  return _db
}

/** Export the current DB as a downloadable .db file (for backup / cross-device sync). */
export function saveDb(db: Database): void {
  const data = db.export()
  const blob = new Blob([data], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'mappings.db'
  a.click()
  URL.revokeObjectURL(url)
}

/** Replace the in-memory DB with one loaded from a .db file and persist it. */
export async function loadDbFromFile(file: File): Promise<void> {
  const SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' })
  const buf = await file.arrayBuffer()
  _db = new SQL.Database(new Uint8Array(buf))
  _db.run(SCHEMA)
  persist(_db)
}

// ── Mapping instances ───────────────────────────────────────────────────────

export function getMappingInstances(db: Database): MappingInstance[] {
  const result = db.exec('SELECT id, name, expansion, implicit_add_base FROM mapping_instance ORDER BY name')
  if (!result.length) return []
  return result[0].values.map(([id, name, expansion, implicit_add_base]) => ({
    id: id as number,
    name: name as string,
    expansion: expansion as string,
    implicit_add_base: (implicit_add_base as number) === 1,
  }))
}

export function insertMappingInstance(db: Database, name: string, expansion: string, implicitAddBase = false): void {
  db.run('INSERT INTO mapping_instance (name, expansion, implicit_add_base) VALUES (?, ?, ?)', [name, expansion, implicitAddBase ? 1 : 0])
  if (implicitAddBase) {
    const base = name.replace(/<[^>]*>/g, '').trim()
    if (base && base !== name) {
      const baseExpansion = expansion.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      db.run('INSERT OR IGNORE INTO mapping_instance (name, expansion, implicit_add_base) VALUES (?, ?, 0)', [base, baseExpansion])
    }
  }
  persist(db)
}

export function updateMappingInstance(db: Database, id: number, name: string, expansion: string, implicitAddBase: boolean): void {
  db.run('UPDATE mapping_instance SET name = ?, expansion = ?, implicit_add_base = ? WHERE id = ?', [name, expansion, implicitAddBase ? 1 : 0, id])
  persist(db)
}

export function deleteMappingInstance(db: Database, id: number): void {
  db.run('DELETE FROM mapping_instance WHERE id = ?', [id])
  persist(db)
}

// ── List values ─────────────────────────────────────────────────────────────

export function getListValues(db: Database, typeId?: string): ListValue[] {
  const result = typeId
    ? db.exec('SELECT id, abbreviation, value, type_id FROM list_value WHERE type_id = ? ORDER BY abbreviation', [typeId])
    : db.exec('SELECT id, abbreviation, value, type_id FROM list_value ORDER BY type_id, abbreviation')
  if (!result.length) return []
  return result[0].values.map(([id, abbreviation, value, type_id]) => ({
    id: id as number,
    abbreviation: abbreviation as string,
    value: value as string,
    type_id: type_id as string,
  }))
}

export function insertListValue(db: Database, abbreviation: string, value: string, typeId: string): void {
  db.run('INSERT INTO list_value (abbreviation, value, type_id) VALUES (?, ?, ?)', [abbreviation, value, typeId])
  persist(db)
}

export function updateListValue(db: Database, id: number, abbreviation: string, value: string, typeId: string): void {
  db.run('UPDATE list_value SET abbreviation = ?, value = ?, type_id = ? WHERE id = ?', [abbreviation, value, typeId, id])
  persist(db)
}

export function deleteListValue(db: Database, id: number): void {
  db.run('DELETE FROM list_value WHERE id = ?', [id])
  persist(db)
}

// ── Mapping types ────────────────────────────────────────────────────────────

export function getMappingTypes(db: Database): MappingType[] {
  const result = db.exec('SELECT id, name FROM mapping_type ORDER BY id')
  if (!result.length) return []
  return result[0].values.map(([id, name]) => ({ id: id as string, name: name as string }))
}

export function insertMappingType(db: Database, id: string, name: string): void {
  db.run('INSERT INTO mapping_type (id, name) VALUES (?, ?)', [id, name])
  persist(db)
}

export function updateMappingType(db: Database, id: string, name: string): void {
  db.run('UPDATE mapping_type SET name = ? WHERE id = ?', [name, id])
  persist(db)
}

export function deleteMappingType(db: Database, id: string): void {
  db.run('DELETE FROM mapping_type WHERE id = ?', [id])
  persist(db)
}

// ── Shortcut groups ──────────────────────────────────────────────────────────

export function getShortcutGroups(db: Database): ShortcutGroup[] {
  const result = db.exec('SELECT id, shortcode, expansion FROM shortcut_group ORDER BY shortcode')
  if (!result.length) return []
  return result[0].values.map(([id, shortcode, expansion]) => ({
    id: id as number,
    shortcode: shortcode as string,
    expansion: expansion as string,
  }))
}

export function insertShortcutGroup(db: Database, shortcode: string, expansion: string): void {
  db.run('INSERT INTO shortcut_group (shortcode, expansion) VALUES (?, ?)', [shortcode, expansion])
  persist(db)
}

export function updateShortcutGroup(db: Database, id: number, shortcode: string, expansion: string): void {
  db.run('UPDATE shortcut_group SET shortcode = ?, expansion = ? WHERE id = ?', [shortcode, expansion, id])
  persist(db)
}

export function deleteShortcutGroup(db: Database, id: number): void {
  db.run('DELETE FROM shortcut_group WHERE id = ?', [id])
  persist(db)
}
