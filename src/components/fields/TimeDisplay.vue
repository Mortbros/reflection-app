<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { VTextField } from 'vuetify/components';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const inputRef = ref<InstanceType<typeof VTextField> | null>(null);

const updateTime = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timeString = `${hours}:${minutes}:${seconds}`;
  emit('update:modelValue', timeString);
};

let intervalId: number | null = null;

onMounted(() => {
  updateTime();
  intervalId = window.setInterval(updateTime, 1000);
});

onUnmounted(() => {
  if (intervalId !== null) {
    clearInterval(intervalId);
  }
});

const focus = () => {
  // Time display is read-only, so focus doesn't do anything
};
</script>

<template>
  <VTextField ref="inputRef" :model-value="modelValue" label="Time" variant="outlined"
    hide-details readonly disabled tabindex="-1" />
</template>
