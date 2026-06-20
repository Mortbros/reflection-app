<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { VCombobox } from 'vuetify/components';

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

// Sync from parent — no trailing empty so reloading doesn't show ghost fields
watch(() => props.modelValue, (newVal) => {
  if (!isInternalUpdate.value) {
    localItems.value = newVal?.length ? [...newVal] : [''];
  }
  isInternalUpdate.value = false;
}, { immediate: true });

const saveAll = () => {
  isInternalUpdate.value = true;
  emit('update:modelValue', localItems.value.filter(v => v.trim() !== ''));
};

const updateItem = async (index: number, value: string) => {
  // ", " (comma-space) splits the current input and creates the next field
  if (value?.includes(', ')) {
    const parts = value.split(', ');
    const current = parts[0].trim();
    const rest = parts.slice(1).map(p => p.trim()); // may include empty strings
    localItems.value[index] = current;
    localItems.value.splice(index + 1, 0, ...rest);
    saveAll();
    await nextTick();
    const focusIdx = index + rest.length;
    const target = inputRefs.value[focusIdx]?.$el?.querySelector('input') as HTMLInputElement | null;
    if (target) { target.focus(); target.select(); }
    return;
  }
  localItems.value[index] = value ?? '';
  saveAll();
};

const handleKeydown = async (e: KeyboardEvent, index: number) => {
  if (e.key === 'Tab' && e.shiftKey) {
    if (index === 0) { e.preventDefault(); saveAll(); props.onPrevious?.(); }
    return;
  }
  if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
    e.preventDefault();
    saveAll();
    if (index < localItems.value.length - 1) {
      await nextTick();
      inputRefs.value[index + 1]?.$el?.querySelector('input')?.focus();
    } else {
      props.onNext?.();
    }
  }
};

const handleBlur = () => { saveAll(); };

// Select all text whenever any input in this component gains focus
const handleFocusIn = (e: FocusEvent) => {
  const input = e.target as HTMLInputElement;
  if (input.tagName === 'INPUT') input.select();
};
</script>

<template>
  <div class="list-field" @focusin="handleFocusIn">
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
