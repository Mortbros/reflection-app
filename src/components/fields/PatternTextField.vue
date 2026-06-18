<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { VTextarea, VList, VListItem, VListItemTitle, VListItemSubtitle, VChip } from 'vuetify/components';
import getCaretCoordinates from 'textarea-caret';
import type { MappingInstance, ListValue } from '@/lib/db';
import { findAllMatches, expandToken } from '@/lib/patternMatcher';
import { scoreFrecency } from '@/lib/frecency';
import type { TokenUsageRow, FrecencySuggestion } from '@/lib/frecency';

interface Suggestion {
  /** pattern = full match; mapping = fully-resolved prefix candidate; hint = partially-resolved (informational only); frecency = history */
  kind: 'pattern' | 'mapping' | 'hint' | 'frecency'
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
  tokenUsage?: TokenUsageRow[]
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'usage-recorded': [entry: { rawInput: string; mappingName: string | null; expansion: string }]
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
const currentToken = ref('');

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

// ── Highlight ─────────────────────────────────────────────────────────────────

const escHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Wraps the first occurrence of `query` in `text` with <u> tags (case-insensitive). */
const highlight = (text: string, query: string): string => {
  if (!query) return escHtml(text);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escHtml(text);
  return (
    escHtml(text.slice(0, idx)) +
    '<u>' + escHtml(text.slice(idx, idx + query.length)) + '</u>' +
    escHtml(text.slice(idx + query.length))
  );
};

// ── Pattern prefix resolution ─────────────────────────────────────────────────

/**
 * Greedily resolves pattern slots from the typed token, in order.
 * Returns the best expansion displayable from the current token prefix,
 * replacing any unresolved slots with '…'.
 *
 * Returns null if not even the first slot could be matched.
 *
 * Examples with pattern `<perso><transport>mt`, expansion `<perso> <transport> me to`:
 *   token "i"  → {resolved: "Izzy … me to",      complete: false}
 *   token "id" → {resolved: "Izzy drove me to",   complete: true}  (if "d"=drove resolves)
 *   token "i"  → {resolved: "Izzy … me to",       complete: false} (hint only)
 */
const resolveFromToken = (
  patternName: string,
  expansion: string,
  token: string,
  lvList: ListValue[],
): { resolved: string; complete: boolean } | null => {
  let remaining = token.toLowerCase();
  let result = expansion;
  let nameRest = patternName;

  while (nameRest.length > 0) {
    const slotMatch = nameRest.match(/^(.*?)<(\w+)(,?)>(.*)/s);
    if (!slotMatch) break; // only literal text left in pattern

    const [, literalBefore, typeId, isMultiple, afterSlot] = slotMatch;

    // Consume the literal prefix portion from the typed token
    if (literalBefore) {
      const litL = literalBefore.toLowerCase();
      if (remaining.startsWith(litL)) {
        remaining = remaining.slice(litL.length);
      } else if (litL.startsWith(remaining)) {
        break; // token is a partial prefix of the literal — no more slots to resolve
      } else {
        return null; // literal mismatch
      }
    }

    if (remaining.length === 0) break; // token fully consumed, remaining slots unresolved

    // Try to match the next list value abbreviation
    const slotTag = isMultiple ? `<${typeId},>` : `<${typeId}>`;
    const typeValues = lvList
      .filter(lv => lv.type_id === typeId && lv.enabled && lv.abbreviation)
      .sort((a, b) => (b.abbreviation?.length ?? 0) - (a.abbreviation?.length ?? 0)); // prefer longer abbrevs

    let matched = false;
    for (const lv of typeValues) {
      if (remaining.startsWith(lv.abbreviation!.toLowerCase())) {
        result = result.replace(slotTag, lv.value);
        remaining = remaining.slice(lv.abbreviation!.length);
        nameRest = afterSlot;
        matched = true;
        break;
      }
    }
    if (!matched) break;
  }

  if (result === expansion) return null; // nothing was resolved

  const stillHasSlots = /<\w+,?>/.test(result);
  return {
    resolved: result.replace(/<\w+,?>/g, '…'),
    complete: !stillHasSlots,
  };
};

/**
 * For each pattern mapping, tries to resolve as many slots as possible from
 * the typed token. Fully-resolved results are 'mapping' (acceptable);
 * partially-resolved are 'hint' (informational, not inserted on accept).
 */
const genPatternPrefixCandidates = (
  token: string,
  mappingList: MappingInstance[],
  lvList: ListValue[],
): Array<{ mappingName: string; expansion: string; complete: boolean }> => {
  if (!token) return [];
  const lower = token.toLowerCase();
  const seen = new Set<string>();
  const results: Array<{ mappingName: string; expansion: string; complete: boolean }> = [];

  for (const m of mappingList) {
    if (!m.enabled) continue;
    const name = m.name.trim();
    if (!name.includes('<')) continue;

    // Quick gate: check if the typed token could be a prefix of any candidate
    // by matching against the first slot's possible abbreviations
    const firstSlot = name.match(/^(.*?)<(\w+)(,?)>/);
    if (!firstSlot) continue;
    const [, literalBefore, typeId] = firstSlot;
    const typeValues = lvList.filter(lv => lv.type_id === typeId && lv.enabled && lv.abbreviation);

    let hasCandidate = false;
    for (const lv of typeValues) {
      const candidateStart = (literalBefore + lv.abbreviation!).toLowerCase();
      if (lower.startsWith(candidateStart) || candidateStart.startsWith(lower)) {
        hasCandidate = true;
        break;
      }
    }
    if (!hasCandidate) continue;

    // Resolve as many slots as possible from the token
    const resolution = resolveFromToken(name, m.expansion, lower, lvList);
    if (!resolution) continue;

    if (!seen.has(resolution.resolved)) {
      seen.add(resolution.resolved);
      results.push({ mappingName: m.name, expansion: resolution.resolved, complete: resolution.complete });
    }
  }
  return results;
};

// ── Ranking ───────────────────────────────────────────────────────────────────

/**
 * Tiers (higher = better). Only shortcut names and pattern slot prefixes
 * are matched — expansion text is never used as a match source.
 *
 *   500   exact pattern match for full token (findAllMatches)
 *   400   literal mapping name starts with token (no slots in name)
 *   300   pattern prefix candidate, fully resolved from token
 *   280   pattern prefix candidate, partially resolved (hint — shown but not inserted)
 *   200+  frecency: raw_input starts with token (+ recency bonus, cap 90)
 */
const rankSuggestions = (
  token: string,
  frecency: FrecencySuggestion[],
  mappingList: MappingInstance[],
  lvList: ListValue[],
  max: number,
): Suggestion[] => {
  const lower = token.toLowerCase();
  type Ranked = Suggestion & { rank: number };
  const ranked: Ranked[] = [];
  const seen = new Set<string>();

  const add = (s: Suggestion, rank: number) => {
    if (!seen.has(s.expansion)) { seen.add(s.expansion); ranked.push({ ...s, rank }); }
  };

  // Tier 1: exact pattern match (full token resolves a pattern)
  for (const { mapping, expansion } of findAllMatches(token, mappingList, lvList)) {
    add({ kind: 'pattern', rawInput: token, mappingName: mapping.name, expansion }, 500);
  }

  // Tier 2: literal mapping name starts with typed token
  for (const m of mappingList) {
    if (!m.enabled || m.name.includes('<')) continue;
    if (m.name.toLowerCase().startsWith(lower)) {
      add({ kind: 'mapping', rawInput: token, mappingName: m.name, expansion: m.expansion }, 400);
    }
  }

  // Tier 3: pattern prefix candidates (greedy slot resolution from typed token)
  for (const { mappingName, expansion, complete } of genPatternPrefixCandidates(token, mappingList, lvList)) {
    add(
      { kind: complete ? 'mapping' : 'hint', rawInput: token, mappingName, expansion },
      complete ? 300 : 280,
    );
  }

  // Tier 4: frecency fallback — raw_input starts with typed token
  for (const f of frecency) {
    if (f.rawInput.toLowerCase().startsWith(lower)) {
      const bonus = Math.min(f.score * 10, 90);
      add({ kind: 'frecency', rawInput: f.rawInput, mappingName: f.mappingName, expansion: f.expansion }, 200 + bonus);
    }
  }

  return ranked.sort((a, b) => b.rank - a.rank).slice(0, max);
};

// ── Fetch suggestions (synchronous — data pre-loaded by parent) ───────────────

const fetchSuggestions = (token: string) => {
  if (!token || !shortcutMode.value) { suggestions.value = []; return; }

  const halfLife = props.halfLifeDays ?? 7;
  const max = props.maxSuggestions ?? 5;
  const windowDays = halfLife * 15;
  const cutoff = Date.now() - windowDays * 86_400_000;

  const rows = (props.tokenUsage ?? []).filter(
    r => new Date(r.used_at).getTime() >= cutoff
  );
  const scored = scoreFrecency(rows, halfLife);

  suggestions.value = rankSuggestions(token, scored, props.mappings ?? [], props.listValues ?? [], max);
  selectedIndex.value = -1;
};

const clearDropdown = () => {
  suggestions.value = [];
  selectedIndex.value = -1;
  dropdownPos.value = null;
};

// ── Accept suggestion ─────────────────────────────────────────────────────────

const isAcceptable = (s: Suggestion) => s.kind !== 'hint';

const acceptSuggestion = async (suggestion: Suggestion) => {
  if (!isAcceptable(suggestion)) return;

  const textarea = getTextarea();
  if (!textarea) return;

  const val = textarea.value;
  const cursor = textarea.selectionStart;
  const before = val.slice(0, cursor);
  const lastSpace = before.lastIndexOf(' ');
  const prefix = before.slice(0, lastSpace + 1);
  const after = val.slice(cursor);

  value.value = prefix + suggestion.expansion + ' ' + after;

  emit('usage-recorded', {
    rawInput: suggestion.rawInput,
    mappingName: suggestion.mappingName,
    expansion: suggestion.expansion,
  });

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

  // Expand token on space (shortcut mode only)
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
  currentToken.value = token;
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
      // Find first acceptable suggestion (skip hints)
      const idx = selectedIndex.value >= 0 ? selectedIndex.value : 0;
      const target = suggestions.value[idx];
      if (target && isAcceptable(target)) {
        e.preventDefault();
        await acceptSuggestion(target);
        return;
      }
      // If selected is a hint, just close
      if (target && !isAcceptable(target)) {
        e.preventDefault();
        clearDropdown();
        return;
      }
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
          color="primary"
          :style="{ cursor: s.kind === 'hint' ? 'default' : 'pointer', opacity: s.kind === 'hint' ? 0.6 : 1 }"
          @click="acceptSuggestion(s)"
        >
          <!-- eslint-disable-next-line vue/no-v-html -->
          <VListItemTitle
            class="text-body-2"
            :class="{ 'font-italic': s.kind === 'hint' }"
            v-html="s.kind === 'pattern' ? escHtml(s.expansion) : highlight(s.expansion, currentToken)"
          />
          <VListItemSubtitle v-if="s.mappingName" class="text-caption text-disabled">
            {{ s.mappingName }}
          </VListItemSubtitle>
          <template #append>
            <VChip v-if="s.kind === 'frecency'" size="x-small" color="primary" variant="tonal">recent</VChip>
            <VChip v-else-if="s.kind === 'pattern'" size="x-small" color="success" variant="tonal">match</VChip>
            <VChip v-else-if="s.kind === 'hint'" size="x-small" color="secondary" variant="tonal">keep typing</VChip>
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
