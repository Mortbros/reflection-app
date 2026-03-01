<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { VTextarea } from 'vuetify/components';
import { mappings } from '@/assets/mappings';
import { nameMappings } from '@/assets/nameMappings';
import { matchPattern, expandValue } from '@/lib/patternMatcher';

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

const textareaRef = ref<InstanceType<typeof VTextarea> | null>(null);

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

// Capitalize sentences after pattern matching
const capitalizeSentences = (text: string): string => {
  if (!text) return text;
  let capitalized = text;
  capitalized = capitalized.replace(/([.!?]\s+)([a-z])/g, (match, p1, p2) => {
    return p1 + p2.toUpperCase();
  });
  if (capitalized.length > 0 && /^[a-z]/.test(capitalized)) {
    capitalized = capitalized.charAt(0).toUpperCase() + capitalized.slice(1);
  }
  return capitalized;
};

const focus = () => {
  const textarea = textareaRef.value?.$el.querySelector('textarea');
  if (textarea) {
    textarea.focus();
    // Don't auto-select for happened field
  }
};

const capitalize = () => {
  if (!value.value) return;
  const capitalized = capitalizeSentences(value.value);
  if (capitalized !== value.value) {
    value.value = capitalized;
  }
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

const handleInput = async (event: any): Promise<void> => {
  const textarea = event.target as HTMLTextAreaElement;
  if (!textarea) return;

  const val = textarea.value;
  const cursorPosition = textarea.selectionStart;

  value.value = val;

  const textBeforeCursor = val.slice(0, cursorPosition);

  if (textBeforeCursor.endsWith(' ')) {
    const tokens = textBeforeCursor.trimEnd().split(/\s+/);
    const lastWord = tokens[tokens.length - 1];
    if (!lastWord) return;

    let matchFound = false;
    let replacementText = "";
    let matchedKeyText = "";

    for (const rule of mappings.value) {
      const key = rule.key.trim();
      if (!key) continue;

      const hasNameSlot = key.includes('<p,>') || key.includes('<p>');

      if (hasNameSlot) {
        const matchResult = matchPattern(lastWord, key, nameMappings.value);
        if (matchResult.matched) {
          matchFound = true;
          replacementText = expandValue(rule.value, matchResult.matchedNames);
          matchedKeyText = lastWord;
          break;
        }
        continue;
      }

      const isRegex = key.startsWith('/') && key.lastIndexOf('/') > 0;

      if (isRegex) {
        try {
          const pattern = key.slice(1, key.lastIndexOf('/'));
          const flags = key.slice(key.lastIndexOf('/') + 1);
          const regex = new RegExp(`^${pattern}$`, flags);

          if (regex.test(lastWord)) {
            matchFound = true;
            replacementText = rule.value;
            matchedKeyText = lastWord;
            break;
          }
        } catch (e) {
          console.error("Invalid Regex pattern:", key);
        }
      } else if (key === lastWord) {
        matchFound = true;
        replacementText = rule.value;
        matchedKeyText = key;
        break;
      }
    }

    if (matchFound) {
      const lengthToRemove = matchedKeyText.length + 1;
      const textBeforeTarget = textBeforeCursor.slice(0, -lengthToRemove);
      const textAfterCursor = val.slice(cursorPosition);

      let newValue = textBeforeTarget + replacementText + " " + textAfterCursor;
      const newCursorPos = textBeforeTarget.length + replacementText.length + 1;

      value.value = newValue;
      await nextTick();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }
  }

};
</script>

<template>
  <VTextarea ref="textareaRef" v-model="value" :label="label" variant="outlined" density="comfortable" class="text-h6"
    :rules="required ? [(v: string) => !!v || 'Required'] : []" hide-details auto-grow rows="5" spellcheck="true"
    @input="handleInput" @keydown="handleTextareaKeydown" />
</template>
