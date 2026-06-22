<script setup lang="ts">
import { ref, watch, computed, onMounted, useTemplateRef, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import {
  VContainer, VCard, VCardText, VTabs, VTab, VTabsWindow, VTabsWindowItem,
  VDataTable, VBtn, VDialog, VTextField, VCheckbox, VSelect, VSnackbar, VAlert, VFileInput,
  VChip, VDivider, VProgressLinear,
} from 'vuetify/components';
import {
  getMappingInstances, insertMappingInstance, updateMappingInstance, deleteMappingInstance,
  setMappingInstanceEnabled, importMappingInstance, importListValue, importMappingType,
  getListValues, insertListValue, updateListValue, deleteListValue, setListValueEnabled,
  getMappingTypes, insertMappingType, updateMappingType, deleteMappingType,
  countMappingsUsingType, renameMappingTypeId,
  getFormHistory, deleteFormHistoryRow,
  getFormHistoryHappenedTexts, getAllAppSettings, setAppSetting,
} from '@/lib/db';
import type { MappingInstance, ListValue, MappingType, FormHistoryRow } from '@/lib/db';
import { findAllMatches, expandToken } from '@/lib/patternMatcher';

type Focusable = { focus(): void }

type TableHeader = {
  title: string
  key: string
  width?: string
  sortable?: boolean
  align?: 'start' | 'center' | 'end'
}

const router = useRouter();

const tab = ref('mappings');
const snackbar = ref(false);
const snackbarText = ref('');

// ── Global loading indicator ───────────────────────────────────────────────────
const loadingCount = ref(0);
const loading = computed(() => loadingCount.value > 0);
async function withLoading<T>(fn: () => Promise<T>): Promise<T> {
  loadingCount.value++;
  try { return await fn(); }
  finally { loadingCount.value--; }
}

const mappings = ref<MappingInstance[]>([]);
const listValues = ref<ListValue[]>([]);
const mappingTypes = ref<MappingType[]>([]);

const refresh = () => withLoading(async () => {
  [mappings.value, listValues.value, mappingTypes.value] = await Promise.all([
    getMappingInstances(),
    getListValues(),
    getMappingTypes(),
  ]);
});

const notify = (msg: string) => { snackbarText.value = msg; snackbar.value = true; };

onMounted(refresh);

// ── Search ────────────────────────────────────────────────────────────────────

const mappingSearch = ref('');
const listValueSearch = ref('');
const typeSearch = ref('');

// ── Mapping instances ─────────────────────────────────────────────────────────

function extractTypeSlots(str: string): { typeId: string; multiple: boolean }[] {
  const result: { typeId: string; multiple: boolean }[] = [];
  const re = /<([a-zA-Z][a-zA-Z0-9]*)(,?)>/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    result.push({ typeId: m[1], multiple: m[2] === ',' });
  }
  return result;
}

const mappingDialog = ref(false);
const mappingForm = ref<{ id: number | null; name: string; expansion: string; addBase: boolean }>({
  id: null, name: '', expansion: '', addBase: false,
});

const mappingNameRef = useTemplateRef<Focusable>('mappingNameRef');
const mappingExpansionRef = useTemplateRef<Focusable>('mappingExpansionRef');

// Only flag/fill types that exist in the DB — ignores partial typing like <perso
const validTypeIdSet = computed(() => new Set(mappingTypes.value.map(t => t.id)));

// Highlight expansion field red if any *valid* type from the name is absent in the expansion
const missingExpansionTypes = computed(() => {
  const uniqueTypes = [...new Set(extractTypeSlots(mappingForm.value.name).map(s => s.typeId))];
  return uniqueTypes.filter(typeId =>
    validTypeIdSet.value.has(typeId) &&
    !new RegExp(`<${typeId},?>`).test(mappingForm.value.expansion)
  );
});

const copyNameToExpansion = () => {
  mappingForm.value.expansion = mappingForm.value.name;
};

const openAddMapping = () => {
  mappingForm.value = { id: null, name: '', expansion: '', addBase: false };
  mappingDialog.value = true;
};

const openEditMapping = (row: MappingInstance) => {
  mappingForm.value = { id: row.id, name: row.name, expansion: row.expansion, addBase: false };
  mappingDialog.value = true;
};

const saveMapping = async () => {
  const { id, name, expansion, addBase } = mappingForm.value;
  if (!name.trim() || !expansion.trim()) return;
  if (id === null) {
    await insertMappingInstance(name.trim(), expansion.trim());
    if (addBase) {
      const baseName = name.trim().replace(/<[^>]*>/g, '').trim();
      const baseExpansion = expansion.trim().replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (baseName && baseName !== name.trim() && baseExpansion) {
        await insertMappingInstance(baseName, baseExpansion).catch(() => { });
      }
    }
  } else {
    await updateMappingInstance(id, name.trim(), expansion.trim());
  }
  mappingDialog.value = false;
  await refresh();
  notify('Saved');
};

const deleteMapping = async (id: number) => {
  await deleteMappingInstance(id);
  await refresh();
  notify('Deleted');
};

const toggleMapping = async (id: number, enabled: boolean) => {
  await setMappingInstanceEnabled(id, enabled);
  await refresh();
};

const mappingHeaders: TableHeader[] = [
  { title: '', key: 'enabled', width: '44px', sortable: false },
  { title: 'Name', key: 'name', width: '38%' },
  { title: 'Expansion', key: 'expansion' },
  { title: '', key: 'actions', sortable: false, align: 'end', width: '48px' },
];

// ── List values ───────────────────────────────────────────────────────────────

const listValueTypeTab = ref('');

// When types load, default to first type
watch(mappingTypes, (types) => {
  if (types.length && !listValueTypeTab.value) {
    listValueTypeTab.value = types[0].id;
  }
}, { immediate: true });

