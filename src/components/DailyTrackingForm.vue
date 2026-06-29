<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { VContainer, VRow, VCol, VCard, VCardText, VBtn, VDivider, VChip, VProgressLinear } from 'vuetify/components';
import DateField from '@/components/fields/DateField.vue';
import YesNoField from '@/components/fields/YesNoField.vue';
import TimeField from '@/components/fields/TimeField.vue';
import FloatField from '@/components/fields/FloatField.vue';
import IntField from '@/components/fields/IntField.vue';
import StringField from '@/components/fields/StringField.vue';
import CommaListField from '@/components/fields/CommaListField.vue';
import PlainListField from '@/components/fields/PlainListField.vue';
import PatternTextField from '@/components/fields/PatternTextField.vue';
import TimeDisplay from '@/components/fields/TimeDisplay.vue';
import { getTodayDate, getYesterdayDate } from '@/lib/fieldUtils';
import {
  getMappingInstances, getListValues, getSuggestions, upsertFormHistory,
  getAllAppSettings, getAllRecentTokenUsage, recordTokenUsage, insertListValue,
  getActiveSchemaVersion, getSchemaFields,
} from '@/lib/db';
import type { MappingInstance, ListValue, FormSchemaField } from '@/lib/db';
import type { TokenUsageRow } from '@/lib/frecency';

const router = useRouter();
const STORAGE_KEY = 'daily_tracking_form_data';

// ── Field component registry ──────────────────────────────────────────────────

function getFieldComponent(type: string) {
  switch (type) {
    case 'date': return DateField
    case 'yes_no': return YesNoField
    case 'time': return TimeField
    case 'float': return FloatField
    case 'int': return IntField
    case 'string': return StringField
    case 'list': return PlainListField
    case 'autocomplete_list': return CommaListField
    default: return StringField
  }
}

function getFieldProps(field: FormSchemaField): Record<string, unknown> {
  const cfg = field.config ?? {}
  const base: Record<string, unknown> = {
    label: field.label,
    required: !!cfg.required,
  }
  switch (field.field_type) {
    case 'float':
    case 'int':
      if (cfg.max != null) base.max = cfg.max
      break
    case 'time':
      if (cfg.defaultToFuture) { base.defaultToFuture = true; base.futureMinutes = cfg.futureMinutes ?? 25 }
      break
    case 'list':
      break
    case 'autocomplete_list':
      base.suggestions = dbSuggestions.value.get(cfg.listTypeId as string) ?? []
      if (cfg.autoSelect === false) base.autoSelect = false
      break
  }
  return base
}

// ── Schema ────────────────────────────────────────────────────────────────────

const schemaFields = ref<FormSchemaField[]>([]);

const navigableKeys = computed(() =>
  schemaFields.value.filter(f => f.field_type !== 'time_display').map(f => f.field_key)
)

// Group fields into rows for rendering
const fieldRows = computed(() => {
  const result: FormSchemaField[][] = []
  const groupedMap = new Map<number, FormSchemaField[]>()
  const seenGroups = new Set<number>()

  for (const f of schemaFields.value) {
    if (f.row_group != null) {
      const g = groupedMap.get(f.row_group) ?? []
      g.push(f)
      groupedMap.set(f.row_group, g)
    }
  }

  for (const f of schemaFields.value) {
    if (f.row_group != null) {
      if (!seenGroups.has(f.row_group)) {
        seenGroups.add(f.row_group)
        result.push(groupedMap.get(f.row_group)!)
      }
    } else {
      result.push([f])
    }
  }
  return result
})

// ── DB state ──────────────────────────────────────────────────────────────────

const dbMappingsByGroup = ref<Map<string, MappingInstance[]>>(new Map())
const dbListValues = ref<ListValue[]>([])
const dbSuggestions = ref<Map<string, string[]>>(new Map())
const dbLoaded = ref(false)
const halfLifeDays = ref(7)
const maxSuggestions = ref(5)
const dbTokenUsage = ref<TokenUsageRow[]>([])
const activeSchemaVersionId = ref<number | null>(null)

const getMappingsForGroup = (group: string) =>
  dbMappingsByGroup.value.get(group) ?? dbMappingsByGroup.value.get('main') ?? []

