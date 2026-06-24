# Database Reference

The app uses SQLite (via sql.js WASM) served by a Vite dev server plugin. The database file lives at:

```
C:\Users\sandr\OneDrive\Personal\Reflection\mappings.db
```

The browser never touches this file directly. All reads go through `POST /api/db/query` and all writes through `POST /api/db/exec`, both served by `vite-plugin-sqlite.ts`. sql.js holds the DB in memory; writes are flushed to disk 500 ms after each exec (debounced).

---

## Tables

### `mapping_type`

Defines named categories used in pattern slots (e.g. `<person>`, `<transport>`).

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Short identifier used inside `<>` in mapping names — e.g. `person`, `transport` |
| `name` | TEXT | Human-readable label — e.g. `Person`, `Transport` |

---

### `list_values`

Individual values belonging to a `mapping_type`. Each value can have a short abbreviation used in pattern matching.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `value` | TEXT | Full value — e.g. `Izzy`, `drove` |
| `type_id` | TEXT | Matches a `mapping_type.id` — e.g. `person`, `transport` |
| `abbreviation` | TEXT \| NULL | Short code — e.g. `iz`, `d`. NULL = autocomplete-only (not usable in patterns) |
| `enabled` | INTEGER | 1 = active, 0 = disabled |

**Constraints:** `UNIQUE(value, type_id)`, `UNIQUE(abbreviation, type_id)`

---

### `mapping_instance`

Shortcode expansion rules. A `name` is what you type; the `expansion` is what it becomes.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT UNIQUE | Shortcode — literal (`dh`), pattern (`<transport><place>`), or regex (`/^\d+min$/`) |
| `expansion` | TEXT | What the shortcode expands to — e.g. `Drove home` |
| `enabled` | INTEGER | 1 = active, 0 = disabled (hidden from form, visible in settings) |
| `grp` | TEXT | Mapping group. `main` = default. `all` = appears in every shortcode field. Custom groups (e.g. `work`) are used by `shortcode_text` schema fields with `config.group` set |

**Mapping name syntax:**

| Pattern | Meaning | Example |
|---|---|---|
| `dh` | Exact literal match | `dh` → `Drove home` |
| `<person>` | One list value of that type | `iz` → `Izzy` |
| `<person,>` | One or more comma-joined values | `izsa` → `Izzy, Sandra` |
| `/regex/flags` | ECMAScript regex | `/^\d+m$/` matches `10m`, `25m` |

---

### `token_usage`

Log of every shortcode expansion accepted by the user. Powers the frecency autocomplete ranking.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `raw_input` | TEXT | What the user typed before accepting |
| `mapping_name` | TEXT \| NULL | The mapping that fired (NULL if no mapping matched) |
| `expansion` | TEXT | The resulting expansion text |
| `used_at` | TEXT | ISO 8601 timestamp |

Rows are pruned to `token_usage_max_rows` (configurable in `app_settings`) by dropping oldest first.

---

### `app_settings`

Key/value store for runtime configuration. Managed in **Settings → Frecency**.

| Key | Default | Description |
|---|---|---|
| `frecency_halflife_days` | `7` | Half-life for frecency scoring. Lower = recent usage counts more |
| `suggestion_threshold` | `3` | Minimum times a sentence must appear to be suggested |
| `suggestion_min_length` | `4` | Minimum character length for sentence suggestions |
| `token_usage_max_rows` | `10000` | Maximum rows kept in `token_usage` |
| `autocomplete_max_results` | `5` | Maximum suggestions shown in the autocomplete dropdown |

---

### `form_history`

One row per submitted day. Stores both the legacy fixed columns (for backward compat) and a `responses` JSON blob written by the current schema-driven form.

| Column | Type | Notes |
|---|---|---|
| `date` | TEXT PK | ISO date — e.g. `2025-06-24` |
| `bathe` | TEXT | |
| `wake` | TEXT | |
| `sleep` | TEXT | |
| `nap` | TEXT | |
| `worked` | TEXT | |
| `stress` | TEXT | |
| `tired` | TEXT | |
| `game` | TEXT | Comma-separated |
| `music` | TEXT | Comma-separated |
| `grateful` | TEXT | Comma-separated |
| `learn` | TEXT | Comma-separated |
| `exercise` | TEXT | Comma-separated |
| `remember` | TEXT | |
| `day_rating` | TEXT | |
| `feeling` | TEXT | |
| `why` | TEXT | |
| `phase` | TEXT | Comma-separated |
| `time` | TEXT | Clock time at submission |
| `happened` | TEXT | |
| `day_name` | TEXT | |
| `output` | TEXT | Full tab-separated clipboard string saved at submission time |
| `saved_at` | TEXT | ISO 8601 timestamp |
| `responses` | TEXT \| NULL | JSON object keyed by `field_key` — written by the schema-driven form |
| `schema_version_id` | INTEGER \| NULL | References `form_schema_version.id` |

**Note:** The legacy fixed columns are kept for backward compatibility with pre-2025 rows. New submissions write both the fixed columns and `responses`. The fixed columns will be dropped in a future migration once all rows have been migrated.

---

### `form_schema_version`

One row per form layout definition. The form uses the version with the latest `effective_from` that is on or before today.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `effective_from` | TEXT UNIQUE | ISO date — e.g. `2026-01-01`. The form switches to this schema on this date |
| `note` | TEXT \| NULL | Human-readable label — e.g. `2026 reflection` |

---

### `form_schema_field`

One row per field in a schema version, in display order.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `version_id` | INTEGER | References `form_schema_version.id` |
| `field_key` | TEXT | Internal identifier used in `responses` JSON — e.g. `stress`, `happened` |
| `label` | TEXT | Displayed label on the form |
| `field_type` | TEXT | Component type — see the Schema Guide for the full list |
| `config` | TEXT \| NULL | JSON object of type-specific options — e.g. `{"max":10,"required":true}` |
| `row_group` | INTEGER \| NULL | Fields sharing the same integer are placed on one horizontal row |
| `sort_order` | INTEGER | Display order within the schema. Numbered in steps of 10 to leave room for insertions |

---

## How the schema activates

On form load, `getActiveSchemaVersion(today)` runs:

```sql
SELECT id, effective_from, note
FROM form_schema_version
WHERE effective_from <= ?
ORDER BY effective_from DESC
LIMIT 1
```

The result is the latest schema that has already come into effect. Defining a schema with `effective_from: 2026-01-01` means it silently takes over on January 1st with no code change required.

---

## Frecency scoring

Each `token_usage` row has a `used_at` timestamp. The score for a mapping is:

```
score = Σ  2^( -(now - used_at) / halfLifeMs )
```

Summed over all rows matching that mapping. A half-life of 7 days means a use from 7 days ago contributes half as much as a use today. The score is used to break ties within each autocomplete tier (raw bonus = `min(score × 10, 90)`, keeping it below the 100-point tier gap).

---

## Backup and sync

The `.db` file can be copied directly to sync between machines. Copy it to the same path (`C:\Users\sandr\OneDrive\Personal\Reflection\mappings.db`) and restart the dev server. The file is gitignored — only `schema.sql` (no personal data) is committed.