const filteredListValues = computed(() =>
  listValueTypeTab.value
    ? listValues.value.filter(v => v.type_id === listValueTypeTab.value)
    : listValues.value
);

function generateAbbreviation(value: string, typeId: string, excludeId: number | null): string {
  const taken = new Set(
    listValues.value
      .filter(v => v.type_id === typeId && v.id !== excludeId)
      .map(v => v.abbreviation?.toLowerCase())
      .filter(Boolean)
  );
  const words = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const chars = words.map(w => w.replace(/[^a-z0-9]/g, '')).join('');
  const initials = words.map(w => w[0] ?? '').join('');
  if (!taken.has(initials)) return initials;
  for (let budget = 2; budget <= Math.min(chars.length, 8); budget++) {
    let candidate = '';
    let remaining = budget;
    for (const word of words) {
      const take = Math.ceil(remaining / (words.length - words.indexOf(word)));
      candidate += word.slice(0, take);
      remaining -= take;
      if (remaining <= 0) break;
    }
    candidate = candidate.slice(0, budget);
    if (!taken.has(candidate)) return candidate;
  }
  for (let i = 2; i < 100; i++) {
    const candidate = initials + i;
    if (!taken.has(candidate)) return candidate;
  }
  return initials;
}

interface ListValueForm {
  id: number | null;
  abbreviation: string;
  value: string;
  type_id: string;
  abbrevAutoGenerated: boolean;
}

const listValueDialog = ref(false);
const listValueForm = ref<ListValueForm>({
  id: null, abbreviation: '', value: '', type_id: '', abbrevAutoGenerated: true,
});

const listValueRef = useTemplateRef<Focusable>('listValueRef');
const listAbbrevRef = useTemplateRef<Focusable>('listAbbrevRef');

const abbrevTaken = computed(() => {
  const { abbreviation, type_id, id } = listValueForm.value;
  if (!abbreviation || !type_id) return false;
  return listValues.value.some(
    v => v.type_id === type_id
      && v.abbreviation?.toLowerCase() === abbreviation.toLowerCase()
      && v.id !== id
  );
});

watch(() => listValueForm.value.value, (val) => {
  if (listValueForm.value.abbrevAutoGenerated)
    listValueForm.value.abbreviation = generateAbbreviation(val, listValueForm.value.type_id, listValueForm.value.id);
});
watch(() => listValueForm.value.type_id, () => {
  if (listValueForm.value.abbrevAutoGenerated)
    listValueForm.value.abbreviation = generateAbbreviation(
      listValueForm.value.value, listValueForm.value.type_id, listValueForm.value.id
    );
});

const regenerateAbbrev = () => {
  listValueForm.value.abbreviation = generateAbbreviation(
    listValueForm.value.value, listValueForm.value.type_id, listValueForm.value.id
  );
  listValueForm.value.abbrevAutoGenerated = true;
};

const onAbbrevInput = () => { listValueForm.value.abbrevAutoGenerated = false; };

// Pre-fill type from active sub-tab when opening Add dialog
const openAddListValue = () => {
  listValueForm.value = {
    id: null, abbreviation: '', value: '',
    type_id: listValueTypeTab.value,
    abbrevAutoGenerated: true,
  };
  listValueDialog.value = true;
};

const openEditListValue = (row: ListValue) => {
  listValueForm.value = {
    id: row.id,
    abbreviation: row.abbreviation ?? '',
    value: row.value,
    type_id: row.type_id,
    abbrevAutoGenerated: false,
  };
  listValueDialog.value = true;
};

const saveListValue = async () => {
  const { id, abbreviation, value, type_id } = listValueForm.value;
  if (!value.trim() || abbrevTaken.value) return;
  const abbrev = abbreviation.trim() || undefined;
  if (id === null) {
    await insertListValue(value.trim(), type_id.trim(), abbrev);
  } else {
    await updateListValue(id, value.trim(), type_id.trim(), abbrev);
  }
  listValueDialog.value = false;
  await refresh();
  notify('Saved');
};

const deleteListVal = async (id: number) => {
  await deleteListValue(id);
  await refresh();
  notify('Deleted');
};

const toggleListValue = async (id: number, enabled: boolean) => {
  await setListValueEnabled(id, enabled);
  await refresh();
};

// Columns shown depend on whether the active type uses abbreviations
const activeTypeHasAbbrevs = computed(() =>
  filteredListValues.value.some(v => v.abbreviation !== null)
);

const listValueHeaders = computed((): TableHeader[] => {
  const cols: TableHeader[] = [
    { title: '', key: 'enabled', width: '44px', sortable: false },
    { title: 'Value', key: 'value' },
  ];
  if (activeTypeHasAbbrevs.value)
    cols.push({ title: 'Abbrev.', key: 'abbreviation', width: '110px' });
  cols.push({ title: '', key: 'actions', sortable: false, align: 'end', width: '48px' });
  return cols;
});

// ── Mapping types ─────────────────────────────────────────────────────────────

const typeDialog = ref(false);
const typeForm = ref<{ id: string; name: string; isEdit: boolean; originalId: string }>({
  id: '', name: '', isEdit: false, originalId: '',
});
const mappingRefCount = ref(0);
const updateMappingRefs = ref(true);

const typeIdRef = useTemplateRef<Focusable>('typeIdRef');
const typeNameRef = useTemplateRef<Focusable>('typeNameRef');

const typeIdChanged = computed(() =>
  typeForm.value.isEdit && typeForm.value.id.trim() !== typeForm.value.originalId
);

const openAddType = () => {
  typeForm.value = { id: '', name: '', isEdit: false, originalId: '' };
  typeDialog.value = true;
};

const openEditType = async (row: MappingType) => {
  typeForm.value = { id: row.id, name: row.name, isEdit: true, originalId: row.id };
  mappingRefCount.value = await countMappingsUsingType(row.id);
  updateMappingRefs.value = mappingRefCount.value > 0;
  typeDialog.value = true;
};

