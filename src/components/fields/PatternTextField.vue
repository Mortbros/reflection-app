<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue';
import { VTextarea, VList, VListItem, VListItemTitle, VListItemSubtitle, VChip } from 'vuetify/components';
import getCaretCoordinates from 'textarea-caret';
import type { MappingInstance, ListValue } from '@/lib/db';
import { recordTokenUsage, getTokenUsageForPrefix } from '@/lib/db';
import { expandToken } from '@/lib/patternMatcher';
import { scoreFrecency } from '@/lib/frecency';
import type { FrecencySuggestion } from '@/lib/frecency';

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
const dropdownPos = ref<{ top: number; left: number } | null>(null);

const getTextarea = (): HTMLTextAreaElement | null =>
  textareaRef.value?.$el?.querySelector('textarea') ?? null;

const extractCurrentToken = (val: string, cursor: number): string => {
  const lastSpace = val.slice(0, cursor).lastIndexOf(' ');
  return val.slice(lastSpace + 1, cursor);
};

const updateDropdownPos = () => {
  const textarea = getTextarea();
  if (!textarea || !wrapperRef.value) { dropdownPos.value = null; return; }
  try {
    const coords = getCaretCoordinates(textarea, textarea.selectionStart);
    const textareaRect = textarea.getBoundingClientRect();
    const wrapperRect = wrapperRef.value.getBoundingClientRect();
    dropdownPos.value = {
      top: (textareaRect.top - wrapperRect.top) + coords.top + coords.height - textarea.scrollTop,
      left: (textareaRect.left - wrapperRect.left) + coords.left,
    };
  } catch {
    dropdownPos.value = null;
  }
};

// ── Ranking ───────────────────────────────────────────────────────────────────

/**
 * Ranks suggestions by how well they match the token.
 * Tiers (higher = better):
 *   400+ expansion starts with token (frecency: +score bonus)
 *   350   expansion starts with token (mapping fallback)
 *   300+  raw_input/name starts with token (frecency: +score bonus)
 *   250   name starts with token (mapping fallback)
 *   200+  expansion contains token (frecency)
 *   150   expansion contains token (mapping)
 *   100+  raw_input/name contains token (frecency)
 *    50   name contains token (mapping)
 */
const rankSuggestions = (
  token: string,
  frecency: FrecencySuggestion[],
  mappingList: MappingInstance[],
  max: number,
): Suggestion[] => {
  const lower = token.toLowerCase();
  type Ranked = Suggestion & { rank: number };
  const ranked: Ranked[] = [];
  const seen = new Set<string>();

  const add = (s: Suggestion, rank: number) => {
    if (!seen.has(s.expansion)) { seen.add(s.expansion); ranked.push({ ...s, rank }); }
  };

  for (const f of frecency) {
    const expL = f.expansion.toLowerCase();
    const rawL = f.rawInput.toLowerCase();
    const bonus = Math.min(f.score * 10, 90); // cap bonus so tier order is preserved
    if (expL.startsWith(lower))       add({ kind: 'frecency', rawInput: f.rawInput, mappingName: f.mappingName, expansion: f.expansion }, 400 + bonus);
    else if (rawL.startsWith(lower))  add({ kind: 'frecency', rawInput: f.rawInput, mappingName: f.mappingName, expansion: f.expansion }, 300 + bonus);
    else if (expL.includes(lower))    add({ kind: 'frecency', rawInput: f.rawInput, mappingName: f.mappingName, expansion: f.expansion }, 200 + bonus);
    else if (rawL.includes(lower))    add({ kind: 'frecency', rawInput: f.rawInput, mappingName: f.mappingName, expansion: f.expansion }, 100 + bonus);
  }

  for (const m of mappingList) {
    if (!m.enabled) continue;
    const expL = m.expansion.toLowerCase();
    const nameL = m.name.toLowerCase();
    if (expL.startsWith(lower))       add({ kind: 'mapping', rawInput: token, mappingName: m.name, expansion: m.expansion }, 350);
    else if (nameL.startsWith(lower)) add({ kind: 'mapping', rawInput: token, mappingName: m.name, expansion: m.expansion }, 250);
    else if (expL.includes(lower))    add({ kind: 'mapping', rawInput: token, mappingName: m.name, expansion: m.expansion }, 150);
    else if (nameL.includes(lower))   add({ kind: 'mapping', rawInput: token, mappingName: m.name, expansion: m.expansion }, 50);
  }

  return ranked.sort((a, b) => b.rank - a.rank).slice(0, max);
};

