<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue';
import { VTextarea, VList, VListItem, VListItemTitle, VListItemSubtitle, VChip } from 'vuetify/components';
import type { MappingInstance, ListValue } from '@/lib/db';
import { recordTokenUsage, getTokenUsageForPrefix } from '@/lib/db';
import { expandToken, findAllMatches } from '@/lib/patternMatcher';
import { scoreFrecency } from '@/lib/frecency';

interface Suggestion {
  kind: 'frecency' | 'mapping'
  rawInput: string
  mappingName: string | null
  expansion: string
}

const props = defineProps<{
  modelValue: string
  label: string
  onNext?: () => void
  onPrevious?: () => void
  required?: boolean
  mappings?: MappingInstance[]
  listValues?: ListValue[]
  halfLifeDays?: number
  maxSuggestions?: number
  debounceMs?: number
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>();

const textareaRef = ref<InstanceType<typeof VTextarea> | null>(null);
const wrapperRef = ref<HTMLElement | null>(null);

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

// ── Mode ──────────────────────────────────────────────────────────────────────

const shortcutMode = ref(true);

// ── Dropdown ──────────────────────────────────────────────────────────────────

const suggestions = ref<Suggestion[]>([]);
const selectedIndex = ref(-1);

const getTextarea = (): HTMLTextAreaElement | null =>
  textareaRef.value?.$el?.querySelector('textarea') ?? null;

const extractCurrentToken = (val: string, cursor: number): string => {
  const lastSpace = val.slice(0, cursor).lastIndexOf(' ');
  return val.slice(lastSpace + 1, cursor);
};

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const fetchSuggestions = (token: string) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (!token || !shortcutMode.value) { suggestions.value = []; return; }

  debounceTimer = setTimeout(async () => {
    const halfLife = props.halfLifeDays ?? 7;
    const max = props.maxSuggestions ?? 5;
    const windowDays = halfLife * 15; // fetch 15× half-lives of history

    const rows = await getTokenUsageForPrefix(token, windowDays);
    const scored = scoreFrecency(rows, halfLife);

    const frecencySet = new Set<string>();
    const frecency: Suggestion[] = scored.slice(0, max).map(s => {
      frecencySet.add(`${s.expansion}`);
      return { kind: 'frecency', rawInput: s.rawInput, mappingName: s.mappingName, expansion: s.expansion };
    });

    // Mapping name-contains fallback for remaining slots
    const remaining = max - frecency.length;
    const fallback: Suggestion[] = remaining > 0
      ? (props.mappings ?? [])
          .filter(m => m.enabled && m.name.toLowerCase().includes(token.toLowerCase()))
          .filter(m => !frecencySet.has(m.expansion))
          .slice(0, remaining)
          .map(m => ({ kind: 'mapping', rawInput: token, mappingName: m.name, expansion: m.expansion }))
      : [];

    suggestions.value = [...frecency, ...fallback];
    selectedIndex.value = -1;
  }, props.debounceMs ?? 80);
};

const clearDropdown = () => {
  suggestions.value = [];
  selectedIndex.value = -1;
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
};

onUnmounted(() => { if (debounceTimer) clearTimeout(debounceTimer); });

// ── Suggestion acceptance ─────────────────────────────────────────────────────

const acceptSuggestion = async (suggestion: Suggestion) => {
  const textarea = getTextarea();
  if (!textarea) return;

  const val = textarea.value;
  const cursor = textarea.selectionStart;
  const before = val.slice(0, cursor);
  const lastSpace = before.lastIndexOf(' ');
  const prefix = before.slice(0, lastSpace + 1);
  const after = val.slice(cursor);

  value.value = prefix + suggestion.expansion + ' ' + after;
  await recordTokenUsage(suggestion.rawInput, suggestion.mappingName, suggestion.expansion);

  clearDropdown();
  const newCursor = prefix.length + suggestion.expansion.length + 1;
  await nextTick();
  textarea.setSelectionRange(newCursor, newCursor);
};

// ── Input handler ─────────────────────────────────────────────────────────────

const capitalizeSentences = (text: string): string => {
  if (!text) return text;
  let out = text.replace(/([.!?]\s+)([a-z])/g, (_m, p1, p2) => p1 + p2.toUpperCase());
  if (out.length > 0 && /^[a-z]/.test(out)) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
};

