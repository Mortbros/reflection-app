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
