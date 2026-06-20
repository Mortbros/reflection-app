<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { VCombobox, VChip } from 'vuetify/components';

const props = defineProps<{
  modelValue: string[];
  label: string;
  suggestions: string[];
  onNext?: () => void;
  onPrevious?: () => void;
  required?: boolean;
  autoSelect?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const inputRef = ref<InstanceType<typeof VCombobox> | null>(null);
const pending = ref('');

// Only offer suggestions not already in the list
const availableSuggestions = computed(() =>
  props.suggestions.filter(s => !props.modelValue.includes(s))
);

const getInput = (): HTMLInputElement | null =>
  inputRef.value?.$el?.querySelector('input') ?? null;

const focus = async () => {
  await nextTick();
  const input = getInput();
  if (!input) return;
  input.focus();
  if (props.autoSelect !== false) {
    await nextTick();
    input.select();
  }
};
defineExpose({ focus });

const removeItem = (i: number) => {
  const next = [...props.modelValue];
  next.splice(i, 1);
  emit('update:modelValue', next);
};

/**
 * Commits whatever is in the pending input as one or more chips.
 * Handles comma-separated input ("a, b, c" → three chips).
 * Returns true if anything was committed.
 */
const commitPending = (): boolean => {
  const raw = String(pending.value ?? '').trim();
  if (!raw) return false;
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return false;
  emit('update:modelValue', [...props.modelValue, ...parts]);
  nextTick(() => { pending.value = ''; });
  return true;
};

const handleUpdate = (val: string | null) => {
  pending.value = val ?? '';
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    commitPending();
    props.onPrevious?.();
    return;
  }
  if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
    const committed = commitPending();
    e.preventDefault();
    if (!committed) {
      // Nothing to commit — advance to next field
      props.onNext?.();
    }
    // If something was committed, stay so user can add another item
  }
};

const handleBlur = () => { commitPending(); };
</script>

<template>
  <div>
    <!-- Committed items as chips -->
    <div v-if="modelValue.length" class="d-flex flex-wrap align-center ga-1 mb-1 px-1">
      <VChip
        v-for="(item, i) in modelValue"
        :key="i"
        size="small"
        closable
        variant="tonal"
        @click:close="removeItem(i)"
      >{{ item }}</VChip>
    </div>

    <!-- Input for adding new items -->
    <VCombobox
      ref="inputRef"
      :model-value="pending"
      :label="label"
      :placeholder="modelValue.length ? 'Add another…' : undefined"
      :items="availableSuggestions"
      variant="outlined"
      density="comfortable"
      class="text-h6"
      hide-details
      spellcheck="true"
      autocomplete="off"
      clearable
      @update:model-value="handleUpdate"
      @keydown="handleKeydown"
      @blur="handleBlur"
    />
  </div>
</template>
