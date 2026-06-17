import type { ListValue, MappingInstance } from './db'

interface PatternSegment {
  type: 'literal' | 'regex' | 'typeSlot'
  content: string        // original text e.g. "<p,>"
  typeId?: string        // e.g. "p"
  multiple?: boolean     // true for <p,>
  regexPattern?: RegExp
}

/**
 * Parses a mapping key into segments.
 * Handles: literal text, /regex/flags, and <typeId> or <typeId,> slots.
 */
function parseKey(key: string): PatternSegment[] {
  const segments: PatternSegment[] = []
  let i = 0

  while (i < key.length) {
    if (key[i] === '/') {
      const regexEnd = key.indexOf('/', i + 1)
      if (regexEnd > i) {
        const pattern = key.slice(i + 1, regexEnd)
        const flags = key.slice(regexEnd + 1).match(/^[gimsuy]*/)?.[0] ?? ''
        try {
          const regex = new RegExp(pattern, flags)
          segments.push({
            type: 'regex',
            content: key.slice(i, regexEnd + 1 + flags.length),
            regexPattern: regex,
          })
          i = regexEnd + 1 + flags.length
          continue
        } catch {
          // invalid regex — fall through to literal
        }
      }
    }

    // <typeId,> or <typeId>
    if (key[i] === '<') {
      const closeIdx = key.indexOf('>', i)
      if (closeIdx > i) {
        const inner = key.slice(i + 1, closeIdx) // e.g. "p," or "p" or "pl,"
        const multiple = inner.endsWith(',')
        const typeId = multiple ? inner.slice(0, -1) : inner
        if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(typeId)) {
          segments.push({
            type: 'typeSlot',
            content: key.slice(i, closeIdx + 1),
            typeId,
            multiple,
          })
          i = closeIdx + 1
          continue
        }
      }
    }

    // Literal — collect until next special char
    let end = i
    while (end < key.length && key[end] !== '/' && key[end] !== '<') end++
    if (end > i) {
      segments.push({ type: 'literal', content: key.slice(i, end) })
      i = end
    } else {
      i++
    }
  }

  return segments
}

function buildMatchingPattern(
  segments: PatternSegment[],
  listValuesByType: Map<string, ListValue[]>,
): { pattern: RegExp; slotIndices: { captureIdx: number; typeId: string; multiple: boolean }[] } {
  const slotIndices: { captureIdx: number; typeId: string; multiple: boolean }[] = []
  const parts: string[] = ['^']
  let captureIdx = 1

  for (const seg of segments) {
    if (seg.type === 'literal') {
      parts.push(seg.content.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    } else if (seg.type === 'regex') {
      const m = seg.content.match(/^\/(.+)\/([gimsuy]*)$/)
      if (m) {
        parts.push(`(${m[1]})`)
        captureIdx++
      }
    } else if (seg.type === 'typeSlot' && seg.typeId) {
      const vals = (listValuesByType.get(seg.typeId) ?? []).filter(v => v.abbreviation !== null)
      const sortedKeys = [...vals]
        .sort((a, b) => b.abbreviation!.length - a.abbreviation!.length)
        .map(v => v.abbreviation!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

      const altPattern = sortedKeys.length ? sortedKeys.join('|') : '[^\\s]+'
      const capPattern = seg.multiple
        ? `((?:${altPattern})+)`
        : `(${altPattern})`

      parts.push(capPattern)
      slotIndices.push({ captureIdx, typeId: seg.typeId, multiple: seg.multiple ?? false })
      captureIdx++
    }
  }

  parts.push('$')
  return { pattern: new RegExp(parts.join('')), slotIndices }
}

function resolveTypeChars(chars: string, values: ListValue[]): string[] {
  const sorted = [...values]
    .filter(v => v.abbreviation !== null)
    .sort((a, b) => b.abbreviation!.length - a.abbreviation!.length)
  const results: string[] = []
  let remaining = chars

  while (remaining.length > 0) {
    const match = sorted.find(v => remaining.startsWith(v.abbreviation!))
    if (match) {
      results.push(match.value)
      remaining = remaining.slice(match.abbreviation!.length)
    } else {
      remaining = remaining.slice(1)
    }
  }

  return results
}

function matchPattern(
  input: string,
  key: string,
  listValues: ListValue[],
): { matched: boolean; matchedNamesByType: Map<string, string[]> } {
  const segments = parseKey(key)
  const hasSlot = segments.some(s => s.type === 'typeSlot')

  if (!hasSlot) return { matched: false, matchedNamesByType: new Map() }

  const byType = new Map<string, ListValue[]>()
  for (const v of listValues) {
    const arr = byType.get(v.type_id) ?? []
    arr.push(v)
    byType.set(v.type_id, arr)
  }

  const { pattern, slotIndices } = buildMatchingPattern(segments, byType)
  const match = input.match(pattern)
  if (!match) return { matched: false, matchedNamesByType: new Map() }

  const matchedNamesByType = new Map<string, string[]>()
  for (const { captureIdx, typeId } of slotIndices) {
    const chars = match[captureIdx]
    if (chars) {
      const vals = byType.get(typeId) ?? []
      const names = resolveTypeChars(chars, vals)
      if (names.length > 0) {
        matchedNamesByType.set(typeId, names)
      }
    }
  }

  if (matchedNamesByType.size > 0) {
    return { matched: true, matchedNamesByType }
  }
  return { matched: false, matchedNamesByType: new Map() }
}

/**
 * Expands a template string by replacing <typeId> and <typeId,> with matched values.
 * <typeId> → first matched value for that type
 * <typeId,> → all matched values comma-separated
 */
function expandValue(template: string, matchedNamesByType: Map<string, string[]>): string {
  return template.replace(/<([a-zA-Z][a-zA-Z0-9]*)(,?)>/g, (_match, typeId, comma) => {
    const names = matchedNamesByType.get(typeId) ?? []
    if (names.length === 0) return ''
    return comma === ',' || names.length > 1 ? names.join(', ') : (names[0] ?? '')
  })
}

/**
 * Attempts to expand a single token against the provided mapping rules.
 * Returns the expanded string or null if no match.
 */
export function expandToken(
  token: string,
  mappings: MappingInstance[],
  listValues: ListValue[],
): string | null {
  for (const rule of mappings) {
    const key = rule.name.trim()
    if (!key) continue

    const hasSlot = key.includes('<')
    if (hasSlot) {
      const result = matchPattern(token, key, listValues)
      if (result.matched) {
        return expandValue(rule.expansion, result.matchedNamesByType)
      }
      continue
    }

    const isRegex = key.startsWith('/') && key.lastIndexOf('/') > 0
    if (isRegex) {
      try {
        const lastSlash = key.lastIndexOf('/')
        const pattern = key.slice(1, lastSlash)
        const flags = key.slice(lastSlash + 1)
        if (new RegExp(`^${pattern}$`, flags).test(token)) {
          return rule.expansion
        }
      } catch {
        // skip invalid regex
      }
    } else if (key === token) {
      return rule.expansion
    }
  }
  return null
}
