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
  UNIQUE(value, type_id),
  UNIQUE(abbreviation, type_id)  -- NULLs are distinct in SQLite, so multiple NULL abbrevs allowed
);

CREATE TABLE IF NOT EXISTS mapping_instance (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  expansion TEXT NOT NULL
);

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
