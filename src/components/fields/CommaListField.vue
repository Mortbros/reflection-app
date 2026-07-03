<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { VCombobox } from 'vuetify/components'

const props = defineProps<{
  modelValue: string[]
  label: string
  suggestions?: string[]
  onNext?: () => void
  onPrevious?: () => void
  required?: boolean
  autoSelect?: boolean
  emptyValue?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const comboboxRef = ref<InstanceType<typeof VCombobox> | null>(null)
const isInternalUpdate = ref(false)
const localValue = ref<string[]>([])
const searchText = ref('')
const isFocused = ref(false)

// Show the emptyValue (e.g. "N") as a placeholder only while unfocused and empty
const displayPlaceholder = computed(() =>
  !isFocused.value && localValue.value.length === 0 ? props.emptyValue : undefined
)

const getNativeInput = (): HTMLInputElement | null =>
  comboboxRef.value?.$el?.querySelector('input') ?? null

watch(() => props.modelValue, (val) => {
  if (!isInternalUpdate.value) {
    localValue.value = val?.filter(Boolean) ?? []
  }
  isInternalUpdate.value = false
}, { immediate: true })

const focus = async () => {
  await nextTick()
  getNativeInput()?.focus()
}
defineExpose({ focus })

function save(val: string[]) {
  isInternalUpdate.value = true
  emit('update:modelValue', val.filter(Boolean))
}

// Only handles syncing when VCombobox itself adds items (e.g. clicking a suggestion)
function handleUpdate(val: unknown) {
  if (!Array.isArray(val)) return
  localValue.value = (val as string[]).filter(Boolean)
  save(localValue.value)
}

const filteredSuggestions = computed(() => {
  if (!props.suggestions?.length) return []
  const q = searchText.value.toLowerCase()
  if (!q) return props.suggestions
  return props.suggestions.filter(s => s.toLowerCase().startsWith(q))
})

function clearInput() {
  searchText.value = ''
  nextTick(() => {
    const input = getNativeInput()
    if (input) {
      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
}

function addChip(value: string) {
  const trimmed = value.trim()
  if (!trimmed || localValue.value.includes(trimmed)) {
    clearInput()
    return
  }
  const newVal = [...localValue.value, trimmed]
  localValue.value = newVal
  save(newVal)
  clearInput()
  nextTick(() => getNativeInput()?.focus())
}

// Capture-phase listener on the native <input> — runs BEFORE VCombobox's handlers.
// This prevents VCombobox from adding typed text as a chip when Enter is pressed;
// we control all chip addition manually.
function nativeKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.stopPropagation()
    e.preventDefault()
    if (!searchText.value) {
      props.onNext?.()
      return
    }
    // Pick the top filtered suggestion, or commit typed text as a free-text chip
    if (filteredSuggestions.value.length > 0) {
      addChip(filteredSuggestions.value[0])
    } else {
      addChip(searchText.value.trim().replace(/,$/, ''))
    }
    return
  }

  // Comma+Space: commit typed text as a free-text chip
  if (e.key === ' ' && searchText.value.endsWith(',')) {
    e.stopPropagation()
    e.preventDefault()
    const val = searchText.value.slice(0, -1).trim()
    if (val) addChip(val)
    else clearInput()
    return
  }

  // Single backspace removes last chip when the text input is empty
  if (e.key === 'Backspace' && !searchText.value) {
    e.stopPropagation()
    e.preventDefault()
    if (localValue.value.length > 0) {
      const newVal = localValue.value.slice(0, -1)
      localValue.value = newVal
      save(newVal)
    }
    return
  }

  // Tab: commit current text (pick top suggestion), then advance
  if (e.key === 'Tab') {
    e.stopPropagation()
    e.preventDefault()
    const val = searchText.value.trim().replace(/,$/, '')
    if (val) {
      if (filteredSuggestions.value.length > 0) addChip(filteredSuggestions.value[0])
      else addChip(val)
    }
    if (e.shiftKey) props.onPrevious?.()
    else props.onNext?.()
    return
  }
  // All other keys (ArrowDown, ArrowUp, Escape, etc.) propagate to VCombobox normally
}

onMounted(async () => {
  await nextTick()
  getNativeInput()?.addEventListener('keydown', nativeKeydown, { capture: true })
})

onUnmounted(() => {
  getNativeInput()?.removeEventListener('keydown', nativeKeydown, { capture: true })
})
</script>

<template>
  <VCombobox
    ref="comboboxRef"
    v-model="localValue"
    v-model:search="searchText"
    :label="label"
    :items="suggestions ?? []"
    multiple
    chips
    closable-chips
    variant="outlined"
    hide-details
    autocomplete="off"
    class="comma-list-field"
    :placeholder="displayPlaceholder"
    persistent-placeholder
    @update:model-value="handleUpdate"
    @focus="isFocused = true"
    @blur="isFocused = false"
  />
</template>

<style scoped>
/* Reduce internal top/bottom padding so the chip combobox matches other compact fields */
.comma-list-field :deep(.v-field__input) {
  padding-top: 4px;
  padding-bottom: 4px;
  padding-left: 16px;
  min-height: unset;
  gap: 4px;
}

/* Chips: same visual weight as normal body text */
.comma-list-field :deep(.v-chip) {
  font-size: 1rem;
  height: 28px;
  padding: 0 10px;
}
.comma-list-field :deep(.v-chip .v-chip__close) {
  font-size: 18px;
}
</style>