const loadDb = async () => {
  const today = getTodayDate()
  const [schemaVersion, lv, settings] = await Promise.all([
    getActiveSchemaVersion(today),
    getListValues(true),
    getAllAppSettings(),
  ])

  dbListValues.value = lv
  halfLifeDays.value = parseFloat(settings.frecency_halflife_days ?? '7') || 7
  maxSuggestions.value = parseInt(settings.autocomplete_max_results ?? '5') || 5

  if (schemaVersion) {
    activeSchemaVersionId.value = schemaVersion.id
    schemaFields.value = await getSchemaFields(schemaVersion.id)

    const groups = new Set<string>(['main'])
    for (const f of schemaFields.value) {
      if (f.field_type === 'shortcode_text' && f.config?.group) {
        groups.add(f.config.group as string)
      }
    }
    const groupEntries = await Promise.all(
      [...groups].map(async g => [g, await getMappingInstances(true, g)] as const)
    )
    dbMappingsByGroup.value = new Map(groupEntries)

    const listTypeIds = new Set<string>()
    for (const f of schemaFields.value) {
      if (f.field_type === 'autocomplete_list' && f.config?.listTypeId) {
        listTypeIds.add(f.config.listTypeId as string)
      }
    }
    const suggEntries = await Promise.all(
      [...listTypeIds].map(async id => [id, await getSuggestions(id)] as const)
    )
    dbSuggestions.value = new Map(suggEntries)
  }

  dbLoaded.value = true
  const windowDays = halfLifeDays.value * 15
  dbTokenUsage.value = await getAllRecentTokenUsage(windowDays)
}

const onUsageRecorded = async (entry: { rawInput: string; mappingName: string | null; expansion: string }) => {
  const row: TokenUsageRow = { raw_input: entry.rawInput, mapping_name: entry.mappingName, expansion: entry.expansion, used_at: new Date().toISOString() }
  dbTokenUsage.value = [row, ...dbTokenUsage.value]
  await recordTokenUsage(entry.rawInput, entry.mappingName, entry.expansion)
}

// ── Form data ─────────────────────────────────────────────────────────────────

const formData = ref<Record<string, unknown>>({})

function getDefaultValue(field: FormSchemaField): unknown {
  const cfg = field.config ?? {}
  switch (field.field_type) {
    case 'date': return ''
    case 'yes_no': return 'N'
    case 'time': return ''
    case 'float': return 0
    case 'int': return 0
    case 'string': return ''
    case 'shortcode_text': return ''
    case 'time_display': return ''
    case 'list': return []
    case 'autocomplete_list': return []
    default: return ''
  }
}

// When schema loads, initialize formData preserving any already-typed values.
// Also converts string→array for list fields from old migrated history rows.
watch(schemaFields, (fields) => {
  const existing = formData.value
  const data: Record<string, unknown> = {}
  for (const f of fields) {
    let val = f.field_key in existing ? existing[f.field_key] : getDefaultValue(f)
    if ((f.field_type === 'list' || f.field_type === 'autocomplete_list') && typeof val === 'string') {
      val = (val as string) ? (val as string).split(', ').filter(Boolean) : []
    }
    // Strip the emptyValue sentinel if it was stored as a real value (backwards compat)
    const emptyVal = (f.config?.emptyValue as string | undefined) ?? (f.config?.defaultN ? 'N' : undefined)
    if (f.field_type === 'autocomplete_list' && Array.isArray(val) && emptyVal) {
      val = (val as string[]).filter(v => v !== emptyVal)
    }
    data[f.field_key] = val
  }
  formData.value = data
}, { immediate: false })

const loadFormData = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // Merge into formData — the schemaFields watcher handles type coercion
      Object.assign(formData.value, parsed)
    }
  } catch (err) {
    console.error('Failed to load form data:', err)
  }
}

const saveFormData = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(formData.value)) }
  catch (err) { console.error('Failed to save form data:', err) }
}

watch(formData, saveFormData, { deep: true })

watch(() => formData.value.time as string | undefined, (newTime) => {
  if (newTime) {
    const m = newTime.match(/(\d{1,2}):?(\d{2})?/)
    if (m && parseInt(m[1] || '0', 10) < 12) formData.value.date = getYesterdayDate()
  }
})

const setDateToToday = () => { formData.value.date = getTodayDate() }

const clearForm = () => {
  const data: Record<string, unknown> = {}
  for (const f of schemaFields.value) data[f.field_key] = getDefaultValue(f)
  formData.value = data
  setDateToToday()
  localStorage.removeItem(STORAGE_KEY)
  nextTick(() => fieldRefs.value[navigableKeys.value[0] ?? '']?.focus())
}

