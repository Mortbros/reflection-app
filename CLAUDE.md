# CLAUDE.md — Project Briefing

This file gives a new Claude instance enough context to continue development without re-reading the full conversation history.

---

## What this project is

A personal daily reflection form (Vue 3 + Vuetify 3, TypeScript) running as a local Vite dev server. The user fills in the form each day, uses typed shorthand codes that expand to full text, and copies the output to the clipboard.

**Current branch:** `feature/multi-autosuggest-rework`

---

## Development conventions

- **Commit regularly** throughout a development session — after each logical unit of work (feature, fix, cleanup). Don't batch everything into one commit at the end.

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
    CommaListField.vue         autocomplete_list fields — chips with capture-phase keydown
    PlainListField.vue         list fields — plain comma-separated text input
src/pages/
  index.vue                    Route / (hosts DailyTrackingForm)
  settings.vue                 Route /settings — all CRUD tabs including Schema tab
  help.vue                     Route /help — rendered Markdown docs
src/main.ts                    Vuetify global compact density defaults
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

### Accepting suggestions

- **Enter / Tab** accepts the highlighted suggestion (or the top one if none highlighted)
- **Space** with an arrow-key-highlighted suggestion accepts it; otherwise Space triggers the default token expansion via `expandWithFrecency`
- All accept paths (including mouse click) apply sentence-start capitalization: first letter is uppercased when the preceding text is empty or ends with `.`, `!`, `?`
- After accepting, the textarea is **re-queried** (`getTextarea()`) before refocusing — the value update can re-render the node, so a captured reference may be detached

### Mode toggle

Escape (first press): closes dropdown  
Escape (second press): toggles shortcut mode off → manual mode (orange border, warning banner)  
In manual mode: space-press expansion and dropdown disabled

---

## Settings page tabs

| Tab value | Purpose |
|-----------|---------|
| `mappings` | CRUD for mapping_instance; toggle enabled; CSV import; `grp` column shown |
| `listValues` | CRUD for list_values; sub-tabs per type; CSV import (label: "Lists") |
| `types` | Create/rename/delete mapping_type; rename propagates to all references |
| `history` | View/delete form_history rows; click row for read-only dialog; TSV/CSV bulk import |
| `scan` | Merged Conflicts + Suggestions — run each scan independently with a button |
| `test` | Debug a specific token against all mappings |
| `appSettings` | Edit app_settings values (frecency, suggestion tuning) |
| `schema` | YAML editor + version list for form schema management |

Tab switch animations are disabled via CSS (`transition: none !important` on `.v-window__container` and `.v-window-item`).

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
form_history         (date PK, responses TEXT, schema_version_id)
form_schema_version  (id PK, effective_from TEXT UNIQUE, note)
form_schema_field    (id PK, version_id, field_key, label, field_type, config JSON, row_group, sort_order)
```

`form_history` legacy fixed columns have been migrated to `responses` JSON and dropped. `responses` is a JSON object keyed by `field_key`.

---

## Field component architecture

Field types map to components in `src/components/fields/`:

| Field type | Component | Notes |
|---|---|---|
| `list` | `PlainListField.vue` | Plain VTextField; values joined/split by `, ` |
| `autocomplete_list` | `CommaListField.vue` | VCombobox with chips; capture-phase keydown |
| `shortcode_text` | `PatternTextField.vue` | Pattern expansion, frecency autocomplete |
| `date` | `DateField.vue` | |
| `yes_no` | `YesNoField.vue` | |
| `time` | `TimeField.vue` | |
| `time_display` | `TimeDisplay.vue` | Read-only; excluded from clipboard output |
| `float` | `FloatField.vue` | |
| `int` | `IntField.vue` | |
| `string` | `StringField.vue` | |

All fields inherit compact density from the global Vuetify defaults in `src/main.ts`:
```ts
defaults: {
  VTextField: { density: 'compact' },
  VCombobox:  { density: 'compact' },
  VSelect:    { density: 'compact' },
}
```

### CommaListField — capture-phase keydown

VCombobox's internal keydown handler intercepts Enter before Vue bubble-phase listeners. To take full control, `CommaListField` registers a capture-phase listener on the native `<input>` in `onMounted`:

```ts
getNativeInput()?.addEventListener('keydown', nativeKeydown, { capture: true })
```

This lets us `stopPropagation()` before VCombobox sees the event. Key behaviours:
- **Enter** — picks top filtered suggestion, or commits typed text as a free-text chip if nothing matches; if input is empty, calls `onNext()`
- **`, ` (comma + space)** — adds typed text as a free-text chip
- **Backspace** (empty input) — removes last chip with single press
- **Tab** — commits top suggestion (or free text if no match), then advances

After any chip add, `clearInput()` resets both the reactive `searchText` ref AND the native input DOM value (required because VCombobox retains its display value separately).

### emptyValue config

`autocomplete_list` fields support `emptyValue` in their config JSON. When the field has no chips selected, the clipboard output uses `emptyValue` instead of blank. The field shows `emptyValue` as a placeholder while unfocused and empty (via `persistent-placeholder`); it disappears on focus so typing starts clean.

- Game, Music, Exercise all use `emptyValue: "N"` (seeded and migrated)
- `getEmptyValue(field)` helper in `DailyTrackingForm` reads `config.emptyValue` (also accepts legacy `defaultN: true` for backward compat)
- `vite-plugin-sqlite.ts` includes a migration that converts any `defaultN: true` in existing DBs to `emptyValue: "N"`
- `persistNewListValues` skips the emptyValue string so it isn't added to the suggestion list

---

## Known gotchas

- **`listValues` passed to PatternTextField** is filtered with `forPatternMatching=true` (only enabled rows with abbreviation set).
- **`getMappingInstances(true, group)`** — first arg = onlyEnabled, second = group filter (`grp = group OR grp = 'all'`).
- **Vuetify:** use `color` not `active-color` on `VListItem` (deprecated).
- **Vue reactivity on Set:** use `new Set([...existing, item])` not `.add()` in-place.
- **DailyTrackingForm focus order** is derived from `navigableKeys` (schema field order, excluding `time_display`). The date field is rendered separately above the schema loop and hardcoded with `onNext('date')`.
- **Schema YAML is not stored as a file** — it is generated from DB rows when you open a version in the Schema tab, and parsed back to DB rows on Apply.
- **Form restore**: `loadFormData()` must be called BEFORE `await loadDb()` in `onMounted`. The `schemaFields` watcher fires after schema loads and initialises defaults — if saved data isn't already in `formData` by then, it gets overwritten.
- **Clipboard output order**: time_display field IS included; time and happened fields are swapped in output order (happened comes before time) regardless of schema order.
- **`defaultN` is deprecated** — use `emptyValue` instead. Backward compat remains in `getEmptyValue()`.
- **Grouped field rows** (`row_group`) use `flex: 1 1 0; min-width: 0` on each VCol with `flex-wrap: nowrap` on the VRow — equal widths, never wraps. Don't reintroduce breakpoint cols there.
- **Mobile layout**: the form card is `pa-1 pa-sm-6` with border/shadow removed under 600px (`.form-card` media query) for full-bleed width.
- **Form header** has YouTube (`mdi-youtube`) and My Activity (`mdi-google`) icon buttons mirroring the Ctrl+Y / Ctrl+G shortcuts handled in `App.vue` (Ctrl+S dispatches the `app:copy` custom event).

---

## Security / gitignore

```
/src/assets/*
/mappings.db
/public/mappings.db
```

Personal data must never be committed.
