CREATE TABLE IF NOT EXISTS mapping_type (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Seeded suggestion types (pattern-matchable via <exercise>, <game>, etc.)
INSERT OR IGNORE INTO mapping_type (id, name) VALUES
  ('exercise', 'Exercise'),
  ('game',     'Game'),
  ('music',    'Music'),
  ('phase',    'Phase');

CREATE TABLE IF NOT EXISTS list_values (
  id INTEGER PRIMARY KEY,
  value TEXT NOT NULL,
  type_id TEXT NOT NULL,
  abbreviation TEXT,             -- NULL = autocomplete only; set = also usable in patterns
  enabled INTEGER NOT NULL DEFAULT 1,
  UNIQUE(value, type_id),
  UNIQUE(abbreviation, type_id)  -- NULLs are distinct in SQLite, so multiple NULL abbrevs allowed
);

CREATE TABLE IF NOT EXISTS mapping_instance (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  expansion TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1   -- 0 = disabled (skipped by pattern matcher)
);

-- One row per token use; no foreign keys so records survive mapping edits/deletes
CREATE TABLE IF NOT EXISTS token_usage (
  id           INTEGER PRIMARY KEY,
  raw_input    TEXT NOT NULL,       -- what the user typed (e.g. 'dt')
  mapping_name TEXT,                -- NULL when no mapping fired
  expansion    TEXT NOT NULL,       -- what it expanded to (same as raw_input when no mapping)
  used_at      TEXT NOT NULL        -- ISO 8601 timestamp
);

-- Key/value store for user-configurable settings
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('frecency_halflife_days',   '7'),
  ('suggestion_threshold',     '3'),
  ('suggestion_min_length',    '4'),
  ('token_usage_max_rows',     '10000'),
  ('autocomplete_max_results', '5'),
  ('autocomplete_debounce_ms', '80');

CREATE TABLE IF NOT EXISTS form_history (
  date      TEXT PRIMARY KEY,  -- YYYY-MM-DD; UPSERT key so one row per day
  bathe     TEXT,
  wake      TEXT,
  sleep     TEXT,
  nap       TEXT,
  worked    TEXT,
  stress    TEXT,
  tired     TEXT,
  game      TEXT,
  music     TEXT,
  grateful  TEXT,              -- comma-separated
  learn     TEXT,              -- comma-separated
  exercise  TEXT,
  remember  TEXT,
  day_rating TEXT,
  feeling   TEXT,
  why       TEXT,
  phase     TEXT,              -- comma-separated
  time      TEXT,
  happened  TEXT,
  day_name  TEXT,
  output    TEXT,              -- the full tab-separated clipboard string
  saved_at  TEXT               -- ISO 8601 timestamp of last save
);
