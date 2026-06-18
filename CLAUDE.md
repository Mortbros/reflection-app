# CLAUDE.md — Project Briefing

This file gives a new Claude instance enough context to continue development without re-reading the full conversation history.

---

## What this project is

A personal daily reflection form (Vue 3 + Vuetify 3, TypeScript) running as a local Vite dev server. The user fills in the form each day, uses typed shorthand codes that expand to full text, and copies the output to the clipboard.

**Current branch:** `feature/frecency-autocomplete` (12 commits ahead of `main`)

---

## Running the project

```bash
npm install
npm run dev   # http://localhost:5173
```

Database path: `C:\Users\sandr\OneDrive\Personal\Reflection\mappings.db`  
(configured in `vite.config.ts` — passed to `sqlitePlugin(dbPath)`)

---

## Stack

| Layer | Tech |
|-------|------|
| UI | Vue 3 Composition API, `<script setup>`, Vuetify 3 |
| Routing | vue-router 5, `createWebHistory`, file-based via `vite-plugin-pages` |
| Database | sql.js (SQLite WASM) running **server-side** in a Vite dev plugin |
| Styling | Vuetify component props only (no custom CSS except `.manual-mode`) |
| Types | TypeScript strict, `vue-tsc` |

---

## Architecture: how the database works

**Critical to understand before touching anything DB-related.**

`vite-plugin-sqlite.ts` exposes two HTTP endpoints served by the Vite dev server:

- `POST /api/db/query` — read (returns sql.js result array)
- `POST /api/db/exec` — write (returns `{ ok: true }`)

The browser never accesses the `.db` file directly. All DB calls in `src/lib/db.ts` go through `fetch()` to these endpoints. sql.js holds the database **in memory** on the server side.

**Writes are debounced:** `exec` returns immediately after `db.run()`; `writeFileSync` fires 500 ms later. Process exit / SIGINT / SIGTERM trigger a synchronous flush so no data is lost.

`db.export()` serialises the entire in-memory SQLite DB to a `Uint8Array` for each flush — this is why writes were previously slow (it happened on every single exec). The debounce batch fixes this.

---

## Key files

```
vite-plugin-sqlite.ts          SQLite Vite plugin — schema, middleware, debounced flush
src/lib/db.ts                  All DB access functions (typed wrappers around fetch)
src/lib/patternMatcher.ts      Token parser and expansion engine
src/lib/frecency.ts            Half-life frecency scoring for token_usage rows
src/components/
  DailyTrackingForm.vue        Main form — loads DB, owns tokenUsage state
  fields/
    PatternTextField.vue       Happened field — autocomplete, pattern expansion
src/pages/
  index.vue                    Route / (hosts DailyTrackingForm)
  settings.vue                 Route /settings — all CRUD tabs
```

---

## Pattern matching system

### Mapping name syntax

| Syntax | Meaning |
|--------|---------|
| `literal` | Exact string match |
| `<typeId>` | One list value of that type (matched by abbreviation) |
| `<typeId,>` | One or more list values (comma-separated in expansion) |
| `/regex/flags` | ECMAScript regex |

**Same-type multi-slot bug was already fixed.** `matchedSlots` is an ordered `MatchedSlot[]` array (not a Map), consumed positionally — so `<person>d<person>h` correctly maps the first abbreviation to the first `<person>` in the expansion, not both to the same one.

### Key exports from patternMatcher.ts

```ts
findAllMatches(token, mappings, listValues)
// → { mapping: MappingInstance; expansion: string }[]
// Returns ALL mappings that match the token (used for conflicts and autocomplete)

expandToken(token, mappings, listValues)
// → string | null
// Returns first match or null (used for space-press expansion in PatternTextField)
```

---

## Autocomplete (PatternTextField.vue)

### Data flow

1. `DailyTrackingForm.onMounted` loads `dbTokenUsage` via `getAllRecentTokenUsage(windowDays)` — **all recent rows in one DB call**, not per-keystroke
2. Passes as `:token-usage` prop to `PatternTextField`
3. `PatternTextField.fetchSuggestions` is **fully synchronous** — no DB calls during typing
4. On accept, emits `usage-recorded` → parent calls `recordTokenUsage` + optimistic local update

### Suggestion ranking tiers

| Rank | Kind | Description |
|------|------|-------------|
| 500 | `pattern` | Full token resolves via `findAllMatches` |
| 400 | `mapping` | Literal mapping name starts with token |
| 300 | `mapping` | Pattern prefix candidate — fully resolved from typed token |
| 280 | `hint` | Pattern prefix candidate — partially resolved (shown dimmed, not insertable) |
| 200+ | `frecency` | `raw_input` starts with token, sorted by half-life score |

**No expansion text matching** — the suggestion engine never matches against the expansion string, only against shortcut names and pattern slot abbreviations.

### Pattern prefix resolution (`resolveFromToken`)

For single-letter typing like "i" or "id", `resolveFromToken` walks the pattern's type slots in order and greedily resolves each slot using the typed token as a prefix:

