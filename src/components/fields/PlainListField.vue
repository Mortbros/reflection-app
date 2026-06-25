<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { VTextField } from 'vuetify/components'

const props = defineProps<{
  modelValue: string[]
  label: string
  onNext?: () => void
  onPrevious?: () => void
  required?: boolean
  autoSelect?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const inputRef = ref<InstanceType<typeof VTextField> | null>(null)
const isInternalUpdate = ref(false)
const text = ref('')

watch(() => props.modelValue, (val) => {
  if (!isInternalUpdate.value) {
    text.value = val?.filter(Boolean).join(', ') ?? ''
  }
  isInternalUpdate.value = false
}, { immediate: true })

const focus = async () => {
  await nextTick()
  const input = inputRef.value?.$el?.querySelector('input') as HTMLInputElement | null
  if (!input) return
  input.focus()
  if (props.autoSelect !== false) {
    await nextTick()
    input.select()
  }
}
defineExpose({ focus })

function save() {
  isInternalUpdate.value = true
  emit('update:modelValue', text.value.split(',').map(t => t.trim()).filter(Boolean))
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    save()
    props.onNext?.()
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    save()
    if (e.shiftKey) props.onPrevious?.()
    else props.onNext?.()
  }
}

function handleBlur() { save() }

function handleFocusIn() {
  const input = inputRef.value?.$el?.querySelector('input') as HTMLInputElement | null
  if (input && props.autoSelect !== false) input.select()
}
</script>

<template>
  <VTextField
    ref="inputRef"
    v-model="text"
    :label="label"
    variant="outlined"
    hide-details
    spellcheck="true"
    autocomplete="off"
    @keydown="handleKeydown"
    @blur="handleBlur"
    @focus="handleFocusIn"
  />
</template>