// ── Field refs & navigation ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fieldRefs = ref<Record<string, any>>({})
const dateFieldRef = ref<InstanceType<typeof DateField> | null>(null)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const setFieldRef = (key: string, el: any) => {
  if (el) fieldRefs.value[key] = el
  else delete fieldRefs.value[key]
}

async function focusField(key: string | 'submit') {
  if (key === 'submit') { copyToClipboard(); return }
  await nextTick()
  fieldRefs.value[key]?.focus()
  await nextTick()
  document.activeElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function onNext(key: string) {
  const keys = navigableKeys.value
  const idx = keys.indexOf(key)
  focusField(idx >= 0 && idx < keys.length - 1 ? keys[idx + 1] : 'submit')
}

function onPrevious(key: string) {
  const keys = navigableKeys.value
  const idx = keys.indexOf(key)
  focusField(idx > 0 ? keys[idx - 1] : keys[0])
}

// ── Validation ────────────────────────────────────────────────────────────────

const validationErrors = ref<string[]>([])

const validateForm = () => {
  const e: string[] = []
  if (!formData.value.date) e.push('Date')
  for (const f of schemaFields.value) {
    if (!f.config?.required) continue
    const val = formData.value[f.field_key]
    if (Array.isArray(val)) { if (val.length === 0) e.push(f.label) }
    else if (typeof val === 'number') { if (val < 1) e.push(f.label) }
    else { if (!val) e.push(f.label) }
  }
  validationErrors.value = e
}

watch(formData, validateForm, { deep: true, immediate: true })

function focusFieldByError(label: string) {
  if (label === 'Date') { dateFieldRef.value?.focus(); return }
  const field = schemaFields.value.find(f => f.label === label)
  if (field) focusField(field.field_key)
}

// ── Clipboard ─────────────────────────────────────────────────────────────────

const copySuccess = ref(false)
const sleepTimeMessage = ref('')

function getEmptyValue(field: FormSchemaField): string | undefined {
  return (field.config?.emptyValue as string | undefined) ?? (field.config?.defaultN ? 'N' : undefined)
}

function serializeField(field: FormSchemaField, overrideSleep?: string): string {
  if (field.field_key === 'sleep' && overrideSleep !== undefined) return overrideSleep
  const val = formData.value[field.field_key]
  if (Array.isArray(val)) {
    const items = (val as string[]).filter(Boolean)
    if (items.length === 0) return getEmptyValue(field) ?? ''
    return items.join(', ')
  }
  return val == null ? '' : String(val)
}

const persistNewListValues = (field: FormSchemaField) => {
  const listTypeId = field.config?.listTypeId as string | undefined
  if (!listTypeId) return
  const values = formData.value[field.field_key] as string[]
  const emptyVal = getEmptyValue(field)
  const SKIP = ['', ...(emptyVal ? [emptyVal, emptyVal.toLowerCase()] : [])]
  const existing = dbSuggestions.value.get(listTypeId) ?? []
  for (const v of values) {
    if (SKIP.includes(v.trim())) continue
    if (!existing.includes(v)) {
      dbSuggestions.value.set(listTypeId, [...existing, v])
      insertListValue(v, listTypeId).catch(console.error)
    }
  }
}

const copyToClipboard = async () => {
  let sleepTime = formData.value.sleep as string | undefined
  if (sleepTime) {
    const m = sleepTime.match(/(\d{1,2}):?(\d{2})?/)
    if (m) {
      const h = parseInt(m[1] || '0', 10), min = parseInt(m[2] || '0', 10)
      const now = new Date()
      if (h * 60 + min < now.getHours() * 60 + now.getMinutes()) {
        const future = new Date(now.getTime() + 10 * 60000)
        sleepTime = `${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`
        formData.value.sleep = sleepTime
        sleepTimeMessage.value = 'Sleep time updated to 10 minutes from now'
        setTimeout(() => { sleepTimeMessage.value = '' }, 3000)
      }
    }
  }

  const outputFields = [...schemaFields.value]
  const timeIdx = outputFields.findIndex(f => f.field_key === 'time')
  const happenedIdx = outputFields.findIndex(f => f.field_key === 'happened')
  if (timeIdx !== -1 && happenedIdx !== -1) {
    ;[outputFields[timeIdx], outputFields[happenedIdx]] = [outputFields[happenedIdx], outputFields[timeIdx]]
  }
  const text = outputFields.map(f => serializeField(f, f.field_key === 'sleep' ? sleepTime : undefined)).join('\t')

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      Object.assign(ta.style, { position: 'fixed', left: '-999999px', top: '-999999px' })
      document.body.appendChild(ta); ta.focus(); ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 2000)

    for (const f of schemaFields.value) {
      if (f.field_type === 'autocomplete_list') persistNewListValues(f)
    }

    if (formData.value.date) {
      const responses: Record<string, unknown> = {}
      for (const f of schemaFields.value) {
        responses[f.field_key] = f.field_key === 'sleep' ? sleepTime : formData.value[f.field_key]
      }
      upsertFormHistory({
        date:              formData.value.date as string,
        output:            text,
        saved_at:          new Date().toISOString(),
        responses:         JSON.stringify(responses),
        schema_version_id: activeSchemaVersionId.value,
      }).catch(console.error)
    }
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

const clearButtonRef = ref<InstanceType<typeof VBtn> | null>(null)

const handleClearButtonKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
    event.preventDefault()
    clearForm()
  }
}