const saveType = async () => {
  const { id, name, isEdit, originalId } = typeForm.value;
  if (!id.trim() || !name.trim()) return;
  if (isEdit) {
    if (typeIdChanged.value) {
      await renameMappingTypeId(originalId, id.trim(), updateMappingRefs.value);
    }
    await updateMappingType(id.trim(), name.trim());
  } else {
    await insertMappingType(id.trim(), name.trim());
  }
  typeDialog.value = false;
  await refresh();
  notify('Saved');
};

const deleteType = async (id: string) => { await deleteMappingType(id); await refresh(); notify('Deleted'); };

const typeHeaders: TableHeader[] = [
  { title: 'ID', key: 'id', width: '160px' },
  { title: 'Name', key: 'name' },
  { title: '', key: 'actions', sortable: false, align: 'end', width: '48px' },
];

// ── CSV import ────────────────────────────────────────────────────────────────

type ImportTarget = 'mappings' | 'listValues' | 'types'

const importDialog = ref(false);
const importTarget = ref<ImportTarget>('mappings');
const importParsedRows = ref<Record<string, string>[]>([]);
const importLoading = ref(false);

const IMPORT_META: Record<ImportTarget, { label: string; filename: string; example: string }> = {
  mappings: {
    label: 'Mappings',
    filename: 'example_mappings.csv',
    example: [
      'name,expansion',
      '"tt<person,>","talked to <person>"',
      '"tt<person>","talked to <person>"',
      'gym,Went to the gym',
    ].join('\n'),
  },
  listValues: {
    label: 'List Values',
    filename: 'example_list_values.csv',
    example: [
      'value,type_id,abbreviation',
      'Lisa,person,li',
      'Mum,person,mu',
      'Dad,person,d',
      'Supermarket,place,sup',
    ].join('\n'),
  },
  types: {
    label: 'Types',
    filename: 'example_types.csv',
    example: [
      'id,name',
      'person,Person',
      'place,Place',
      'transport,Mode of transport',
    ].join('\n'),
  },
};

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]));
  });
}

const onImportFileChange = (file: File | File[] | null) => {
  const f = Array.isArray(file) ? file[0] : file;
  if (!f) { importParsedRows.value = []; return; }
  const reader = new FileReader();
  reader.onload = (e) => { importParsedRows.value = parseCsv(e.target?.result as string); };
  reader.readAsText(f);
};

const downloadExampleCsv = () => {
  const { filename, example } = IMPORT_META[importTarget.value];
  const blob = new Blob([example], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const openImport = (target: ImportTarget) => {
  importTarget.value = target;
  importParsedRows.value = [];
  importDialog.value = true;
};

const runImport = async () => {
  importLoading.value = true;
  let imported = 0, skipped = 0;
  for (const row of importParsedRows.value) {
    try {
      if (importTarget.value === 'mappings') {
        if (!row.name || !row.expansion) { skipped++; continue; }
        await importMappingInstance(row.name, row.expansion); imported++;
      } else if (importTarget.value === 'listValues') {
        if (!row.value || !row.type_id) { skipped++; continue; }
        await importListValue(row.value, row.type_id, row.abbreviation || undefined); imported++;
      } else {
        if (!row.id || !row.name) { skipped++; continue; }
        await importMappingType(row.id, row.name); imported++;
      }
    } catch { skipped++; }
  }
  importLoading.value = false;
  importDialog.value = false;
  await refresh();
  notify(`Imported ${imported}${skipped ? `, skipped ${skipped}` : ''}`);
};

// ── Form history ──────────────────────────────────────────────────────────────

const FORM_STORAGE_KEY = 'daily_tracking_form_data';

const history = ref<FormHistoryRow[]>([]);
const historySearch = ref('');

const loadHistory = async () => { history.value = await withLoading(getFormHistory); };

const historyViewItem = ref<FormHistoryRow | null>(null);
const historyViewDialog = ref(false);
const openHistoryView = (row: FormHistoryRow) => { historyViewItem.value = row; historyViewDialog.value = true; };

// Load history when its tab is first activated
watch(tab, (t) => { if (t === 'history' && !history.value.length) loadHistory(); });

const historyHeaders: TableHeader[] = [
  { title: 'Date', key: 'date', width: '120px' },
  { title: 'Rating', key: 'day_rating', width: '80px' },
  { title: 'Exercise', key: 'exercise', width: '160px' },
  { title: 'Happened', key: 'happened' },
  { title: '', key: 'actions', sortable: false, align: 'end', width: '96px' },
];

const restoreToForm = (row: FormHistoryRow) => {
  const formData = {
    date: row.date,
    bathe: row.bathe,
    wake: row.wake,
    sleep: row.sleep,
    nap: parseFloat(row.nap) || 0,
    worked: parseFloat(row.worked) || 0,
    stress: parseFloat(row.stress) || 0,
    tired: parseFloat(row.tired) || 0,
    game: row.game,
    music: row.music,
    grateful: row.grateful ? row.grateful.split(', ').filter(Boolean) : [],
    learn: row.learn ? row.learn.split(', ').filter(Boolean) : [],
    exercise: row.exercise,
    remember: parseFloat(row.remember) || 0,
    dayRating: parseFloat(row.day_rating) || 0,
    feeling: parseInt(row.feeling) || 0,
    why: row.why,
    phase: row.phase ? row.phase.split(', ').filter(Boolean) : [],
    time: row.time,
    happened: row.happened,
    dayName: row.day_name,
  };
  localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(formData));
  router.push('/');
};

const copyHistoryRow = async (row: FormHistoryRow) => {
  if (!row.output) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(row.output);
    } else {
      const ta = document.createElement('textarea');
      ta.value = row.output;
      Object.assign(ta.style, { position: 'fixed', left: '-999999px', top: '-999999px' });
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    notify('Copied!');
  } catch { notify('Copy failed'); }
};

