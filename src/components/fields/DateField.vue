<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { VTextField } from 'vuetify/components';
import { focusInput, getTodayDate } from '@/lib/fieldUtils';

const props = defineProps<{
  modelValue: string;
  label: string;
  onPrevious?: () => void;
  required?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const inputRef = ref<InstanceType<typeof VTextField> | null>(null);

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const focus = () => {
  focusInput(inputRef.value);
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Tab' && event.shiftKey) {
    event.preventDefault();
    props.onPrevious?.();
  }
};

defineExpose({ focus });

onMounted(() => {
  if (!props.modelValue) {
    emit('update:modelValue', getTodayDate());
  }
});
</script>

<template>
  <VTextField ref="inputRef" v-model="value" :label="label" type="date" variant="outlined" density="comfortable"
    class="text-h6" :rules="required ? [(v: string) => !!v || 'Required'] : []" hide-details @keydown="handleKeydown" />
</template>
