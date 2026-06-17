// All DB access goes through the Vite dev server SQLite middleware.
// No sql.js in the browser — the server owns the .db file on disk.

export interface MappingInstance {
  id: number
  name: string
  expansion: string
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

export async function getListValues(typeId?: string): Promise<ListValue[]> {
  if (typeId) {
    return toObjects(
      await query('SELECT id, abbreviation, value, type_id FROM list_value WHERE type_id = ? ORDER BY abbreviation', [typeId])
    )
  }
  return toObjects(
    await query('SELECT id, abbreviation, value, type_id FROM list_value ORDER BY type_id, abbreviation')
  )
}

export async function insertListValue(abbreviation: string, value: string, typeId: string): Promise<void> {
  await exec('INSERT INTO list_value (abbreviation, value, type_id) VALUES (?, ?, ?)', [abbreviation, value, typeId])
}

export async function updateListValue(id: number, abbreviation: string, value: string, typeId: string): Promise<void> {
  await exec('UPDATE list_value SET abbreviation = ?, value = ?, type_id = ? WHERE id = ?', [abbreviation, value, typeId, id])
}

export async function deleteListValue(id: number): Promise<void> {
  await exec('DELETE FROM list_value WHERE id = ?', [id])
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