const onAppCopy = () => copyToClipboard()
onMounted(() => document.addEventListener('app:copy', onAppCopy))
onUnmounted(() => document.removeEventListener('app:copy', onAppCopy))

// ── Mount ─────────────────────────────────────────────────────────────────────

onMounted(async () => {
  loadFormData()      // load saved values FIRST so schemaFields watcher sees them
  await loadDb()      // sets schemaFields; watcher preserves the loaded values
  await nextTick()
  fieldRefs.value[navigableKeys.value[0] ?? '']?.focus()
})
</script>

<template>
  <VContainer fluid>
    <VRow justify="center">
      <VCol cols="12" md="10" lg="8" xl="6">
        <VCard variant="outlined" class="pa-1 pa-sm-6 form-card" style="min-height: 100vh;">
          <VProgressLinear v-if="!dbLoaded" indeterminate color="primary" height="2" />
          <VCardText>
            <div class="d-flex flex-column ga-3">
              <div class="d-flex align-center ga-2 mb-4">
                <VBtn icon="mdi-help-circle-outline" variant="text" size="small" @click="router.push('/help')" />
                <div class="d-flex justify-center flex-wrap ga-4 flex-grow-1">
                  <VBtn :color="copySuccess ? 'success' : 'primary'" size="large" class="text-h6"
                    @click="copyToClipboard" :prepend-icon="copySuccess ? 'mdi-check' : 'mdi-content-copy'">
                    {{ copySuccess ? 'Copied!' : 'Copy to Clipboard' }}
                  </VBtn>
                  <VBtn ref="clearButtonRef" color="error" size="large" class="text-h6" prepend-icon="mdi-delete"
                    @click="clearForm" @keydown="handleClearButtonKeydown">
                    Clear
                  </VBtn>
                </div>
                <VBtn icon="mdi-youtube" variant="text" size="small" title="YouTube history (Ctrl+Y)"
                  @click="window.open('https://www.youtube.com/feed/history', '_blank')" />
                <VBtn icon="mdi-google" variant="text" size="small" title="My Activity (Ctrl+G)"
                  @click="window.open('https://myactivity.google.com/myactivity?pli=1', '_blank')" />
                <VBtn icon="mdi-cog" variant="text" size="small" @click="router.push('/settings')" />
              </div>

              <!-- Date row (special: inline Today button) -->
              <div class="d-flex align-center ga-2">
                <div class="flex-grow-1">
                  <DateField ref="dateRef" v-model="(formData.date as string)" label="Date" :required="true"
                    :on-next="() => onNext('date')" />
                </div>
                <VBtn size="small" variant="outlined" @click="setDateToToday">Today</VBtn>
              </div>

              <!-- Schema-driven fields -->
              <template v-for="row in fieldRows" :key="row[0].field_key">

                <!-- Skip date — rendered above -->
                <template v-if="row[0].field_type === 'date'" />

                <!-- Multi-field row -->
                <VRow v-else-if="row.length > 1" no-gutters class="ga-3" style="flex-wrap: nowrap">
                  <VCol v-for="field in row" :key="field.field_key"
                    style="flex: 1 1 0; min-width:0">
                    <component
                      :is="getFieldComponent(field.field_type)"
                      v-bind="getFieldProps(field)"
                      :ref="(el: unknown) => setFieldRef(field.field_key, el)"
                      :model-value="formData[field.field_key]"
                      :on-next="() => onNext(field.field_key)"
                      :on-previous="() => onPrevious(field.field_key)"
                      @update:model-value="(v: unknown) => formData[field.field_key] = v"
                    />
                  </VCol>
                </VRow>

                <!-- shortcode_text (PatternTextField — extra props) -->
                <template v-else-if="row[0].field_type === 'shortcode_text'">
                  <PatternTextField
                    :ref="(el: unknown) => setFieldRef(row[0].field_key, el)"
                    v-model="(formData[row[0].field_key] as string)"
                    :label="row[0].label"
                    :required="!!row[0].config?.required"
                    :mappings="getMappingsForGroup((row[0].config?.group as string) ?? 'main')"
                    :list-values="dbListValues"
                    :half-life-days="halfLifeDays"
                    :max-suggestions="maxSuggestions"
                    :token-usage="dbTokenUsage"
                    :on-next="() => onNext(row[0].field_key)"
                    :on-previous="() => onPrevious(row[0].field_key)"
                    @usage-recorded="onUsageRecorded"
                  />
                  <VBtn size="small" variant="outlined"
                    @click="fieldRefs[row[0].field_key]?.capitalize()">
                    Capitalize
                  </VBtn>
                </template>

                <!-- time_display (no navigation) -->
                <TimeDisplay v-else-if="row[0].field_type === 'time_display'"
                  v-model="(formData[row[0].field_key] as string)" />

                <!-- Generic single-field -->
                <component v-else
                  :is="getFieldComponent(row[0].field_type)"
                  v-bind="getFieldProps(row[0])"
                  :ref="(el: unknown) => setFieldRef(row[0].field_key, el)"
                  :model-value="formData[row[0].field_key]"
                  :on-next="() => onNext(row[0].field_key)"
                  :on-previous="() => onPrevious(row[0].field_key)"
                  @update:model-value="(v: unknown) => formData[row[0].field_key] = v"
                />

              </template>

              <VDivider class="my-4" />

              <div v-if="sleepTimeMessage">
                <VChip color="info" variant="outlined" size="small">{{ sleepTimeMessage }}</VChip>
              </div>

              <div v-if="validationErrors.length > 0">
                <div class="text-body-1 font-weight-bold mb-2 text-error">Missing or invalid fields:</div>
                <div class="d-flex flex-wrap ga-2">
                  <VChip v-for="error in validationErrors" :key="error" color="error" variant="outlined" size="small"
                    style="cursor: pointer;" @click="focusFieldByError(error)">
                    {{ error }}
                  </VChip>
                </div>
              </div>

              <div class="d-flex justify-center flex-wrap ga-4">
                <VBtn :color="copySuccess ? 'success' : 'primary'" size="large" class="text-h6"
                  @click="copyToClipboard" :prepend-icon="copySuccess ? 'mdi-check' : 'mdi-content-copy'">
                  {{ copySuccess ? 'Copied!' : 'Copy to Clipboard' }}
                </VBtn>
                <VBtn ref="clearButtonRef" color="error" size="large" class="text-h6" prepend-icon="mdi-delete"
                  @click="clearForm" @keydown="handleClearButtonKeydown">
                  Clear
                </VBtn>
              </div>
            </div>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </VContainer>
