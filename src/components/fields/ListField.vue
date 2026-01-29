<script setup lang="ts">
import { focusInput } from '@/lib/fieldUtils';
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
  if (inputRefs.value.length > 0 && inputRefs.value[0]) {
    await focusInput(inputRefs.value[0], 'input', props.autoSelect !== false);
  }
};

defineExpose({ focus });

watch(() => props.modelValue, (newVal) => {
  if (!isInternalUpdate.value) {
    if (!newVal || newVal.length === 0) {
      localItems.value = [''];
    } else {
      localItems.value = [...newVal, ''];
    }
  }
  isInternalUpdate.value = false;
}, { immediate: true });

const handleKeydown = async (event: KeyboardEvent, index: number) => {
  if (event.key === 'Enter' && event.ctrlKey) {
    event.preventDefault();
    const currentValue = localItems.value[index]?.trim() || '';
    const itemsToSave = localItems.value.slice(0, -1).filter(item => item.trim() !== '');
    if (currentValue) {
      itemsToSave.push(currentValue);
    }
    isInternalUpdate.value = true;
    emit('update:modelValue', itemsToSave);

    localItems.value = [...itemsToSave, ''];
    await nextTick();
    const newIndex = itemsToSave.length;
    if (inputRefs.value[newIndex]) {
      await focusInput(inputRefs.value[newIndex], 'input', false);
    }
  } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
    event.preventDefault();

    if (index < localItems.value.length - 1) {
      await nextTick();
      const nextRef = inputRefs.value[index + 1];
      if (nextRef?.$el) {
        nextRef.$el.querySelector('input')?.focus();
      }
    } else {
      const itemsToSave = localItems.value.slice(0, -1).filter(item => item.trim() !== '');
      isInternalUpdate.value = true;
      emit('update:modelValue', itemsToSave);
      props.onNext?.();
    }
  } else if (event.key === 'Enter' && event.shiftKey && index === 0) {
    event.preventDefault();
    props.onPrevious?.();
  }
};

const updateItem = async (index: number, value: string) => {
  // Check if value contains a comma
  if (value.includes(',')) {
    const parts = value.split(',').map(p => p.trim()).filter(p => p !== '');
    if (parts.length > 1) {
      // Split the current item and add new items
      const beforeItems = localItems.value.slice(0, index);
      const afterItems = localItems.value.slice(index + 1);
      const newItems = [...beforeItems, parts[0], ...parts.slice(1), ...afterItems];
      localItems.value = newItems;
      
      // Update model value
      const itemsToSave = localItems.value.filter((item, idx) => {
        if (idx === localItems.value.length - 1 && item.trim() === '') {
          return false;
        }
        return item.trim() !== '';
      });
      isInternalUpdate.value = true;
      emit('update:modelValue', itemsToSave);
      
      // Focus on the next field after the last added item
      await nextTick();
      const nextIndex = index + parts.length - 1;
      if (inputRefs.value[nextIndex]) {
        await focusInput(inputRefs.value[nextIndex], 'input', false);
      }
      return;
    }
  }
  
  if (index >= localItems.value.length) {
    localItems.value = [...localItems.value, ...Array(index - localItems.value.length + 1).fill('')];
  }
  localItems.value[index] = value;
  // Update model value (excluding the last empty field if it exists)
  const itemsToSave = localItems.value.filter((item, idx) => {
    if (idx === localItems.value.length - 1 && item.trim() === '') {
      return false; // Don't save the trailing empty field
    }
    return item.trim() !== '';
  });
  isInternalUpdate.value = true;
  emit('update:modelValue', itemsToSave);
};
</script>

<template>
  <div class="list-field">
    <div v-for="(item, index) in localItems" :key="index" class="mb-2">
      <VTextField :ref="(el) => { if (el) inputRefs[index] = el as InstanceType<typeof VTextField> }"
        :model-value="localItems[index]" :label="index === 0 ? label : ''" variant="outlined" density="comfortable"
        class="text-h6" hide-details spellcheck="true" @update:model-value="updateItem(index, $event)"
        @keydown="handleKeydown($event, index)" />
    </div>
  </div>
</template>
