<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { VTextField, VMenu, VList, VListItem, VListItemTitle } from 'vuetify/components'

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

const fieldRef = ref<InstanceType<typeof VTextField> | null>(null)
const menuOpen = ref(false)
const highlightIndex = ref(-1)
const isInternalUpdate = ref(false)
const rawText = ref('')

const getNativeInput = (): HTMLInputElement | null =>
  fieldRef.value?.$el?.querySelector('input') ?? null

// Sync from parent → display text
watch(() => props.modelValue, (val) => {
  if (!isInternalUpdate.value) {
    rawText.value = val?.filter(Boolean).join(', ') ?? ''
  }
  isInternalUpdate.value = false
}, { immediate: true })

const focus = async () => {
  await nextTick()
  const input = getNativeInput()
  if (!input) return
  input.focus()
  if (props.autoSelect !== false) {
    await nextTick()
    input.select()
  }
}
defineExpose({ focus })

function getTokens(): string[] {
  return rawText.value.split(',').map(t => t.trim()).filter(Boolean)
}

function save() {
  isInternalUpdate.value = true
  emit('update:modelValue', getTokens())
}

// The token the user is currently typing = last comma-segment
const currentToken = computed(() => {
  const parts = rawText.value.split(',')
  return parts[parts.length - 1].trim()
})

// Already-accepted tokens (all but the last)
const committedTokens = computed(() =>
  rawText.value.split(',').slice(0, -1).map(t => t.trim().toLowerCase())
)

const filteredSuggestions = computed(() => {
  if (!props.suggestions?.length) return []
  const token = currentToken.value.toLowerCase()
  return props.suggestions
    .filter(s => s.toLowerCase().startsWith(token) && !committedTokens.value.includes(s.toLowerCase()))
    .slice(0, 8)
})

// Auto-show/hide dropdown as suggestions change
watch(filteredSuggestions, (suggs) => {
  if (suggs.length > 0) {
    menuOpen.value = true
    highlightIndex.value = -1
  } else {
    menuOpen.value = false
  }
})

function acceptSuggestion(s: string) {
  const parts = rawText.value.split(',')
  parts[parts.length - 1] = parts.length > 1 ? ` ${s}` : s
  rawText.value = parts.join(',')
  save()
  menuOpen.value = false
  nextTick(() => {
    const input = getNativeInput()
    if (!input) return
    input.focus()
    input.setSelectionRange(rawText.value.length, rawText.value.length)
  })
}

function handleTextUpdate(val: string) {
  rawText.value = val
  save()
}

function handleKeydown(e: KeyboardEvent) {
  if (menuOpen.value && filteredSuggestions.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      highlightIndex.value = Math.min(highlightIndex.value + 1, filteredSuggestions.value.length - 1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      highlightIndex.value = Math.max(highlightIndex.value - 1, 0)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      menuOpen.value = false
      return
    }
    if (e.key === 'Enter' && highlightIndex.value >= 0) {
      e.preventDefault()
      acceptSuggestion(filteredSuggestions.value[highlightIndex.value])
      return
    }
  }

  if (e.key === 'Enter') {
    e.preventDefault()
    save()
    props.onNext?.()
    return
  }

  if (e.key === 'Tab') {
    e.preventDefault()
    menuOpen.value = false
    save()
    if (e.shiftKey) props.onPrevious?.()
    else props.onNext?.()
  }
}

// Click inside the field: select the whole comma-segment the cursor lands in
function handleClick() {
  nextTick(() => {
    const input = getNativeInput()
    if (!input) return
    const cursor = input.selectionStart ?? 0
    let pos = 0
    const parts = rawText.value.split(',')
    for (let i = 0; i < parts.length; i++) {
      const segEnd = pos + parts[i].length
      if (cursor >= pos && cursor <= segEnd) {
        const leadingSpaces = parts[i].match(/^\s*/)?.[0].length ?? 0
        input.setSelectionRange(pos + leadingSpaces, segEnd)
        break
      }
      pos += parts[i].length + 1 // +1 for comma
    }
  })
}

function handleFocus() {
  if (filteredSuggestions.value.length > 0) menuOpen.value = true
}

function handleBlur() {
  // Delay to allow suggestion mousedown to fire before menu closes
  setTimeout(() => {
    menuOpen.value = false
    save()
  }, 150)
}
</script>

<template>
  <div>
    <VTextField
      ref="fieldRef"
      :model-value="rawText"
      :label="label"
      variant="outlined"
      density="comfortable"
      class="text-h6"
      hide-details
      spellcheck="true"
      autocomplete="off"
      @update:model-value="handleTextUpdate"
      @keydown="handleKeydown"
      @click="handleClick"
      @focus="handleFocus"
      @blur="handleBlur"
    />
    <VMenu
      v-model="menuOpen"
      activator="parent"
      :close-on-content-click="false"
      :close-on-back="false"
      location="bottom start"
      :offset="2"
      content-class="elevation-4"
    >
      <VList density="compact" style="min-width: 180px; max-width: 420px">
        <VListItem
          v-for="(s, i) in filteredSuggestions"
          :key="s"
          :active="i === highlightIndex"
          @mousedown.prevent="acceptSuggestion(s)"
        >
          <VListItemTitle>{{ s }}</VListItemTitle>
        </VListItem>
      </VList>
    </VMenu>
  </div>
</template>