const deleteHistory = async (date: string) => {
  await deleteFormHistoryRow(date);
  await loadHistory();
  notify('Deleted');
};

// ── Suggestions (unmapped frequent tokens) ────────────────────────────────────

const suggestions = ref<{ raw_input: string; count: number }[]>([]);
const suggestionsLoaded = ref(false);

const appSettings = ref<Record<string, string>>({});
const loadAppSettings = async () => {
  appSettings.value = await withLoading(getAllAppSettings);
};

/**
 * Analyses form_history.happened to find sentences that appear frequently
 * across past submissions. These are good candidates for new shortcut mappings.
 */
const loadSuggestions = async () => {
  const threshold = parseInt(appSettings.value.suggestion_threshold ?? '3') || 3;
  const minLen = parseInt(appSettings.value.suggestion_min_length ?? '10') || 10;
  const happened = await withLoading(getFormHistoryHappenedTexts);
  const counts = new Map<string, number>();
  for (const text of happened) {
    // Split into sentences on . ! ? followed by optional whitespace
    const sentences = text.split(/[.!?]+\s*/).map(s => s.trim()).filter(s => s.length >= minLen);
    for (const sentence of sentences) {
      counts.set(sentence, (counts.get(sentence) ?? 0) + 1);
    }
  }
  suggestions.value = [...counts.entries()]
    .filter(([, c]) => c >= threshold)
    .map(([raw_input, count]) => ({ raw_input, count }))
    .sort((a, b) => b.count - a.count);
  suggestionsLoaded.value = true;
};

const settingKeys = [
  { key: 'frecency_halflife_days',   label: 'Frecency half-life (days)',      hint: 'Score halves every N days. Lower = recency matters more.' },
  { key: 'suggestion_threshold',     label: 'Suggestion threshold (uses)',     hint: 'Minimum times an unmapped phrase must appear before it shows here.' },
  { key: 'suggestion_min_length',    label: 'Min sentence length for suggestions', hint: 'Sentences shorter than this many characters are not tracked as candidates.' },
  { key: 'token_usage_max_rows',     label: 'Max usage rows stored',           hint: 'Oldest rows pruned automatically when this limit is exceeded.' },
  { key: 'autocomplete_max_results', label: 'Autocomplete max results',        hint: 'Maximum suggestions shown in the dropdown.' },
] as const;

const saveSetting = async (key: string, value: string) => {
  await withLoading(() => setAppSetting(key, value));
  appSettings.value = { ...appSettings.value, [key]: value };
};

watch(tab, async (t) => {
  if (t === 'suggestions') {
    if (!Object.keys(appSettings.value).length) await loadAppSettings();
    await loadSuggestions();
  }
  if (t === 'appSettings' && !Object.keys(appSettings.value).length) await loadAppSettings();
});

// Pre-fill mapping dialog from a suggestion
const openAddMappingFromSuggestion = (sentence: string) => {
  // Sentence is the expansion text — leave the mapping name for the user to fill in
  mappingForm.value = { id: null, name: '', expansion: sentence, addBase: false };
  mappingDialog.value = true;
  tab.value = 'mappings';
};

// ── Conflicts ─────────────────────────────────────────────────────────────────

interface Conflict {
  input: string
  matches: { mapping: MappingInstance; expansion: string }[]
}

const conflicts = ref<Conflict[]>([]);
const ignoredConflicts = ref<Set<string>>(new Set());
const ignoreConflict = (input: string) => { ignoredConflicts.value = new Set([...ignoredConflicts.value, input]); };
const restoreConflict = (input: string) => { const s = new Set(ignoredConflicts.value); s.delete(input); ignoredConflicts.value = s; };
const conflictsLoaded = ref(false);

/**
 * Enumerates all concrete tokens that a pattern mapping name could match,
 * by substituting each type slot with every enabled list value abbreviation.
 * Treats <typeId,> (multiple) the same as <typeId> (single) for conflict purposes —
 * if a single-value expansion already conflicts, that is sufficient evidence.
 * Returns at most `cap` tokens to bound runtime on large datasets.
 */
const generatePatternTokens = (patternName: string, lvList: ListValue[], cap = 2000): string[] => {
  let candidates = [''];
  let remaining = patternName;

  while (remaining.length > 0) {
    const slotMatch = remaining.match(/^(.*?)<(\w+),?>(.*)/s);
    if (!slotMatch) {
      // Only literal text left — append to all candidates
      candidates = candidates.map(c => c + remaining);
      break;
    }
    const [, literalBefore, typeId, afterSlot] = slotMatch;
    const typeValues = lvList.filter(lv => lv.type_id === typeId && lv.enabled && lv.abbreviation);
    if (typeValues.length === 0) return []; // unresolvable slot

    const next: string[] = [];
    for (const prefix of candidates) {
      for (const lv of typeValues) {
        next.push(prefix + literalBefore + lv.abbreviation!);
        if (next.length >= cap) return next;
      }
    }
    candidates = next;
    remaining = afterSlot;
  }
  return candidates;
};

const computeConflicts = () => {
  const allListValues = listValues.value.filter(v => v.enabled && v.abbreviation);
  const enabledMappings = mappings.value.filter(m => m.enabled);
  const found: Conflict[] = [];
  const checkedTokens = new Set<string>();

  for (const m of enabledMappings) {
    const isLiteral = !m.name.includes('<') && !(m.name.startsWith('/') && m.name.lastIndexOf('/') > 0);
    const isPattern = m.name.includes('<');
    const tokens = isLiteral
      ? [m.name]
      : isPattern
        ? generatePatternTokens(m.name, allListValues)
        : []; // regex — skip enumeration

    for (const token of tokens) {
      if (checkedTokens.has(token)) continue;
      checkedTokens.add(token);
      const matches = findAllMatches(token, enabledMappings, allListValues);
      if (matches.length > 1) {
        found.push({ input: token, matches });
      }
    }
  }
  conflicts.value = found;
  conflictsLoaded.value = true;
};