const handleInput = async (event: Event): Promise<void> => {
  const textarea = event.target as HTMLTextAreaElement;
  if (!textarea) return;

  const val = textarea.value;
  const cursor = textarea.selectionStart;
  value.value = val;

  const textBeforeCursor = val.slice(0, cursor);

  // Expand token on space (shortcut mode only)
  if (shortcutMode.value && textBeforeCursor.endsWith(' ')) {
    const tokens = textBeforeCursor.trimEnd().split(/\s+/);
    const lastToken = tokens[tokens.length - 1];
    if (lastToken) {
      const mappings = props.mappings ?? [];
      const listValues = props.listValues ?? [];
      const expanded = expandToken(lastToken, mappings, listValues);
      if (expanded !== null) {
        const lengthToRemove = lastToken.length + 1;
        const before = textBeforeCursor.slice(0, -lengthToRemove);
        const after = val.slice(cursor);
        value.value = before + expanded + ' ' + after;
        // Record mapped usage
        const match = findAllMatches(lastToken, mappings, listValues)[0];
        await recordTokenUsage(lastToken, match?.mapping.name ?? null, expanded);
        clearDropdown();
        const newCursor = before.length + expanded.length + 1;
        await nextTick();
        textarea.setSelectionRange(newCursor, newCursor);
        return;
      } else {
        // Record unmapped token
        await recordTokenUsage(lastToken, null, lastToken);
      }
    }
    clearDropdown();
    return;
  }

  // Update dropdown for current token
  const token = extractCurrentToken(val, cursor);
  fetchSuggestions(token);
};

// ── Keyboard handler ──────────────────────────────────────────────────────────

const handleKeydown = async (e: KeyboardEvent) => {
  // Escape: close dropdown first; if already closed, toggle mode
  if (e.key === 'Escape') {
    if (suggestions.value.length > 0) {
      e.preventDefault();
      clearDropdown();
    } else {
      e.preventDefault();
      shortcutMode.value = !shortcutMode.value;
      if (!shortcutMode.value) clearDropdown();
    }
    return;
  }

  // Arrow navigation in dropdown
  if (suggestions.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex.value = Math.min(selectedIndex.value + 1, suggestions.value.length - 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex.value = Math.max(selectedIndex.value - 1, -1);
      return;
    }
    // Tab or Enter accepts selected (or first if none selected)
    if (e.key === 'Tab' && !e.shiftKey || e.key === 'Enter') {
      const idx = selectedIndex.value >= 0 ? selectedIndex.value : 0;
      if (suggestions.value[idx]) {
        e.preventDefault();
        await acceptSuggestion(suggestions.value[idx]);
        return;
      }
    }
  }

  // Normal field navigation
  if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
    e.preventDefault();
    clearDropdown();
    props.onNext?.();
  } else if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    clearDropdown();
    props.onPrevious?.();
  }
};

// ── Focus / blur ──────────────────────────────────────────────────────────────

const handleBlur = () => {
  // Delay so mousedown on a suggestion item fires before blur clears the list
  setTimeout(() => clearDropdown(), 150);
};

// ── Public API ────────────────────────────────────────────────────────────────

const focus = () => getTextarea()?.focus();

const capitalize = () => {
  if (!value.value) return;
  const capitalized = capitalizeSentences(value.value);
  if (capitalized !== value.value) value.value = capitalized;
};

defineExpose({ focus, capitalize });
</script>

<template>
  <div ref="wrapperRef" class="position-relative">
    <!-- Mode indicator -->
    <div class="d-flex align-center ga-1 mb-1" style="min-height: 18px">
      <template v-if="!shortcutMode">
        <span class="text-caption text-warning font-weight-medium">Manual mode — shortcuts off (Esc to re-enable)</span>
      </template>
    </div>

    <VTextarea
      ref="textareaRef"
      v-model="value"
      :label="label"
      variant="outlined"
      density="comfortable"
      class="text-h6"
      :class="{ 'manual-mode': !shortcutMode }"
      :rules="required ? [(v: string) => !!v || 'Required'] : []"
      hide-details
      auto-grow
      rows="5"
      spellcheck="true"
      @input="handleInput"
      @keydown="handleKeydown"
      @blur="handleBlur"
    />

    <!-- Autocomplete dropdown -->
    <div
      v-if="suggestions.length > 0 && shortcutMode"
      class="frecency-dropdown"
      style="position: absolute; top: 100%; left: 0; right: 0; z-index: 200; margin-top: 2px"
      @mousedown.prevent
    >
      <VList density="compact" elevation="4" rounded="lg" bg-color="surface">
        <VListItem
          v-for="(s, i) in suggestions"
          :key="i"
          :active="i === selectedIndex"
          active-color="primary"
          style="cursor: pointer"
          @click="acceptSuggestion(s)"
        >
          <VListItemTitle class="text-body-2 font-weight-medium">{{ s.expansion }}</VListItemTitle>
          <VListItemSubtitle class="text-caption">
            <span class="text-disabled">{{ s.rawInput }}</span>
            <span v-if="s.mappingName" class="text-disabled"> · {{ s.mappingName }}</span>
          </VListItemSubtitle>
          <template #append>
            <VChip v-if="s.kind === 'frecency'" size="x-small" color="primary" variant="tonal">recent</VChip>
          </template>
        </VListItem>
      </VList>
    </div>
  </div>
</template>

<style scoped>
.manual-mode :deep(fieldset) {
  border-color: rgb(var(--v-theme-warning)) !important;
}
</style>
