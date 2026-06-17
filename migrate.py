#!/usr/bin/env python3
"""
Migrate TypeScript asset files into mappings.db.

Usage:
    python migrate.py [project_root]

If project_root is omitted the current directory is used.
Run after starting the dev server at least once so that mappings.db exists.
"""

import re
import sqlite3
import sys
from pathlib import Path


# ── Parsers ──────────────────────────────────────────────────────────────────

def unescape_ts_string(s: str) -> str:
    """Undo the most common TypeScript/JSON string escapes."""
    return (
        s.replace('\\"', '"')
         .replace("\\'", "'")
         .replace('\\\\', '\\')
         .replace('\\n', '\n')
         .replace('\\t', '\t')
         .replace('\\r', '\r')
    )


def parse_kv_pairs(text: str) -> list[tuple[str, str]]:
    """
    Parse { key: "...", value: "..." } objects from a TypeScript ref([...]) file.
    Handles escaped characters inside the strings.
    """
    pattern = re.compile(
        r'\{\s*key:\s*"((?:[^"\\]|\\.)*)"\s*,\s*value:\s*"((?:[^"\\]|\\.)*)"\s*\}',
        re.DOTALL,
    )
    return [
        (unescape_ts_string(m.group(1)), unescape_ts_string(m.group(2)))
        for m in pattern.finditer(text)
    ]


def parse_string_array(text: str) -> list[str]:
    """
    Parse a TypeScript exported string array  export const x = [...];
    Returns all non-empty string values found inside the array literal.
    """
    # Grab everything between the first [ and the closing ];
    body_match = re.search(r'\[\s*(.*?)\s*\];', text, re.DOTALL)
    if not body_match:
        return []

    body = body_match.group(1)

    # Match all quoted strings, respecting escaped quotes
    results = []
    for m in re.finditer(r'"((?:[^"\\]|\\.)*)"', body):
        value = unescape_ts_string(m.group(1)).strip()
        if value:
            results.append(value)

    return results


# ── Migration steps ───────────────────────────────────────────────────────────

def _fix_corrupt_mappings(cur: sqlite3.Cursor) -> None:
    """Remove mapping_instance rows where expansion == name (clearly invalid test data)."""
    cur.execute("DELETE FROM mapping_instance WHERE name = expansion")
    if cur.rowcount:
        print(f"  Removed {cur.rowcount} corrupt mapping_instance row(s) (name == expansion)")


def migrate_mappings(cur: sqlite3.Cursor, assets: Path) -> None:
    path = assets / "mappings.ts"
    if not path.exists():
        print("  SKIP  mappings.ts not found")
        return

    pairs = parse_kv_pairs(path.read_text(encoding="utf-8"))
    inserted = 0
    for name, expansion in pairs:
        cur.execute(
            "INSERT OR IGNORE INTO mapping_instance (name, expansion, implicit_add_base) VALUES (?, ?, 0)",
            (name, expansion),
        )
        inserted += cur.rowcount

    skipped = len(pairs) - inserted
    print(f"  mapping_instance : {inserted:>4} inserted, {skipped} skipped (already existed)")


def migrate_name_mappings(cur: sqlite3.Cursor, assets: Path) -> None:
    path = assets / "nameMappings.ts"
    if not path.exists():
        print("  SKIP  nameMappings.ts not found")
        return

    # Ensure the 'person' mapping type exists
    cur.execute("INSERT OR IGNORE INTO mapping_type (id, name) VALUES ('p', 'person')")

    pairs = parse_kv_pairs(path.read_text(encoding="utf-8"))
    inserted = 0
    for abbreviation, value in pairs:
        cur.execute(
            "INSERT OR IGNORE INTO list_value (abbreviation, value, type_id) VALUES (?, ?, 'p')",
            (abbreviation, value),
        )
        inserted += cur.rowcount

    skipped = len(pairs) - inserted
    print(f"  list_value (p)   : {inserted:>4} inserted, {skipped} skipped")


def migrate_suggestions(cur: sqlite3.Cursor, assets: Path) -> None:
    files = {
        "exercise": "exerciseSuggestions.ts",
        "music":    "musicSuggestions.ts",
        "game":     "gameSuggestions.ts",
        "phase":    "phaseSuggestions.ts",
    }

    for field, filename in files.items():
        path = assets / filename
        if not path.exists():
            print(f"  SKIP  {filename} not found")
            continue

        values = parse_string_array(path.read_text(encoding="utf-8"))
        inserted = 0
        for value in values:
            cur.execute(
                "INSERT OR IGNORE INTO suggestion (field, value) VALUES (?, ?)",
                (field, value),
            )
            inserted += cur.rowcount

        skipped = len(values) - inserted
        print(f"  suggestion({field:<8}) : {inserted:>4} inserted, {skipped} skipped")


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
    db_path = root / "mappings.db"
    assets  = root / "src" / "assets"

    if not db_path.exists():
        sys.exit(
            f"Error: {db_path} not found.\n"
            "Start the dev server at least once first so the database is created."
        )

    if not assets.is_dir():
        sys.exit(f"Error: assets directory not found at {assets}")

    print(f"Database : {db_path.resolve()}")
    print(f"Assets   : {assets.resolve()}")
    print()

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Ensure the suggestion table exists even if the server hasn't applied the
    # updated schema yet (idempotent — safe to run before restarting the server).
    cur.execute("""
        CREATE TABLE IF NOT EXISTS suggestion (
            id    INTEGER PRIMARY KEY,
            field TEXT NOT NULL,
            value TEXT NOT NULL,
            UNIQUE(field, value)
        )
    """)

    _fix_corrupt_mappings(cur)
    migrate_mappings(cur, assets)
    migrate_name_mappings(cur, assets)
    migrate_suggestions(cur, assets)

    conn.commit()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
