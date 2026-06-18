export interface TokenUsageRow {
  raw_input: string
  mapping_name: string | null
  expansion: string
  used_at: string
}

export interface FrecencySuggestion {
  rawInput: string
  mappingName: string | null
  expansion: string
  score: number
}

/**
 * Scores a list of token_usage rows using half-life decay:
 *   score = Σ 2^(-(now - t) / halfLifeMs)
 * Returns suggestions deduplicated by (rawInput, expansion), sorted by score desc.
 */
export function scoreFrecency(rows: TokenUsageRow[], halfLifeDays: number): FrecencySuggestion[] {
  const now = Date.now()
  const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000
  const map = new Map<string, FrecencySuggestion>()

  for (const row of rows) {
    const key = `${row.raw_input}\0${row.mapping_name ?? ''}\0${row.expansion}`
    const t = new Date(row.used_at).getTime()
    const score = Math.pow(2, -(now - t) / halfLifeMs)
    const existing = map.get(key)
    if (existing) {
      existing.score += score
    } else {
      map.set(key, {
        rawInput: row.raw_input,
        mappingName: row.mapping_name,
        expansion: row.expansion,
        score,
      })
    }
  }

  return [...map.values()].sort((a, b) => b.score - a.score)
}
