<script setup lang="ts">
import { ref, computed } from 'vue';
import { VTextField } from 'vuetify/components';
import { focusInput } from '@/lib/fieldUtils';

const props = defineProps<{
  modelValue: number | string;
  label: string;
  max?: number;
  onNext?: () => void;
  onPrevious?: () => void;
  required?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: number];
}>();

const inputRef = ref<InstanceType<typeof VTextField> | null>(null);

const stringValue = computed({
  get: () => {
    if (props.modelValue === null || props.modelValue === undefined || props.modelValue === '') {
      return '';
    }
    return String(props.modelValue);
  },
  set: (val) => {
    const num = parseInt(val, 10);
    if (!isNaN(num)) {
      const clamped = props.max !== undefined ? Math.min(Math.max(0, num), props.max) : num;
      emit('update:modelValue', clamped);
    } else if (val === '') {
      emit('update:modelValue', 0);
    }
  }
});

const focus = async () => {
  await focusInput(inputRef.value);
};

const handleKeydown = (event: KeyboardEvent) => {
  if ((event.key === 'Enter' && !event.shiftKey) || (event.key === 'Tab' && !event.shiftKey)) {
    event.preventDefault();
    props.onNext?.();
  } else if (event.key === 'Tab' && event.shiftKey) {
    event.preventDefault();
    props.onPrevious?.();
  }
};

// Handle blur event to ensure validation happens when user clicks away
const handleBlur = () => {
  // Trigger validation by updating the model value with the current value
  const num = parseInt(stringValue.value, 10);
  if (!isNaN(num)) {
    const clamped = props.max !== undefined ? Math.min(Math.max(0, num), props.max) : num;
    emit('update:modelValue', clamped);
  } else if (stringValue.value === '') {
    emit('update:modelValue', 0);
  }
};

defineExpose({ focus });
</script>

<template>
  <VTextField ref="inputRef" v-model="stringValue" :label="label" type="number" :min="1" :max="max" variant="outlined"
    density="comfortable" class="text-h6"
    :rules="required ? [(v: string) => (v !== '' && parseInt(v, 10) >= 1) || 'Must be at least 1'] : []" hide-details
    @keydown="handleKeydown" @blur="handleBlur" />
</template>
