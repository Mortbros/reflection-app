// All DB access goes through the Vite dev server SQLite middleware.
// No sql.js in the browser — the server owns the .db file on disk.

export interface MappingInstance {
  id: number
  name: string
  expansion: string
  enabled: boolean
}

export interface ListValue {
  id: number
  value: string
  type_id: string
  abbreviation: string | null  // null = autocomplete-only; set = also usable in pattern matching
  enabled: boolean
}

export interface MappingType {
  id: string
  name: string
}


// ── Transport ────────────────────────────────────────────────────────────────

type SqlJsResult = { columns: string[]; values: unknown[][] }[]

async function query(sql: string, params?: unknown[]): Promise<SqlJsResult> {
  const res = await fetch('/api/db/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function exec(sql: string, params?: unknown[]): Promise<void> {
  const res = await fetch('/api/db/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  })
  if (!res.ok) throw new Error(await res.text())
}

/** Map sql.js result rows to typed objects. */
function toObjects<T>(results: SqlJsResult): T[] {
  if (!results.length) return []
  const { columns, values } = results[0]
  return values.map(
    (row) => Object.fromEntries(columns.map((col, i) => [col, row[i]])) as T
  )
}

// ── Mapping instances ────────────────────────────────────────────────────────

export async function getMappingInstances(onlyEnabled = false): Promise<MappingInstance[]> {
  const sql = onlyEnabled
    ? 'SELECT id, name, expansion, enabled FROM mapping_instance WHERE enabled = 1 ORDER BY name'
    : 'SELECT id, name, expansion, enabled FROM mapping_instance ORDER BY name'
  const rows = toObjects<{ id: number; name: string; expansion: string; enabled: number }>(
    await query(sql)
  )
  return rows.map(r => ({ ...r, enabled: r.enabled !== 0 }))
}

export async function insertMappingInstance(name: string, expansion: string): Promise<void> {
  await exec(
    'INSERT INTO mapping_instance (name, expansion) VALUES (?, ?)',
    [name, expansion]
  )
}

export async function updateMappingInstance(id: number, name: string, expansion: string): Promise<void> {
  await exec(
    'UPDATE mapping_instance SET name = ?, expansion = ? WHERE id = ?',
    [name, expansion, id]
  )
}

export async function deleteMappingInstance(id: number): Promise<void> {
  await exec('DELETE FROM mapping_instance WHERE id = ?', [id])
}

export async function setMappingInstanceEnabled(id: number, enabled: boolean): Promise<void> {
  await exec('UPDATE mapping_instance SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id])
}

// INSERT OR IGNORE variants used for CSV import (silently skip duplicates)
export async function importMappingInstance(name: string, expansion: string): Promise<void> {
  await exec('INSERT OR IGNORE INTO mapping_instance (name, expansion) VALUES (?, ?)', [name, expansion])
}

export async function importListValue(value: string, typeId: string, abbreviation?: string): Promise<void> {
  await exec('INSERT OR IGNORE INTO list_values (value, type_id, abbreviation) VALUES (?, ?, ?)', [value, typeId, abbreviation ?? null])
}

export async function importMappingType(id: string, name: string): Promise<void> {
  await exec('INSERT OR IGNORE INTO mapping_type (id, name) VALUES (?, ?)', [id, name])
}

// ── List values ──────────────────────────────────────────────────────────────

/** Returns all list_values rows. Pass forPatternMatching=true to only return enabled rows with an abbreviation. */
export async function getListValues(forPatternMatching = false): Promise<ListValue[]> {
  const sql = forPatternMatching
    ? 'SELECT id, value, type_id, abbreviation, enabled FROM list_values WHERE abbreviation IS NOT NULL AND enabled = 1 ORDER BY type_id, abbreviation'
    : 'SELECT id, value, type_id, abbreviation, enabled FROM list_values ORDER BY type_id, value'
  const rows = toObjects<{ id: number; value: string; type_id: string; abbreviation: string | null; enabled: number }>(
    await query(sql)
  )
  return rows.map(r => ({ ...r, enabled: r.enabled !== 0 }))
}

/** Returns display values for autocomplete — enabled values for the given type. */
export async function getSuggestions(typeId: string): Promise<string[]> {
  const rows = toObjects<{ value: string }>(
    await query('SELECT value FROM list_values WHERE type_id = ? AND enabled = 1 ORDER BY value', [typeId])
  )
  return rows.map((r) => r.value)
}

export async function insertListValue(value: string, typeId: string, abbreviation?: string): Promise<void> {
  await exec(
    'INSERT INTO list_values (value, type_id, abbreviation) VALUES (?, ?, ?)',
    [value, typeId, abbreviation ?? null]
  )
}

export async function updateListValue(id: number, value: string, typeId: string, abbreviation?: string): Promise<void> {
  await exec(
    'UPDATE list_values SET value = ?, type_id = ?, abbreviation = ? WHERE id = ?',
    [value, typeId, abbreviation ?? null, id]
  )
}

export async function deleteListValue(id: number): Promise<void> {
  await exec('DELETE FROM list_values WHERE id = ?', [id])
}

export async function setListValueEnabled(id: number, enabled: boolean): Promise<void> {
  await exec('UPDATE list_values SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id])
}

// ── Mapping types ────────────────────────────────────────────────────────────

export async function getMappingTypes(): Promise<MappingType[]> {
  return toObjects(await query('SELECT id, name FROM mapping_type ORDER BY id'))
}

export async function insertMappingType(id: string, name: string): Promise<void> {
  await exec('INSERT INTO mapping_type (id, name) VALUES (?, ?)', [id, name])
}

export async function updateMappingType(id: string, name: string): Promise<void> {
  await exec('UPDATE mapping_type SET name = ? WHERE id = ?', [name, id])
}

export async function deleteMappingType(id: string): Promise<void> {
  await exec('DELETE FROM mapping_type WHERE id = ?', [id])
}

export async function countMappingsUsingType(typeId: string): Promise<number> {
  const slot = `%<${typeId}>%`
  const slotMultiple = `%<${typeId},>%`
  const rows = toObjects<{ count: number }>(
    await query(
      `SELECT COUNT(*) as count FROM mapping_instance
       WHERE name LIKE ? OR name LIKE ? OR expansion LIKE ? OR expansion LIKE ?`,
      [slot, slotMultiple, slot, slotMultiple]
    )
  )
  return rows[0]?.count ?? 0
}

export async function renameMappingTypeId(
  oldId: string,
  newId: string,
  updateMappings: boolean,
): Promise<void> {
  await exec('UPDATE mapping_type SET id = ? WHERE id = ?', [newId, oldId])
  await exec('UPDATE list_values SET type_id = ? WHERE type_id = ?', [newId, oldId])
  if (updateMappings) {
    const oldSlot = `<${oldId}>`
    const oldSlotMultiple = `<${oldId},>`
    const newSlot = `<${newId}>`
    const newSlotMultiple = `<${newId},>`
    await exec(
      `UPDATE mapping_instance SET
         name = REPLACE(REPLACE(name, ?, ?), ?, ?),
         expansion = REPLACE(REPLACE(expansion, ?, ?), ?, ?)`,
      [oldSlotMultiple, newSlotMultiple, oldSlot, newSlot,
       oldSlotMultiple, newSlotMultiple, oldSlot, newSlot]
    )
  }
}

// ── Form history ──────────────────────────────────────────────────────────────

export interface FormHistoryRow {
  date: string
  bathe: string
  wake: string
  sleep: string
  nap: string
  worked: string
  stress: string
  tired: string
  game: string
  music: string
  grateful: string
  learn: string
  exercise: string
  remember: string
  day_rating: string
  feeling: string
  why: string
  phase: string
  time: string
  happened: string
  day_name: string
  output: string
  saved_at: string
}

export async function upsertFormHistory(row: FormHistoryRow): Promise<void> {
  await exec(
    `INSERT INTO form_history
       (date, bathe, wake, sleep, nap, worked, stress, tired, game, music,
        grateful, learn, exercise, remember, day_rating, feeling, why, phase,
        time, happened, day_name, output, saved_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(date) DO UPDATE SET
       bathe=excluded.bathe, wake=excluded.wake, sleep=excluded.sleep,
       nap=excluded.nap, worked=excluded.worked, stress=excluded.stress,
       tired=excluded.tired, game=excluded.game, music=excluded.music,
       grateful=excluded.grateful, learn=excluded.learn, exercise=excluded.exercise,
       remember=excluded.remember, day_rating=excluded.day_rating,
       feeling=excluded.feeling, why=excluded.why, phase=excluded.phase,
       time=excluded.time, happened=excluded.happened, day_name=excluded.day_name,
       output=excluded.output, saved_at=excluded.saved_at`,
    [
      row.date, row.bathe, row.wake, row.sleep, row.nap, row.worked,
      row.stress, row.tired, row.game, row.music, row.grateful, row.learn,
      row.exercise, row.remember, row.day_rating, row.feeling, row.why,
      row.phase, row.time, row.happened, row.day_name, row.output, row.saved_at,
    ]
  )
}

export async function getFormHistory(): Promise<FormHistoryRow[]> {
  return toObjects(
    await query(
      `SELECT date, bathe, wake, sleep, nap, worked, stress, tired, game, music,
              grateful, learn, exercise, remember, day_rating, feeling, why, phase,
              time, happened, day_name, output, saved_at
       FROM form_history ORDER BY date DESC`
    )
  )
}

export async function deleteFormHistoryRow(date: string): Promise<void> {
  await exec('DELETE FROM form_history WHERE date = ?', [date])
}

// ── Token usage (frecency) ────────────────────────────────────────────────────

import type { TokenUsageRow } from './frecency'

export async function recordTokenUsage(
  rawInput: string,
  mappingName: string | null,
  expansion: string,
): Promise<void> {
  await exec(
    'INSERT INTO token_usage (raw_input, mapping_name, expansion, used_at) VALUES (?, ?, ?, ?)',
    [rawInput, mappingName, expansion, new Date().toISOString()]
  )
  // Prune oldest rows only when a positive limit is configured (0 or missing = unlimited)
  const limitRows = toObjects<{ value: string }>(
    await query("SELECT value FROM app_settings WHERE key = 'token_usage_max_rows'")
  )
  const maxRows = parseInt(limitRows[0]?.value ?? '0') || 0
  if (maxRows > 0) {
    await exec(
      `DELETE FROM token_usage WHERE id IN (
         SELECT id FROM token_usage ORDER BY used_at ASC
         LIMIT MAX(0, (SELECT COUNT(*) FROM token_usage) - ?)
       )`,
      [maxRows]
    )
  }
}

/**
 * Returns all recent token_usage rows within a rolling window.
 * Loaded once on form mount and kept in memory; no DB queries during typing.
 */
export async function getAllRecentTokenUsage(windowDays: number): Promise<TokenUsageRow[]> {
  return toObjects(await query(
    `SELECT raw_input, mapping_name, expansion, used_at FROM token_usage
     WHERE used_at > datetime('now', ?)
     ORDER BY used_at DESC LIMIT 5000`,
    [`-${windowDays} days`]
  ))
}

/** Fetches all non-empty 'happened' strings from form_history for offline analysis. */
export async function getFormHistoryHappenedTexts(): Promise<string[]> {
  const rows = toObjects<{ happened: string }>(
    await query("SELECT happened FROM form_history WHERE happened IS NOT NULL AND happened != ''")
  )
  return rows.map(r => r.happened).filter(Boolean)
}

// ── App settings ──────────────────────────────────────────────────────────────

export async function getAllAppSettings(): Promise<Record<string, string>> {
  const rows = toObjects<{ key: string; value: string }>(
    await query('SELECT key, value FROM app_settings')
  )
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  await exec('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, value])
}

