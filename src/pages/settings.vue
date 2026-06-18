<script setup lang="ts">
import { ref, watch, computed, onMounted, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import {
  VContainer, VCard, VCardText, VTabs, VTab, VTabsWindow, VTabsWindowItem,
  VDataTable, VBtn, VDialog, VTextField, VCheckbox, VSelect, VSnackbar, VAlert, VFileInput,
} from 'vuetify/components';
import {
  getMappingInstances, insertMappingInstance, updateMappingInstance, deleteMappingInstance,
  setMappingInstanceEnabled, importMappingInstance, importListValue, importMappingType,
  getListValues, insertListValue, updateListValue, deleteListValue,
  getMappingTypes, insertMappingType, updateMappingType, deleteMappingType,
  countMappingsUsingType, renameMappingTypeId,
  getFormHistory, deleteFormHistoryRow,
} from '@/lib/db';
import type { MappingInstance, ListValue, MappingType, FormHistoryRow } from '@/lib/db';

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

const mappings = ref<MappingInstance[]>([]);
const listValues = ref<ListValue[]>([]);
const mappingTypes = ref<MappingType[]>([]);

const refresh = async () => {
  [mappings.value, listValues.value, mappingTypes.value] = await Promise.all([
    getMappingInstances(),
    getListValues(),
    getMappingTypes(),
  ]);
};

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

// Manual button: append all missing valid slots from the name into the expansion
const fillMissingSlots = () => {
  const seen = new Set<string>();
  for (const { typeId, multiple } of extractTypeSlots(mappingForm.value.name)) {
    if (seen.has(typeId) || !validTypeIdSet.value.has(typeId)) continue;
    seen.add(typeId);
    if (!new RegExp(`<${typeId},?>`).test(mappingForm.value.expansion)) {
      const slot = `<${typeId}${multiple ? ',' : ''}>`;
      const exp = mappingForm.value.expansion;
      mappingForm.value.expansion = exp ? `${exp.trimEnd()} ${slot}` : slot;
    }
  }
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

// Columns shown depend on whether the active type uses abbreviations
const activeTypeHasAbbrevs = computed(() =>
  filteredListValues.value.some(v => v.abbreviation !== null)
);

const listValueHeaders = computed((): TableHeader[] => {
  const cols: TableHeader[] = [{ title: 'Value', key: 'value' }];
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

const loadHistory = async () => { history.value = await getFormHistory(); };

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
        <VTabs v-model="tab">
          <VTab value="mappings">Mappings</VTab>
          <VTab value="listValues">List Values</VTab>
          <VTab value="types">Types</VTab>
          <VTab value="history" @click="loadHistory">History</VTab>
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
                :items-per-page="-1" hover @click:row="(_: any, { item }: any) => restoreToForm(item)"
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
          <VBtn v-if="missingExpansionTypes.length > 0" icon="mdi-auto-fix" size="small" variant="text"
            title="Fill missing type slots" @click="fillMissingSlots" />
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

  <VSnackbar v-model="snackbar" :timeout="1500">{{ snackbarText }}</VSnackbar>
</template>
