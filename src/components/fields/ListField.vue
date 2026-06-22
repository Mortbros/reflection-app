<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { VTextField } from 'vuetify/components';

const props = defineProps<{
  modelValue: string[];
  label: string;
  onNext?: () => void;
  onPrevious?: () => void;
  required?: boolean;
  autoSelect?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const inputRefs = ref<(InstanceType<typeof VTextField> | null)[]>([]);
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

// No trailing empty on init — avoids ghost field on reload
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
  // ', ' (comma-space) splits the current input and opens the next field
  if (value?.includes(', ')) {
    const parts = value.split(', ');
    const current = parts[0].trim();
    const rest = parts.slice(1).map(p => p.trim());
    localItems.value[index] = current;
    localItems.value.splice(index + 1, 0, ...rest);
    saveAll();
    await nextTick();
    const focusIdx = index + rest.length;
    const target = inputRefs.value[focusIdx]?.$el?.querySelector('input') as HTMLInputElement | null;
    if (target) { target.focus(); target.select(); }
    return;
  }
  if (index >= localItems.value.length) {
    localItems.value = [...localItems.value, ...Array(index - localItems.value.length + 1).fill('')];
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
      await nextTick();
      inputRefs.value[index + 1]?.$el?.querySelector('input')?.focus();
      return;
    }
    if (currentVal) {
      // Last input has a value — open a new empty input below
      saveAll();
      localItems.value = [...localItems.value, ''];
      await nextTick();
      inputRefs.value[localItems.value.length - 1]?.$el?.querySelector('input')?.focus();
    } else {
      // Last input is empty — advance to next form field
      saveAll();
      props.onNext?.();
    }
  }
};

const handleBlur = () => { saveAll(); };

// Select all text whenever any input gains focus
const handleFocusIn = (e: FocusEvent) => {
  const input = e.target as HTMLInputElement;
  if (input.tagName === 'INPUT') input.select();
};
</script>

<template>
  <div class="list-field" @focusin="handleFocusIn">
    <div v-for="(_, index) in localItems" :key="index" :class="index > 0 ? 'mt-2' : ''">
      <VTextField
        :ref="(el) => { if (el) inputRefs[index] = el as InstanceType<typeof VTextField> }"
        :model-value="localItems[index]"
        :label="index === 0 ? label : ''"
        :placeholder="index > 0 ? 'Add another…' : undefined"
        variant="outlined"
        density="comfortable"
        class="text-h6"
        hide-details
        spellcheck="true"
        @update:model-value="updateItem(index, $event)"
        @keydown="handleKeydown($event, index)"
        @blur="handleBlur"
      />
    </div>
  </div>
</template>
