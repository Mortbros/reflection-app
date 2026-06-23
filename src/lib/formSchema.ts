/**
 * YAML schema format parser and serialiser.
 * The YAML format is the authoritative human-editable representation; the DB
 * tables (form_schema_version / form_schema_field) are the runtime source.
 */
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import type { FormSchemaField } from './db'

export interface YamlSchemaField {
  key: string
  label: string
  type: string
  required?: boolean
  row_group?: number
  config?: Record<string, unknown>
}

export interface YamlSchema {
  effective_from: string
  note?: string
  fields: YamlSchemaField[]
}

export function parseYaml(text: string): YamlSchema {
  const raw = yamlLoad(text) as Record<string, unknown>
  if (!raw || typeof raw !== 'object') throw new Error('Invalid YAML: expected an object at the root')
  if (typeof raw.effective_from !== 'string') throw new Error('Missing required field: effective_from (string)')
  if (!Array.isArray(raw.fields)) throw new Error('Missing required field: fields (array)')

  const fields: YamlSchemaField[] = (raw.fields as unknown[]).map((f: unknown, i: number) => {
    if (!f || typeof f !== 'object') throw new Error(`Field ${i}: expected an object`)
    const field = f as Record<string, unknown>
    if (typeof field.key !== 'string') throw new Error(`Field ${i}: missing key (string)`)
    if (typeof field.label !== 'string') throw new Error(`Field ${i}: missing label (string)`)
    if (typeof field.type !== 'string') throw new Error(`Field ${i}: missing type (string)`)
    return {
      key: field.key,
      label: field.label,
      type: field.type,
      required: typeof field.required === 'boolean' ? field.required : undefined,
      row_group: typeof field.row_group === 'number' ? field.row_group : undefined,
      config: field.config && typeof field.config === 'object' ? (field.config as Record<string, unknown>) : undefined,
    }
  })

  return {
    effective_from: raw.effective_from as string,
    note: typeof raw.note === 'string' ? raw.note : undefined,
    fields,
  }
}

export function schemaToYaml(effectiveFrom: string, note: string, fields: FormSchemaField[]): string {
  const obj: YamlSchema = {
    effective_from: effectiveFrom,
    note: note || undefined,
    fields: fields.map(f => ({
      key: f.field_key,
      label: f.label,
      type: f.field_type,
      ...(f.config?.required ? { required: true } : {}),
      ...(f.row_group != null ? { row_group: f.row_group } : {}),
      ...(f.config && Object.keys(f.config).length > 0 ? { config: f.config } : {}),
    })),
  }
  return yamlDump(obj, { lineWidth: 120 })
}

/** Convert a parsed YAML schema to DB field rows (without id/version_id). */
export function yamlFieldsToDb(fields: YamlSchemaField[]): Omit<FormSchemaField, 'id' | 'version_id'>[] {
  return fields.map((f, i) => {
    const config: Record<string, unknown> = { ...(f.config ?? {}) }
    if (f.required) config.required = true
    return {
      field_key: f.key,
      label: f.label,
      field_type: f.type,
      config: Object.keys(config).length > 0 ? config : null,
      row_group: f.row_group ?? null,
      sort_order: (i + 1) * 10,
    }
  })
}