</template>

<style scoped>
:deep(.v-field) {
  transition: all 0.2s ease;
  font-size: 1.5rem !important;
}

:deep(.v-field--focused) {
  border-color: rgb(var(--v-theme-primary)) !important;
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.3) !important;
  transform: scale(1.01);
}

:deep(.v-field--error) {
  border-color: rgb(var(--v-theme-error)) !important;
  box-shadow: 0 0 0 3px rgba(var(--v-theme-error), 0.5) !important;
  background-color: rgba(var(--v-theme-error), 0.1) !important;
}

:deep(.v-field--error .v-field__input) {
  color: rgb(var(--v-theme-error)) !important;
}

:deep(.v-input) {
  font-size: 1.5rem !important;
}

:deep(.v-label) {
  font-size: 1.3rem !important;
  font-weight: 600 !important;
}

:deep(input),
:deep(textarea) {
  font-size: 1.5rem !important;
  padding: 16px !important;
}

:deep(.v-field__input) {
  min-height: 64px !important;
  position: relative;
  z-index: 1;
}

:deep(.v-field__outline) {
  z-index: 0;
}

:deep(.v-textarea .v-field__input) {
  min-height: 120px !important;
}

.v-card {
  max-width: 100%;
}

@media (max-width: 599px) {
  .form-card {
    border: none !important;
    box-shadow: none !important;
  }
}

.ga-6 {
  gap: 1.2rem !important;
}
</style>
