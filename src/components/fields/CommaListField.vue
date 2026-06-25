<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { VCombobox } from 'vuetify/components'

const props = defineProps<{
  modelValue: string[]
  label: string
  suggestions?: string[]
  onNext?: () => void
  onPrevious?: () => void
  required?: boolean
  autoSelect?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const comboboxRef = ref<InstanceType<typeof VCombobox> | null>(null)
const isInternalUpdate = ref(false)
const localValue = ref<string[]>([])
const searchText = ref('')

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

function handleUpdate(val: unknown) {
  if (!Array.isArray(val)) return
  localValue.value = (val as string[]).filter(Boolean)
  save(localValue.value)
}

// Filtered suggestions for current search (for Enter→top-pick logic)
const filteredSuggestions = computed(() => {
  if (!props.suggestions?.length || !searchText.value) return props.suggestions ?? []
  const q = searchText.value.toLowerCase()
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
  if (!value || localValue.value.includes(value)) return
  const newVal = [...localValue.value, value]
  localValue.value = newVal
  save(newVal)
  clearInput()
  nextTick(() => getNativeInput()?.focus())
}

function handleKeydown(e: KeyboardEvent) {
  // Comma+Space: commit current typed text as chip (allows free text)
  if (e.key === ' ' && searchText.value.endsWith(',')) {
    e.preventDefault()
    const val = searchText.value.slice(0, -1).trim()
    if (val) addChip(val)
    else clearInput()
    return
  }

  // Enter: select top filtered suggestion; if empty → advance field
  if (e.key === 'Enter') {
    if (!searchText.value) {
      e.preventDefault()
      props.onNext?.()
      return
    }
    if (filteredSuggestions.value.length > 0) {
      e.preventDefault()
      addChip(filteredSuggestions.value[0])
      return
    }
    // No suggestions match and not empty → do nothing (comma+space to add free text)
    e.preventDefault()
    return
  }

  // Backspace on empty search: remove last chip immediately (single press)
  if (e.key === 'Backspace' && !searchText.value) {
    e.preventDefault()
    if (localValue.value.length > 0) {
      const newVal = localValue.value.slice(0, -1)
      localValue.value = newVal
      save(newVal)
    }
    return
  }

  // Tab: commit partial text if any, then advance
  if (e.key === 'Tab') {
    e.preventDefault()
    const val = searchText.value.trim().replace(/,$/, '')
    if (val && filteredSuggestions.value.length > 0) {
      addChip(filteredSuggestions.value[0])
    } else if (val) {
      addChip(val)
    }
    if (e.shiftKey) props.onPrevious?.()
    else props.onNext?.()
  }
}
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
    @update:model-value="handleUpdate"
    @keydown="handleKeydown"
  />
</template>

<style scoped>
/* Make chips roughly match body text size and sit flush with a compact field */
.comma-list-field :deep(.v-chip) {
  font-size: 0.9rem;
  height: 26px;
  padding: 0 10px;
}
.comma-list-field :deep(.v-chip .v-chip__close) {
  font-size: 16px;
}
</style>
