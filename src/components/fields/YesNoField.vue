<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { VTextField } from 'vuetify/components';
import { focusInput } from '@/lib/fieldUtils';

const props = defineProps<{
  modelValue: string;
  label: string;
  onNext?: () => void;
  onPrevious?: () => void;
  required?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const inputRef = ref<InstanceType<typeof VTextField> | null>(null);

const value = computed({
  get: () => props.modelValue || 'N',
  set: (val) => emit('update:modelValue', val)
});

const focus = async () => {
  await focusInput(inputRef.value);
};

defineExpose({ focus });

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'y' || event.key === 'Y') {
    event.preventDefault();
    value.value = 'Y';
    props.onNext?.();
  } else if (event.key === 'n' || event.key === 'N') {
    event.preventDefault();
    value.value = 'N';
    props.onNext?.();
  } else if ((event.key === 'Enter' && !event.shiftKey) || (event.key === 'Tab' && !event.shiftKey)) {
    event.preventDefault();
    props.onNext?.();
  } else if (event.key === 'Tab' && event.shiftKey) {
    event.preventDefault();
    props.onPrevious?.();
  }
};

watch(() => props.modelValue, (newVal) => {
  if (!newVal) {
    value.value = 'N';
  }
}, { immediate: true });
</script>

<template>
  <VTextField ref="inputRef" v-model="value" :label="label" variant="outlined" density="comfortable" class="text-h6"
    :rules="required ? [(v: string) => !!v || 'Required'] : []" hide-details @keydown="handleKeydown" />
</template>
