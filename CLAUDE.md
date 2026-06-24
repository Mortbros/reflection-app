# CLAUDE.md — Project Briefing

This file gives a new Claude instance enough context to continue development without re-reading the full conversation history.

---

## What this project is

A personal daily reflection form (Vue 3 + Vuetify 3, TypeScript) running as a local Vite dev server. The user fills in the form each day, uses typed shorthand codes that expand to full text, and copies the output to the clipboard.

**Current branch:** `feature/declarative-form-structure`

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
| Schema/YAML | js-yaml (client-side parsing) |
| Docs rendering | marked (Markdown → HTML) |
| Types | TypeScript strict, `vue-tsc` |

---

## Architecture: how the database works

**Critical to understand before touching anything DB-related.**

`vite-plugin-sqlite.ts` exposes two HTTP endpoints served by the Vite dev server:

- `POST /api/db/query` — read (returns sql.js result array)
- `POST /api/db/exec` — write (returns `{ ok: true }`)

The browser never accesses the `.db` file directly. All DB calls in `src/lib/db.ts` go through `fetch()` to these endpoints. sql.js holds the database **in memory** on the server side.

**Writes are debounced:** `exec` returns immediately after `db.run()`; `writeFileSync` fires 500 ms later. Process exit / SIGINT / SIGTERM trigger a synchronous flush so no data is lost.

---

## Key files

```
vite-plugin-sqlite.ts          SQLite Vite plugin — schema, middleware, debounced flush, seed
src/lib/db.ts                  All DB access functions (typed wrappers around fetch)
src/lib/formSchema.ts          YAML parser/serialiser for form_schema_version definitions
src/lib/patternMatcher.ts      Token parser and expansion engine
src/lib/frecency.ts            Half-life frecency scoring for token_usage rows
src/components/
  DailyTrackingForm.vue        Dynamic form renderer — driven by active schema from DB
  fields/
    PatternTextField.vue       Happened field — autocomplete, pattern expansion
src/pages/
  index.vue                    Route / (hosts DailyTrackingForm)
  settings.vue                 Route /settings — all CRUD tabs including Schema tab
  help.vue                     Route /help — rendered Markdown docs
docs/
  schema-guide.md              How to define next year's form (field types, YAML format)
  database.md                  Full DB table reference
```

---

## Declarative form structure

The form layout is defined per year in the DB (`form_schema_version` + `form_schema_field`). On load, `DailyTrackingForm` fetches the active schema (latest `effective_from ≤ today`) and renders all fields dynamically. The 2025 schema matching the original hardcoded form is auto-seeded on first run.

**To define next year's form:** Settings → Schema → New version → edit YAML → Apply.  
The new schema activates automatically on its `effective_from` date with no code changes.

The YAML is generated from DB rows on demand and parsed back to DB rows on Apply — it is **not persisted as a file**.

See `docs/schema-guide.md` for the full YAML format and all field types.

---

## Mapping groups (`grp` column)

`mapping_instance.grp` (NOT NULL, default `'main'`) controls which `shortcode_text` fields see a mapping:

- `main` — default; appears in shortcode fields with `config.group: main`
- `all` — appears in **every** shortcode field regardless of its configured group
- custom (e.g. `work`) — only appears in fields explicitly configured for that group

`getMappingInstances(true, group)` filters: `grp = group OR grp = 'all'`.

---

## Pattern matching system

### Mapping name syntax

| Syntax | Meaning |
|--------|---------|
| `literal` | Exact string match |
| `<typeId>` | One list value of that type (matched by abbreviation) |
| `<typeId,>` | One or more list values (comma-separated in expansion) |
| `/regex/flags` | ECMAScript regex |

**Same-type multi-slot** — `matchedSlots` is an ordered `MatchedSlot[]` array consumed positionally, so `<person>d<person>h` correctly maps two different person slots.

### Key exports from patternMatcher.ts

```ts
findAllMatches(token, mappings, listValues)
// → { mapping: MappingInstance; expansion: string }[]
// Returns ALL matches. Literals first, then regex, then patterns.

expandToken(token, mappings, listValues)
// → string | null
// Literal → regex → pattern priority. Used for space-press expansion.
```

