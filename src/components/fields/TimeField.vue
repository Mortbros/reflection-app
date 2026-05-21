<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { VTextField } from 'vuetify/components';
import { focusInput } from '@/lib/fieldUtils';

const props = defineProps<{
  modelValue: string;
  label: string;
  defaultToFuture?: boolean;
  futureMinutes?: number;
  onNext?: () => void;
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

const focus = async () => {
  await focusInput(inputRef.value);
};

const formatTime = () => {
  if (!value.value) return;
  const timeMatch = value.value.match(/(\d{1,2}):?(\d{2})?/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1] || '0', 10);
    let minutes = parseInt(timeMatch[2] || '0', 10);

    if (hours > 23) hours = 23;
    if (minutes > 59) minutes = 59;

    const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    if (formatted !== value.value) {
      value.value = formatted;
    }
  }
};

const handleKeydown = (event: KeyboardEvent) => {
  if ((event.key === 'Enter' && !event.shiftKey) || (event.key === 'Tab' && !event.shiftKey)) {
    event.preventDefault();
    formatTime();
    props.onNext?.();
  } else if (event.key === 'Tab' && event.shiftKey) {
    event.preventDefault();
    formatTime();
    props.onPrevious?.();
  }
};

defineExpose({ focus });

onMounted(() => {
  if (!props.modelValue && props.defaultToFuture) {
    const now = new Date();

    const future = new Date(now.getTime() + (props.futureMinutes || 20) * 60000);
    const msIn10Mins = 10 * 60 * 1000;
    const roundedTime = Math.round(future.getTime() / msIn10Mins) * msIn10Mins;
    future.setTime(roundedTime);

    const hours = String(future.getHours()).padStart(2, '0');
    const minutes = String(future.getMinutes()).padStart(2, '0');

    // TODO: figure out why this doesn't work if only one set exists
    value.value = `${hours}:${minutes}`;
    value.value = `${hours}:${minutes}`;
    emit('update:modelValue', `${hours}:${minutes}`);
  }
});
</script>

<template>
  <VTextField ref="inputRef" v-model="value" :label="label" type="text" pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]"
    placeholder="HH:mm (24-hour)" variant="outlined" density="comfortable" class="text-h6"
    :rules="required ? [(v: string) => !!v || 'Required'] : []" tabindex="-1" hide-details @keydown="handleKeydown"
    @blur="formatTime" />
</template>