// ── Test / Debugger ───────────────────────────────────────────────────────────

const testInput = ref('');
const testInputRef = useTemplateRef<Focusable>('testInputRef');

const testPatternMatches = computed(() => {
  const input = testInput.value.trim();
  if (!input) return [];
  const allListValues = listValues.value.filter(v => v.enabled);
  return findAllMatches(input, mappings.value, allListValues);
});

const testNameMatches = computed(() => {
  const input = testInput.value.trim();
  if (!input) return [];
  return mappings.value.filter(m => m.name.toLowerCase().includes(input.toLowerCase()));
});

watch(tab, async (t) => {
  if (t === 'test') {
    await nextTick();
    testInputRef.value?.focus();
  }
});
</script>

<template>
  <VContainer fluid class="pa-2 pa-sm-4 d-flex flex-column align-center">
    <div style="width: 100%; max-width: 960px;">

      <!-- Header -->
      <div class="d-flex align-center mb-3">
        <VBtn icon="mdi-arrow-left" variant="text" @click="router.push('/')" aria-label="Back" />
        <span class="text-h6 ml-2">Settings</span>
      </div>

      <VCard variant="outlined">
        <VProgressLinear v-if="loading" indeterminate color="primary" height="2" />
        <VTabs v-model="tab">
          <VTab value="mappings">Mappings</VTab>
          <VTab value="listValues">List Values</VTab>
          <VTab value="types">Types</VTab>
          <VTab value="history" @click="loadHistory">History</VTab>
          <div class="align-self-center mx-1" style="width:1px; height:20px; background: rgba(var(--v-border-color), var(--v-border-opacity))" />
          <VTab value="conflicts">Conflicts</VTab>
          <VTab value="test">Test</VTab>
          <VTab value="suggestions">Suggestions</VTab>
          <VTab value="appSettings">Frecency</VTab>
        </VTabs>

        <VCardText class="pa-2 pa-sm-3">
          <VTabsWindow v-model="tab">

            <!-- ── Mappings ───────────────────────────────────────────────── -->
            <VTabsWindowItem value="mappings">
              <div class="d-flex align-center ga-2 mb-2">
                <VBtn size="small" prepend-icon="mdi-plus" @click="openAddMapping">Add</VBtn>
                <VBtn size="small" prepend-icon="mdi-upload" variant="tonal" @click="openImport('mappings')">Import CSV
                </VBtn>
                <VTextField v-model="mappingSearch" density="compact" placeholder="Search…"
                  prepend-inner-icon="mdi-magnify" clearable hide-details class="flex-grow-1"
                  style="max-width: 320px" />
              </div>
              <VDataTable :headers="mappingHeaders" :items="mappings" :search="mappingSearch" density="compact"
                :items-per-page="-1" hover @click:row="(_: any, { item }: any) => openEditMapping(item)"
                style="cursor: pointer">
                <template #item.enabled="{ item }">
                  <VCheckbox :model-value="item.enabled" density="compact" hide-details @click.stop
                    @update:model-value="(v: boolean) => toggleMapping(item.id, v)" />
                </template>
                <template #item.actions="{ item }">
                  <VBtn icon="mdi-delete" size="x-small" variant="text" color="error"
                    @click.stop="deleteMapping(item.id)" />
                </template>
                <template #bottom />
              </VDataTable>
            </VTabsWindowItem>

            <!-- ── List Values ────────────────────────────────────────────── -->
            <VTabsWindowItem value="listValues">
              <!-- Type sub-tabs -->
              <VTabs v-model="listValueTypeTab" density="compact" class="mb-1">
                <VTab v-for="type in mappingTypes" :key="type.id" :value="type.id">
                  {{ type.name }}
                </VTab>
              </VTabs>

              <div class="d-flex align-center ga-2 mb-2">
                <VBtn size="small" prepend-icon="mdi-plus" @click="openAddListValue">Add</VBtn>
                <VBtn size="small" prepend-icon="mdi-upload" variant="tonal" @click="openImport('listValues')">Import
                  CSV</VBtn>
                <VTextField v-model="listValueSearch" density="compact" placeholder="Search…"
                  prepend-inner-icon="mdi-magnify" clearable hide-details class="flex-grow-1"
                  style="max-width: 320px" />
              </div>

              <VDataTable :headers="listValueHeaders" :items="filteredListValues" :search="listValueSearch"
                density="compact" :items-per-page="-1" hover
                @click:row="(_: any, { item }: any) => openEditListValue(item)" style="cursor: pointer">
                <template #item.enabled="{ item }">
                  <VCheckbox
                    :model-value="item.enabled"
                    density="compact" hide-details
                    @click.stop
                    @update:model-value="(v: boolean) => toggleListValue(item.id, v)"
                  />
                </template>
                <template #item.abbreviation="{ item }">
                  <span v-if="item.abbreviation" class="font-weight-medium">{{ item.abbreviation }}</span>
                  <span v-else class="text-disabled text-caption">—</span>
                </template>
                <template #item.actions="{ item }">
                  <VBtn icon="mdi-delete" size="x-small" variant="text" color="error"
                    @click.stop="deleteListVal(item.id)" />
                </template>
                <template #bottom />
              </VDataTable>
            </VTabsWindowItem>

            <!-- ── Types ─────────────────────────────────────────────────── -->
            <VTabsWindowItem value="types">
              <div class="d-flex align-center ga-2 mb-2">
                <VBtn size="small" prepend-icon="mdi-plus" @click="openAddType">Add</VBtn>
                <VBtn size="small" prepend-icon="mdi-upload" variant="tonal" @click="openImport('types')">Import CSV
                </VBtn>
                <VTextField v-model="typeSearch" density="compact" placeholder="Search…"
                  prepend-inner-icon="mdi-magnify" clearable hide-details class="flex-grow-1"
                  style="max-width: 320px" />
              </div>
              <VDataTable :headers="typeHeaders" :items="mappingTypes" :search="typeSearch" density="compact"
                :items-per-page="-1" hover @click:row="(_: any, { item }: any) => openEditType(item)"
                style="cursor: pointer">
                <template #item.actions="{ item }">
                  <VBtn icon="mdi-delete" size="x-small" variant="text" color="error"
                    @click.stop="deleteType(item.id)" />
                </template>
                <template #bottom />
              </VDataTable>
            </VTabsWindowItem>

            <!-- ── History ────────────────────────────────────────────────── -->
            <VTabsWindowItem value="history">
              <div class="d-flex align-center ga-2 mb-2">
                <VTextField v-model="historySearch" density="compact" placeholder="Search…"
                  prepend-inner-icon="mdi-magnify" clearable hide-details class="flex-grow-1"
                  style="max-width: 320px" />
              </div>
              <VDataTable :headers="historyHeaders" :items="history" :search="historySearch" density="compact"
                :items-per-page="-1" hover @click:row="(_: any, { item }: any) => openHistoryView(item)"
                style="cursor: pointer">
                <template #item.happened="{ item }">
                  <span :title="item.happened"
                    style="display: block; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    {{ item.happened }}
                  </span>
                </template>
                <template #item.actions="{ item }">
                  <div class="d-flex align-center" @click.stop>
                    <VBtn icon="mdi-content-copy" size="x-small" variant="text" title="Copy output"
                      @click="copyHistoryRow(item)" />
                    <VBtn icon="mdi-delete" size="x-small" variant="text" color="error" title="Delete"
                      @click="deleteHistory(item.date)" />
                  </div>
                </template>
                <template #bottom />
              </VDataTable>
            </VTabsWindowItem>

            <!-- ── Conflicts ─────────────────────────────────────────────── -->
            <VTabsWindowItem value="conflicts">
              <div class="d-flex align-center ga-2 mb-3">
                <VBtn size="small" prepend-icon="mdi-refresh" @click="computeConflicts">Scan</VBtn>
                <span v-if="conflictsLoaded" class="text-body-2 text-medium-emphasis">
                  {{ conflicts.length === 0 ? 'No conflicts found' : `${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''} found` }}
                </span>
              </div>

              <div v-if="conflicts.length === 0 && conflictsLoaded" class="text-body-2 text-medium-emphasis pa-2">
                No conflicts found — no two mappings match the same input.
              </div>

              <div v-for="conflict in conflicts" :key="conflict.input" class="mb-2">
                <!-- Collapsed (ignored) row -->
                <div v-if="ignoredConflicts.has(conflict.input)"
                  class="d-flex align-center ga-2 pa-2 rounded text-disabled"
                  style="background: rgba(128,128,128,0.06); cursor: pointer"
                  @click="restoreConflict(conflict.input)">
                  <VBtn icon="mdi-chevron-right" size="x-small" variant="text" />
                  <code class="text-caption">{{ conflict.input }}</code>
                  <span class="text-caption">{{ conflict.matches.length }} matches — click to expand</span>
                </div>

                <!-- Expanded conflict card -->
                <VCard v-else variant="outlined" class="pa-3">
                  <div class="d-flex align-center justify-space-between mb-2">
                    <div class="d-flex align-center ga-2">
                      <span class="text-caption text-medium-emphasis">Input</span>
                      <code class="text-body-2 font-weight-bold">{{ conflict.input }}</code>
                    </div>
                    <VBtn size="x-small" variant="text" @click="ignoreConflict(conflict.input)">
                      Ignore
                    </VBtn>
                  </div>
                  <div v-for="(match, i) in conflict.matches" :key="match.mapping.id"
                    class="d-flex align-center ga-2 py-1"
                    :class="i > 0 ? 'text-disabled' : ''">
                    <VChip :color="i === 0 ? 'success' : undefined" size="x-small" :variant="i === 0 ? 'tonal' : 'outlined'">
                      {{ i === 0 ? 'wins' : 'shadowed' }}
                    </VChip>
                    <code class="text-caption">{{ match.mapping.name }}</code>
                    <span class="text-caption text-medium-emphasis">→</span>
                    <span class="text-caption">{{ match.expansion }}</span>
                  </div>
                </VCard>
              </div>
            </VTabsWindowItem>

            <!-- ── Test ───────────────────────────────────────────────────── -->
            <VTabsWindowItem value="test">
              <VTextField
                ref="testInputRef"
                v-model="testInput"
                label="Type an input to test…"
                density="compact" clearable hide-details class="mb-4"
                prepend-inner-icon="mdi-magnify"
              />

              <template v-if="testInput.trim()">
                <!-- Pattern matches -->
                <div class="text-caption text-medium-emphasis font-weight-medium mb-1">FIRES</div>
                <div v-if="testPatternMatches.length === 0" class="text-body-2 text-disabled mb-3 pa-1">
                  No mapping fires on "{{ testInput.trim() }}"
                </div>
                <div v-for="(match, i) in testPatternMatches" :key="match.mapping.id"
                  class="d-flex align-center ga-2 py-1 mb-1 px-2 rounded"
                  :style="i > 0 ? 'opacity: 0.5' : ''"
                  style="background: rgba(128,128,128,0.06)">
                  <VChip :color="i === 0 ? 'success' : undefined" size="x-small" :variant="i === 0 ? 'tonal' : 'outlined'">
                    {{ i === 0 ? 'fires' : 'shadowed' }}
                  </VChip>
                  <code class="text-caption">{{ match.mapping.name }}</code>
                  <span class="text-caption text-medium-emphasis">→</span>
                  <span class="text-caption">{{ match.expansion }}</span>
                </div>

                <VDivider class="my-3" />

                <!-- Name contains -->
                <div class="text-caption text-medium-emphasis font-weight-medium mb-1">NAME CONTAINS</div>
                <div v-if="testNameMatches.length === 0" class="text-body-2 text-disabled pa-1">
                  No mapping names contain "{{ testInput.trim() }}"
                </div>
                <div v-for="match in testNameMatches" :key="match.id"
                  class="d-flex align-center ga-2 py-1 mb-1 px-2 rounded"
                  style="background: rgba(128,128,128,0.06)">
                  <code class="text-caption">{{ match.name }}</code>
                  <span class="text-caption text-medium-emphasis">→</span>
                  <span class="text-caption">{{ match.expansion }}</span>
                </div>
              </template>
            </VTabsWindowItem>

            <!-- ── Suggestions ─────────────────────────────────────────── -->
            <VTabsWindowItem value="suggestions">
              <div class="d-flex align-center ga-2 mb-3">
                <VBtn size="small" prepend-icon="mdi-refresh" @click="loadSuggestions">Refresh</VBtn>
                <span class="text-body-2 text-medium-emphasis">
                  Unmapped tokens typed ≥ {{ appSettings.suggestion_threshold ?? 3 }} times
                </span>
              </div>

              <div v-if="suggestionsLoaded && suggestions.length === 0" class="text-body-2 text-disabled pa-2">
                No candidates yet — keep using the app and check back later.
              </div>

              <div v-for="s in suggestions" :key="s.raw_input"
                class="d-flex align-center ga-3 py-2 px-2 rounded mb-1"
                style="background: rgba(128,128,128,0.06)">
                <code class="text-body-2 font-weight-medium flex-grow-1">{{ s.raw_input }}</code>
                <VChip size="small" variant="tonal">{{ s.count }}×</VChip>
                <VBtn size="small" variant="tonal" prepend-icon="mdi-plus"
                  @click="openAddMappingFromSuggestion(s.raw_input)">
                  Create mapping
                </VBtn>
              </div>
            </VTabsWindowItem>

            <!-- ── Frecency settings ───────────────────────────────────── -->
            <VTabsWindowItem value="appSettings">
              <div class="d-flex flex-column ga-4" style="max-width: 480px">
                <div v-for="setting in settingKeys" :key="setting.key">
                  <VTextField
                    :model-value="appSettings[setting.key] ?? ''"
                    :label="setting.label"
                    :hint="setting.hint"
                    density="compact"
                    persistent-hint
                    type="number"
                    min="1"
                    @change="(e: Event) => saveSetting(setting.key, (e.target as HTMLInputElement).value)"
                  />
                </div>
              </div>
            </VTabsWindowItem>

          </VTabsWindow>
        </VCardText>
      </VCard>
    </div>
  </VContainer>

  <!-- Mapping dialog -->
  <VDialog v-model="mappingDialog" max-width="560">
    <VCard>
      <VCardText class="pa-4 d-flex flex-column ga-3">
        <div class="text-h6">{{ mappingForm.id === null ? 'Add' : 'Edit' }} Mapping</div>
        <VTextField ref="mappingNameRef" v-model="mappingForm.name" label="Name (e.g. tt<person,>)" density="compact"
          autofocus @keydown.enter.prevent="mappingExpansionRef?.focus()" />
        <div class="d-flex align-center ga-2">
          <VTextField ref="mappingExpansionRef" v-model="mappingForm.expansion"
            label="Expansion (e.g. talked to <person>)" density="compact" hide-details="auto" class="flex-grow-1"
            :error="missingExpansionTypes.length > 0" :error-messages="missingExpansionTypes.length > 0
              ? `Missing: ${missingExpansionTypes.map(t => `<${t}>`).join(', ')}`
              : undefined" @keydown.enter.prevent="saveMapping" />
          <VBtn v-if="!mappingForm.expansion && mappingForm.name" size="small" variant="tonal"
            title="Copy name to expansion" @click="copyNameToExpansion">Copy</VBtn>
        </div>
        <VCheckbox v-if="mappingForm.id === null" v-model="mappingForm.addBase"
          label="Also add base (e.g. 'tt<person>' will also add 'tt')" density="compact" hide-details />
      </VCardText>
      <div class="d-flex justify-end ga-2 pa-4 pt-0">
        <VBtn variant="text" @click="mappingDialog = false">Cancel</VBtn>
        <VBtn color="primary" @click="saveMapping">Save</VBtn>
      </div>
    </VCard>
  </VDialog>

  <!-- List value dialog -->
  <VDialog v-model="listValueDialog" max-width="440">
    <VCard>
      <VCardText class="pa-4 d-flex flex-column ga-3">
        <div class="text-h6">{{ listValueForm.id === null ? 'Add' : 'Edit' }} List Value</div>
        <VTextField ref="listValueRef" v-model="listValueForm.value" label="Value (e.g. Lisa)" density="compact"
          autofocus @keydown.enter.prevent="listAbbrevRef?.focus()" />
        <VSelect v-model="listValueForm.type_id" :items="mappingTypes" item-title="name" item-value="id" label="Type"
          density="compact" />
        <div class="d-flex align-center ga-2">
          <VTextField ref="listAbbrevRef" v-model="listValueForm.abbreviation"
            label="Abbreviation (optional — enables pattern matching)" density="compact"
            :color="abbrevTaken ? 'error' : undefined" :base-color="abbrevTaken ? 'error' : undefined"
            :error="abbrevTaken" :error-messages="abbrevTaken ? 'Already taken for this type' : undefined"
            hide-details="auto" class="flex-grow-1" @input="onAbbrevInput" @keydown.enter.prevent="saveListValue" />
          <VBtn icon="mdi-refresh" size="small" variant="text" title="Regenerate" @click="regenerateAbbrev" />
        </div>
      </VCardText>
      <div class="d-flex justify-end ga-2 pa-4 pt-0">
        <VBtn variant="text" @click="listValueDialog = false">Cancel</VBtn>
        <VBtn color="primary" :disabled="abbrevTaken || !listValueForm.value" @click="saveListValue">Save</VBtn>
      </div>
    </VCard>
  </VDialog>

  <!-- Mapping type dialog -->
  <VDialog v-model="typeDialog" max-width="520">
    <VCard>
      <VCardText class="pa-4 d-flex flex-column ga-3">
        <div class="text-h6">{{ typeForm.isEdit ? 'Edit' : 'Add' }} Type</div>
        <VTextField ref="typeIdRef" v-model="typeForm.id" label="ID / placeholder (e.g. p, pl, t)" density="compact"
          autofocus @keydown.enter.prevent="typeNameRef?.focus()" />
        <VTextField ref="typeNameRef" v-model="typeForm.name" label="Name (e.g. person, place)" density="compact"
          @keydown.enter.prevent="saveType" />

        <template v-if="typeIdChanged">
          <VAlert v-if="mappingRefCount > 0" type="warning" density="compact" variant="tonal">
            <div>
              {{ mappingRefCount }} mapping{{ mappingRefCount !== 1 ? 's' : '' }} use
              <code>&lt;{{ typeForm.originalId }}&gt;</code> /
              <code>&lt;{{ typeForm.originalId }},&gt;</code>
            </div>
            <VCheckbox v-model="updateMappingRefs"
              :label="`Rename to <${typeForm.id}> / <${typeForm.id},> in all mappings`" density="compact" hide-details
              class="mt-1" />
          </VAlert>
          <VAlert v-else type="info" density="compact" variant="tonal">
            No mappings reference <code>&lt;{{ typeForm.originalId }}&gt;</code> — safe to rename.
          </VAlert>
        </template>
      </VCardText>
      <div class="d-flex justify-end ga-2 pa-4 pt-0">
        <VBtn variant="text" @click="typeDialog = false">Cancel</VBtn>
        <VBtn color="primary" @click="saveType">Save</VBtn>
      </div>
    </VCard>
  </VDialog>

  <!-- CSV import dialog -->
  <VDialog v-model="importDialog" max-width="480">
    <VCard>
      <VCardText class="pa-4 d-flex flex-column ga-3">
        <div class="d-flex align-center justify-space-between">
          <div class="text-h6">Import {{ IMPORT_META[importTarget].label }}</div>
          <VBtn size="small" variant="tonal" prepend-icon="mdi-download" @click="downloadExampleCsv">Example CSV</VBtn>
        </div>
        <VFileInput label="Choose CSV file" accept=".csv,text/csv" density="compact" hide-details prepend-icon=""
          prepend-inner-icon="mdi-paperclip" @update:model-value="onImportFileChange" />
        <div v-if="importParsedRows.length" class="text-body-2 text-medium-emphasis">
          {{ importParsedRows.length }} row{{ importParsedRows.length !== 1 ? 's' : '' }} found — duplicates will be
          skipped automatically
        </div>
      </VCardText>
      <div class="d-flex justify-end ga-2 pa-4 pt-0">
        <VBtn variant="text" @click="importDialog = false">Cancel</VBtn>
        <VBtn color="primary" :disabled="!importParsedRows.length" :loading="importLoading" @click="runImport">Import
        </VBtn>
      </div>
    </VCard>
  </VDialog>

  <!-- History view dialog -->
  <VDialog v-model="historyViewDialog" max-width="640" scrollable>
    <VCard v-if="historyViewItem">
      <VCardText class="pa-4">
        <div class="text-h6 mb-4">{{ historyViewItem.date }}</div>
        <VRow dense>
          <VCol v-for="[label, val] in ([
            ['Bathe', historyViewItem.bathe],
            ['Wake', historyViewItem.wake],
            ['Sleep', historyViewItem.sleep],
            ['Nap', historyViewItem.nap],
            ['Worked', historyViewItem.worked],
            ['Stress', historyViewItem.stress],
            ['Tired', historyViewItem.tired],
            ['Game', historyViewItem.game],
            ['Music', historyViewItem.music],
            ['Grateful', historyViewItem.grateful],
            ['Learn', historyViewItem.learn],
            ['Exercise', historyViewItem.exercise],
            ['Remember', historyViewItem.remember],
            ['Day rating', historyViewItem.day_rating],
            ['Feeling', historyViewItem.feeling],
            ['Why', historyViewItem.why],
            ['Phase', historyViewItem.phase],
            ['Time', historyViewItem.time],
            ['Happened', historyViewItem.happened],
            ['Day name', historyViewItem.day_name],
          ] as [string, string][])" :key="label" cols="12" sm="6">
            <div class="text-caption text-disabled font-weight-medium">{{ label.toUpperCase() }}</div>
            <div class="text-body-2 mb-2" style="white-space: pre-wrap; word-break: break-word;">{{ val || '—' }}</div>
          </VCol>
        </VRow>
      </VCardText>
      <div class="d-flex justify-end align-center ga-2 pa-4 pt-0">
        <VBtn size="small" variant="tonal" prepend-icon="mdi-restore"
          @click="restoreToForm(historyViewItem); historyViewDialog = false">
          Restore to form
        </VBtn>
        <VBtn size="small" variant="text" @click="historyViewDialog = false">Close</VBtn>
      </div>
    </VCard>
  </VDialog>

  <VSnackbar v-model="snackbar" :timeout="1500">{{ snackbarText }}</VSnackbar>
</template>