- Token `"i"` + pattern `<person><transport>mt` → resolves `<person>` with "i"→Izzy, token exhausted → `"Izzy … me to"` (hint, kind='hint', rank 280)
- Token `"id"` + same pattern, "d" resolves transport → `"Izzy drove me to"` (fully resolved, kind='mapping', rank 300)
- Token `"idmt"` → `findAllMatches` fires at rank 500

Hints are shown dimmed/italic with a "keep typing" chip. Tab/Enter on a hint closes the dropdown without inserting anything.

### Mode toggle

Escape (first press): closes dropdown  
Escape (second press): toggles shortcut mode off → manual mode (orange border, warning banner)  
In manual mode: space-press expansion disabled, dropdown disabled

---

## Settings page tabs

| Tab value | Purpose |
|-----------|---------|
| `mappings` | CRUD for mapping_instance; toggle enabled; CSV import |
| `listValues` | CRUD for list_values; sub-tabs per type; CSV import |
| `types` | Create/rename/delete mapping_type; rename propagates to all references |
| `history` | View/delete form_history rows |
| `conflicts` | Scan for ambiguous tokens — now includes pattern-vs-pattern via `generatePatternTokens` |
| `test` | Debug a specific token against all mappings |
| `suggestions` | Analyse form_history.happened for unmapped frequently-used tokens |
| `frecency` | Edit app_settings values |

`withLoading<T>(fn)` wraps all async DB calls in settings.vue and drives a `VProgressLinear indeterminate` bar at the top of the page.

### Conflict detection (as of latest commit)

`generatePatternTokens(patternName, lvList, cap=2000)` enumerates all concrete abbreviation combinations for a pattern by expanding each `<typeId>` slot with every enabled list value abbreviation (treats `<typeId,>` same as `<typeId>` for conflict purposes). Each token is then run through `findAllMatches`. Regex mappings are skipped (unenumerable).

---

## Database schema

```sql
mapping_type     (id TEXT PK, name TEXT)
list_values      (id INTEGER PK, value TEXT, type_id TEXT, abbreviation TEXT,
                  enabled INTEGER DEFAULT 1,
                  UNIQUE(value, type_id), UNIQUE(abbreviation, type_id))
mapping_instance (id INTEGER PK, name TEXT UNIQUE, expansion TEXT,
                  enabled INTEGER DEFAULT 1)
token_usage      (id INTEGER PK, raw_input TEXT, mapping_name TEXT,
                  expansion TEXT, used_at TEXT)
app_settings     (key TEXT PK, value TEXT)
form_history     (date TEXT PK, bathe, wake, sleep, nap, worked, stress, tired,
                  game, music, grateful, learn, exercise, remember,
                  day_rating, feeling, why, phase, time, happened,
                  day_name, output, saved_at)
```

`app_settings` seeded keys: `frecency_halflife_days`, `suggestion_threshold`, `suggestion_min_length`, `token_usage_max_rows`, `autocomplete_max_results`

---

## Known gotchas

- **`listValues` passed to PatternTextField** is filtered with `forPatternMatching=true` (only enabled rows with abbreviation set). The same filtered set is used in pattern expansion.
- **`getMappingInstances(true)`** passes `onlyEnabled=true` — disabled mappings are excluded from the form entirely but still visible in settings.
- **Vuetify:** use `color` not `active-color` on `VListItem` (deprecated, causes console warnings).
- **Vue reactivity on Set:** `ignoredConflicts` uses a pattern of creating a new `Set` instance on mutation (`new Set([...existing, item])`) rather than `.add()` in-place, because in-place mutations don't trigger Vue 3 reactivity.
- **Form focus order:** Tab/Enter advance through fields via `focusRules`; the chain is defined in `DailyTrackingForm.vue` around line 210. `prevRules` is derived automatically from the same `fieldOrder` array.
- **`formRefs.bathe.value?.focus()`** in `onMounted` runs synchronously before `await loadDb()` — intentionally, to avoid focus being stolen back to the first field after the user has already started filling in the form.

---

## Security / gitignore

```
/src/assets/*
/mappings.db
/public/mappings.db
```

Personal data must never be committed. The committed `schema.sql` contains no personal data.

---

## What was just completed (latest session)

1. **Debounced DB writes** — `vite-plugin-sqlite.ts` now batches flushes; HTTP response is no longer blocked by `writeFileSync`
2. **Pre-loaded tokenUsage** — all frecency data loaded once on mount, no per-keystroke DB queries
3. **Pattern match tier in autocomplete** — `findAllMatches` runs on current token (fixes `idmt` not surfacing while typing)
4. **Character highlight** — matched prefix underlined in dropdown via `v-html` + `escHtml`
5. **Removed debounce** — `debounceMs` prop, timer, and `autocomplete_debounce_ms` app_setting all removed
6. **Suggestion ranking rework** — shortcut-name-first, no expansion text matching, frecency is last-resort
7. **Multi-slot prefix resolution** — `resolveFromToken` greedy walker enables suggestions on single-letter input
8. **Conflict detection extended** — pattern-vs-pattern conflicts via `generatePatternTokens`
9. **Focus steal fixed** — bathe no longer refocused after async DB load completes
10. **README written**
