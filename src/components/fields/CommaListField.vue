<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
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

watch(() => props.modelValue, (val) => {
  if (!isInternalUpdate.value) {
    localValue.value = val?.filter(Boolean) ?? []
  }
  isInternalUpdate.value = false
}, { immediate: true })

const focus = async () => {
  await nextTick()
  const input = comboboxRef.value?.$el?.querySelector('input') as HTMLInputElement | null
  if (!input) return
  input.focus()
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

function handleKeydown(e: KeyboardEvent) {
  // Comma+Space: commit current typed text as a chip, reset search
  if (e.key === ' ' && searchText.value.endsWith(',')) {
    e.preventDefault()
    const val = searchText.value.slice(0, -1).trim()
    if (val) {
      const newVal = [...localValue.value, val]
      localValue.value = newVal
      save(newVal)
    }
    searchText.value = ''
    return
  }
  // Enter with no typed text: advance to next field
  if (e.key === 'Enter' && !searchText.value) {
    e.preventDefault()
    props.onNext?.()
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    // Commit any partial text before moving
    const val = searchText.value.trim()
    if (val) {
      const newVal = [...localValue.value, val]
      localValue.value = newVal
      save(newVal)
      searchText.value = ''
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
    density="comfortable"
    class="text-h6"
    hide-details
    autocomplete="off"
    @update:model-value="handleUpdate"
    @keydown="handleKeydown"
  />
</template>
