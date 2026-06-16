<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { VTextarea } from 'vuetify/components';
import type { MappingInstance, ListValue } from '@/lib/db';
import { expandToken } from '@/lib/patternMatcher';

const props = defineProps<{
  modelValue: string;
  label: string;
  onNext?: () => void;
  onPrevious?: () => void;
  required?: boolean;
  mappings?: MappingInstance[];
  listValues?: ListValue[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const textareaRef = ref<InstanceType<typeof VTextarea> | null>(null);

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const capitalizeSentences = (text: string): string => {
  if (!text) return text;
  let out = text.replace(/([.!?]\s+)([a-z])/g, (_m, p1, p2) => p1 + p2.toUpperCase());
  if (out.length > 0 && /^[a-z]/.test(out)) {
    out = out.charAt(0).toUpperCase() + out.slice(1);
  }
  return out;
};

const focus = () => {
  const textarea = textareaRef.value?.$el.querySelector('textarea');
  textarea?.focus();
};

const capitalize = () => {
  if (!value.value) return;
  const capitalized = capitalizeSentences(value.value);
  if (capitalized !== value.value) value.value = capitalized;
};

defineExpose({ focus, capitalize });

const handleTextareaKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
    e.preventDefault();
    props.onNext?.();
  } else if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    props.onPrevious?.();
  }
};

const handleInput = async (event: Event): Promise<void> => {
  const textarea = event.target as HTMLTextAreaElement;
  if (!textarea) return;

  const val = textarea.value;
  const cursorPosition = textarea.selectionStart;

  value.value = val;

  const textBeforeCursor = val.slice(0, cursorPosition);
  if (!textBeforeCursor.endsWith(' ')) return;

  const tokens = textBeforeCursor.trimEnd().split(/\s+/);
  const lastToken = tokens[tokens.length - 1];
  if (!lastToken) return;

  const mappings = props.mappings ?? [];
  const listValues = props.listValues ?? [];

  const expanded = expandToken(lastToken, mappings, listValues);
  if (expanded === null) return;

  const lengthToRemove = lastToken.length + 1;
  const before = textBeforeCursor.slice(0, -lengthToRemove);
  const after = val.slice(cursorPosition);

  value.value = before + expanded + ' ' + after;
  const newCursor = before.length + expanded.length + 1;
  await nextTick();
  textarea.setSelectionRange(newCursor, newCursor);
};
</script>

<template>
  <VTextarea ref="textareaRef" v-model="value" :label="label" variant="outlined" density="comfortable" class="text-h6"
    :rules="required ? [(v: string) => !!v || 'Required'] : []" hide-details auto-grow rows="5" spellcheck="true"
    @input="handleInput" @keydown="handleTextareaKeydown" />
</template>
