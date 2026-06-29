# Form Schema Guide

This guide explains how to define the reflection form for a new year using YAML.

---

## How it works

Each year can have its own form layout declared as a YAML schema. The form automatically switches to the schema whose `effective_from` date is the latest date that is still on or before today. This means you can define next year's form now and it will activate on 1 January without any code changes.

Schemas are managed in **Settings → Schema**.

---

## YAML format

```yaml
effective_from: '2026-01-01'
note: '2026 reflection'
fields:
  - key: date
    label: Date
    type: date

  - key: bathe
    label: Bathe
    type: yes_no
    required: true
    row_group: 1

  - key: wake
    label: Wake
    type: time
    required: true
    row_group: 1

  - key: sleep
    label: Sleep
    type: time
    required: true
    row_group: 1
    config:
      defaultToFuture: true
      futureMinutes: 25
```

### Top-level fields

| Field | Required | Description |
|---|---|---|
| `effective_from` | Yes | ISO date (`YYYY-MM-DD`). The form uses this schema from this date onwards. |
| `note` | No | Human-readable label shown in the schema list. |
| `fields` | Yes | Ordered list of field definitions. |

### Per-field properties

| Property | Required | Description |
|---|---|---|
| `key` | Yes | Internal identifier, stored in the response JSON. Must be unique within a schema. |
| `label` | Yes | Text shown on the form label. |
| `type` | Yes | Field type (see table below). |
| `required` | No | If `true`, the form shows a validation error until the field has a value. Defaults to `false`. |
| `row_group` | No | Integer. Fields with the same `row_group` number are placed side-by-side on one row. Fields with no `row_group` take a full row each. |
| `config` | No | Type-specific configuration (see per-type config below). |

---

## Field types

### `date`

A date picker. No config options. Always rendered with a *Today* button.

```yaml
- key: date
  label: Date
  type: date
```

---

### `yes_no`

A Yes/No toggle. Default value is `N`.

```yaml
- key: bathe
  label: Bathe
  type: yes_no
  required: true
```

---

### `time`

A time input (`HH:MM`).

| Config key | Type | Description |
|---|---|---|
| `defaultToFuture` | boolean | If true, the field defaults to a time in the future. |
| `futureMinutes` | number | How many minutes in the future (default 25). Only relevant when `defaultToFuture` is true. |

```yaml
- key: sleep
  label: Sleep
  type: time
  required: true
  config:
    defaultToFuture: true
    futureMinutes: 25
```

---

### `float`

A decimal number input.

| Config key | Type | Description |
|---|---|---|
| `max` | number | Maximum allowed value. |

```yaml
- key: stress
  label: Stress
  type: float
  required: true
  config:
    max: 10
```

---

### `int`

An integer number input.

| Config key | Type | Description |
|---|---|---|
| `max` | number | Maximum allowed value. |

```yaml
- key: feeling
  label: Feeling
  type: int
  required: true
  config:
    max: 100
```

---

### `string`

A single-line text field.

```yaml
- key: why
  label: Why
  type: string
  required: true
```

---

### `list`

A plain text field for freeform comma-separated values (e.g. Grateful, Learn). Type values separated by `, ` (comma-space) — they are stored and output as an array. No autocomplete dropdown.

```yaml
- key: grateful
  label: Grateful
  type: list
  required: true
```

---

### `autocomplete_list`

A chip-based multi-value field with autocomplete suggestions drawn from a `list_values` type. Past-submitted values are automatically saved back to the list.

**Interaction:**
- Type to filter suggestions; **Enter** always picks the top matching suggestion.
- **`, ` (comma-space)** adds the literally-typed text as a chip (the only way to add free text not in the suggestion list).
- **Backspace** on an empty input removes the last chip.
- Tab/Enter on an empty field advances to the next field.

**Empty-value behaviour:** if `emptyValue` is set, the field is displayed empty (no chip shown). When the form is copied to clipboard, an empty field outputs `emptyValue` instead of a blank. This replaces the older `defaultN: true` flag (which is still accepted for backward compatibility).

| Config key | Type | Description |
|---|---|---|
| `listTypeId` | string | The `id` of the mapping_type to pull suggestions from (e.g. `"game"`, `"music"`). |
| `emptyValue` | string | Value written to clipboard output when the field has no selection (e.g. `"N"`). Field stays blank in the UI. |
| `autoSelect` | boolean | If false, the field does not auto-select its contents on focus. Default true. |

```yaml
- key: game
  label: Game
  type: autocomplete_list
  config:
    listTypeId: game
    emptyValue: "N"

- key: phase
  label: Phase
  type: autocomplete_list
  required: true
  config:
    listTypeId: phase
    autoSelect: false
```

---

### `shortcode_text`

A textarea that expands shortcode mappings as you type (space-press) and shows an autocomplete dropdown. This is the main "Happened" field.

| Config key | Type | Description |
|---|---|---|
| `group` | string | Which mapping group to use. Mappings with `grp = 'all'` appear in every field regardless. Default: `"main"`. |

```yaml
- key: happened
  label: Happened
  type: shortcode_text
  required: true
  config:
    group: main
```

To use a different mapping set for a work-focused form:

```yaml
- key: happened
  label: Happened
  type: shortcode_text
  required: true
  config:
    group: work
```

Mappings are tagged with a group in **Settings → Mappings**. Mappings tagged `all` appear in every `shortcode_text` field.

---

### `time_display`

A read-only clock display. Not included in the clipboard output. No config.

```yaml
- key: time
  label: Time
  type: time_display
```

---

## Row grouping

Fields with the same `row_group` number share a horizontal row, divided equally. Fields without a `row_group` take their own full-width row.

```yaml
# bathe, wake, sleep appear side-by-side
- key: bathe
  label: Bathe
  type: yes_no
  row_group: 1

- key: wake
  label: Wake
  type: time
  row_group: 1

- key: sleep
  label: Sleep
  type: time
  row_group: 1
```

Row group numbers only need to be consistent within a schema — they don't have to be sequential.

---

## Clipboard output

The form copies a tab-separated line to the clipboard. Fields appear in the order they are listed in the schema, except that `happened` and `time_display` are swapped in output order (happened outputs before time regardless of schema order). `time_display` is included in the output. Multi-value fields (`list`, `autocomplete_list`) are joined with `, `. If `emptyValue` is set on an `autocomplete_list` field, an empty selection outputs that value instead of blank.

---

## Changing the form for a new year

1. Open **Settings → Schema**
2. Click **New version**
3. Edit the YAML — change `effective_from` to `YYYY-01-01` for the new year
4. Add, remove, or reorder fields as needed
5. Click **Apply**

The existing 2025 schema stays unchanged. On January 1st the new schema activates automatically. Form history from 2025 is unaffected.

---

## Mapping groups

When you add a new `shortcode_text` field with a different `group`, you also need to tag mappings for that group in **Settings → Mappings**. Mappings tagged `all` appear in all groups.

Example: create a `work` group:
1. Add or edit mappings, setting their group to `work` for work-specific shortcuts
2. Tag shared shortcuts (like common phrases) as `all`
3. In your schema, set `config.group: work` on the shortcode field