---

## Autocomplete (PatternTextField.vue)

### Data flow

1. `DailyTrackingForm.onMounted` loads `dbTokenUsage` via `getAllRecentTokenUsage(windowDays)` — **one DB call on mount**, not per-keystroke
2. Passes as `:token-usage` prop to `PatternTextField`
3. `PatternTextField.fetchSuggestions` is **fully synchronous** — no DB calls during typing
4. On accept, emits `usage-recorded` → parent calls `recordTokenUsage` + optimistic local update

### Suggestion ranking tiers

| Rank | Kind | Description |
|------|------|-------------|
| 600 | `pattern` | Literal exact match |
| 500+ | `pattern` | Full token resolves via `findAllMatches` (+ frecency bonus max 90) |
| 400+ | `mapping` | Literal mapping name starts with token (+ frecency bonus) |
| 300+ | `mapping` | Pattern prefix candidate — fully resolved (+ frecency bonus) |
| 280 | `hint` | Pattern prefix candidate — partially resolved (dimmed, not insertable) |
| 200+ | `frecency` | `raw_input` starts with token, sorted by half-life score |

Frecency bonus = `min(score × 10, 90)` — stays below the 100-point tier gap so it only breaks ties within a tier.

### Mode toggle

Escape (first press): closes dropdown  
Escape (second press): toggles shortcut mode off → manual mode (orange border, warning banner)  
In manual mode: space-press expansion and dropdown disabled

---

## Settings page tabs

| Tab value | Purpose |
|-----------|---------|
| `mappings` | CRUD for mapping_instance; toggle enabled; CSV import; group field |
| `listValues` | CRUD for list_values; sub-tabs per type; CSV import |
| `types` | Create/rename/delete mapping_type; rename propagates to all references |
| `history` | View/delete form_history rows; click row for read-only dialog |
| `conflicts` | Scan for ambiguous tokens (button-triggered only) |
| `test` | Debug a specific token against all mappings |
| `suggestions` | Sentence-based analysis of form_history.happened for unmapped frequent phrases |
| `appSettings` | Edit app_settings values (frecency, suggestion tuning) |
| `schema` | YAML editor + version list for form schema management |

`withLoading<T>(fn)` wraps all async DB calls and drives a `VProgressLinear indeterminate` bar.

---

## Database schema

Full reference: `docs/database.md`. Summary:

```
mapping_type         (id TEXT PK, name TEXT)
list_values          (id PK, value, type_id, abbreviation, enabled)
mapping_instance     (id PK, name UNIQUE, expansion, enabled, grp NOT NULL DEFAULT 'main')
token_usage          (id PK, raw_input, mapping_name, expansion, used_at)
app_settings         (key TEXT PK, value TEXT)
form_history         (date PK, ...legacy fixed columns..., responses TEXT, schema_version_id)
form_schema_version  (id PK, effective_from TEXT UNIQUE, note)
form_schema_field    (id PK, version_id, field_key, label, field_type, config JSON, row_group, sort_order)
```

`form_history` still has legacy fixed columns for backward compat. New submissions also write `responses` (JSON keyed by `field_key`). Legacy columns will be dropped in a future migration.

---

## Known gotchas

- **`listValues` passed to PatternTextField** is filtered with `forPatternMatching=true` (only enabled rows with abbreviation set).
- **`getMappingInstances(true, group)`** — first arg = onlyEnabled, second = group filter (`grp = group OR grp = 'all'`).
- **Vuetify:** use `color` not `active-color` on `VListItem` (deprecated).
- **Vue reactivity on Set:** use `new Set([...existing, item])` not `.add()` in-place.
- **DailyTrackingForm focus order** is derived from `navigableKeys` (schema field order, excluding `time_display`). The date field is rendered separately above the schema loop and hardcoded with `onNext('date')`.
- **Schema YAML is not stored as a file** — it is generated from DB rows when you open a version in the Schema tab, and parsed back to DB rows on Apply.

---

## Security / gitignore

```
/src/assets/*
/mappings.db
/public/mappings.db
```

Personal data must never be committed.
