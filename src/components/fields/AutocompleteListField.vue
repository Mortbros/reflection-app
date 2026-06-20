<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { VCombobox } from 'vuetify/components';
import { focusInput } from '@/lib/fieldUtils';

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

const inputRefs = ref<(InstanceType<typeof VCombobox> | null)[]>([]);
// One input per value; one empty input when list is empty so the field is usable
const localItems = ref<string[]>(['']);
const isInternalUpdate = ref(false);

const focus = async () => {
  await nextTick();
  const input = inputRefs.value[0]?.$el?.querySelector('input') as HTMLInputElement | null;
  if (!input) return;
  input.focus();
  if (props.autoSelect !== false) { await nextTick(); input.select(); }
};
defineExpose({ focus });

// Sync from parent — no trailing empty added here (avoids the ghost field on reload)
watch(() => props.modelValue, (newVal) => {
  if (!isInternalUpdate.value) {
    localItems.value = newVal?.length ? [...newVal] : [''];
  }
  isInternalUpdate.value = false;
}, { immediate: true });

const saveAll = () => {
  const items = localItems.value.filter(v => v.trim() !== '');
  isInternalUpdate.value = true;
  emit('update:modelValue', items);
};

const updateItem = async (index: number, value: string) => {
  // Handle comma-separated paste
  if (value?.includes(',')) {
    const parts = value.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      const before = localItems.value.slice(0, index);
      const after = localItems.value.slice(index + 1);
      localItems.value = [...before, ...parts, ...after];
      saveAll();
      await nextTick();
      const focusIdx = index + parts.length - 1;
      if (inputRefs.value[focusIdx]) await focusInput(inputRefs.value[focusIdx], 'input', false);
      return;
    }
  }
  localItems.value[index] = value ?? '';
  saveAll();
};

const handleKeydown = async (e: KeyboardEvent, index: number) => {
  const isLast = index === localItems.value.length - 1;
  const currentVal = localItems.value[index]?.trim() ?? '';

  if (e.key === 'Tab' && e.shiftKey) {
    if (index === 0) { e.preventDefault(); saveAll(); props.onPrevious?.(); }
    return;
  }

  if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
    e.preventDefault();
    if (!isLast) {
      // Move to next input in list
      await nextTick();
      inputRefs.value[index + 1]?.$el?.querySelector('input')?.focus();
      return;
    }
    // On the last input
    if (currentVal) {
      // Commit value and open a new empty input below
      saveAll();
      localItems.value = [...localItems.value.filter((_, i) => i <= index), ''];
      await nextTick();
      await focusInput(inputRefs.value[localItems.value.length - 1], 'input', false);
    } else {
      // Last input is empty — advance to next form field
      saveAll();
      props.onNext?.();
    }
  }
};

const handleBlur = () => { saveAll(); };
</script>

<template>
  <div class="list-field">
    <div v-for="(_, index) in localItems" :key="index" :class="index > 0 ? 'mt-2' : ''">
      <VCombobox
        :ref="(el) => { if (el) inputRefs[index] = el as InstanceType<typeof VCombobox> }"
        :model-value="localItems[index]"
        :label="index === 0 ? label : ''"
        :placeholder="index > 0 ? 'Add another…' : undefined"
        :items="suggestions"
        variant="outlined"
        density="comfortable"
        class="text-h6"
        hide-details
        spellcheck="true"
        autocomplete="off"
        clearable
        @update:model-value="updateItem(index, $event)"
        @keydown="handleKeydown($event, index)"
        @blur="handleBlur"
      />
    </div>
  </div>
</template>