// ── Fetch suggestions ─────────────────────────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const fetchSuggestions = (token: string) => {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (!token || !shortcutMode.value) { suggestions.value = []; return; }

  debounceTimer = setTimeout(async () => {
    const halfLife = props.halfLifeDays ?? 7;
    const max = props.maxSuggestions ?? 5;
    const windowDays = halfLife * 15;

    const rows = await getTokenUsageForPrefix(token, windowDays);
    const scored = scoreFrecency(rows, halfLife);

    suggestions.value = rankSuggestions(token, scored, props.mappings ?? [], max);
    selectedIndex.value = -1;
  }, props.debounceMs ?? 80);
};

const clearDropdown = () => {
  suggestions.value = [];
  selectedIndex.value = -1;
  dropdownPos.value = null;
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
};

onUnmounted(() => { if (debounceTimer) clearTimeout(debounceTimer); });

// ── Accept suggestion ─────────────────────────────────────────────────────────

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

  // Only record when the user explicitly accepts a suggestion from the dropdown
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

  // Expand token on space (shortcut mode only) — no recording here
  if (shortcutMode.value && val.slice(0, cursor).endsWith(' ')) {
    const tokens = val.slice(0, cursor).trimEnd().split(/\s+/);
    const lastToken = tokens[tokens.length - 1];
    if (lastToken) {
      const expanded = expandToken(lastToken, props.mappings ?? [], props.listValues ?? []);
      if (expanded !== null) {
        const before = val.slice(0, cursor - lastToken.length - 1);
        const after = val.slice(cursor);
        value.value = before + expanded + ' ' + after;
        clearDropdown();
        const newCursor = before.length + expanded.length + 1;
        await nextTick();
        textarea.setSelectionRange(newCursor, newCursor);
        return;
      }
    }
    clearDropdown();
    return;
  }

  // Update dropdown for current token
  const token = extractCurrentToken(val, cursor);
  if (token) {
    updateDropdownPos();
    fetchSuggestions(token);
  } else {
    clearDropdown();
  }
};

// ── Keyboard handler ──────────────────────────────────────────────────────────

const handleKeydown = async (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (suggestions.value.length > 0) {
      clearDropdown();
    } else {
      shortcutMode.value = !shortcutMode.value;
      clearDropdown();
    }
    return;
  }

  if (suggestions.value.length > 0) {
    if (e.key === 'ArrowDown') { e.preventDefault(); selectedIndex.value = Math.min(selectedIndex.value + 1, suggestions.value.length - 1); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); selectedIndex.value = Math.max(selectedIndex.value - 1, -1); return; }
    if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') {
      const idx = selectedIndex.value >= 0 ? selectedIndex.value : 0;
      if (suggestions.value[idx]) { e.preventDefault(); await acceptSuggestion(suggestions.value[idx]); return; }
    }
  }

  if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
    e.preventDefault(); clearDropdown(); props.onNext?.();
  } else if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault(); clearDropdown(); props.onPrevious?.();
  }
};

const handleBlur = () => { setTimeout(() => clearDropdown(), 150); };

// ── Public API ────────────────────────────────────────────────────────────────

const focus = () => getTextarea()?.focus();
const capitalize = () => {
  if (!value.value) return;
  const c = capitalizeSentences(value.value);
  if (c !== value.value) value.value = c;
};
defineExpose({ focus, capitalize });
</script>

<template>
  <div ref="wrapperRef" class="position-relative">
    <!-- Manual mode banner -->
    <div style="min-height: 20px" class="mb-1">
      <span v-if="!shortcutMode" class="text-caption text-warning font-weight-medium">
        Manual — shortcuts off (Esc to re-enable)
      </span>
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

    <!-- Cursor-anchored autocomplete dropdown -->
    <div
      v-if="suggestions.length > 0 && shortcutMode && dropdownPos"
      :style="{
        position: 'absolute',
        top: dropdownPos.top + 'px',
        left: dropdownPos.left + 'px',
        zIndex: 200,
        width: '340px',
        maxWidth: 'calc(100% - ' + dropdownPos.left + 'px)',
      }"
      @mousedown.prevent
    >
      <VList density="compact" elevation="8" rounded="lg" bg-color="surface">
        <VListItem
          v-for="(s, i) in suggestions"
          :key="i"
          :active="i === selectedIndex"
          active-color="primary"
          style="cursor: pointer"
          @click="acceptSuggestion(s)"
        >
          <VListItemTitle class="text-body-2">{{ s.expansion }}</VListItemTitle>
          <VListItemSubtitle v-if="s.mappingName" class="text-caption text-disabled">
            {{ s.mappingName }}
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
