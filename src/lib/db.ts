// All DB access goes through the Vite dev server SQLite middleware.
// No sql.js in the browser — the server owns the .db file on disk.

export interface MappingInstance {
  id: number
  name: string
  expansion: string
}

export interface ListValue {
  id: number
  value: string
  type_id: string
  abbreviation: string | null  // null = autocomplete-only; set = also usable in pattern matching
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

export async function getMappingInstances(): Promise<MappingInstance[]> {
  return toObjects(
    await query('SELECT id, name, expansion FROM mapping_instance ORDER BY name')
  )
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

// ── List values ──────────────────────────────────────────────────────────────

/** Returns all list_values rows. Pass forPatternMatching=true to exclude rows with null abbreviation. */
export async function getListValues(forPatternMatching = false): Promise<ListValue[]> {
  const sql = forPatternMatching
    ? 'SELECT id, value, type_id, abbreviation FROM list_values WHERE abbreviation IS NOT NULL ORDER BY type_id, abbreviation'
    : 'SELECT id, value, type_id, abbreviation FROM list_values ORDER BY type_id, value'
  return toObjects(await query(sql))
}

/** Returns display values for autocomplete — all values for the given type. */
export async function getSuggestions(typeId: string): Promise<string[]> {
  const rows = toObjects<{ value: string }>(
    await query('SELECT value FROM list_values WHERE type_id = ? ORDER BY value', [typeId])
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

// ── Shortcut groups ──────────────────────────────────────────────────────────

export async function getShortcutGroups(): Promise<ShortcutGroup[]> {
  return toObjects(await query('SELECT id, shortcode, expansion FROM shortcut_group ORDER BY shortcode'))
}

export async function insertShortcutGroup(shortcode: string, expansion: string): Promise<void> {
  await exec('INSERT INTO shortcut_group (shortcode, expansion) VALUES (?, ?)', [shortcode, expansion])
}

export async function updateShortcutGroup(id: number, shortcode: string, expansion: string): Promise<void> {
  await exec('UPDATE shortcut_group SET shortcode = ?, expansion = ? WHERE id = ?', [shortcode, expansion, id])
}

export async function deleteShortcutGroup(id: number): Promise<void> {
  await exec('DELETE FROM shortcut_group WHERE id = ?', [id])
}
