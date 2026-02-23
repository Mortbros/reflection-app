<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { VContainer, VRow, VCol, VCard, VCardText, VBtn, VDivider, VChip, VIcon } from 'vuetify/components';
import DateField from '@/components/fields/DateField.vue';
import YesNoField from '@/components/fields/YesNoField.vue';
import TimeField from '@/components/fields/TimeField.vue';
import FloatField from '@/components/fields/FloatField.vue';
import IntField from '@/components/fields/IntField.vue';


import StringField from '@/components/fields/StringField.vue';
import ListField from '@/components/fields/ListField.vue';
import PatternTextField from '@/components/fields/PatternTextField.vue';
import TimeDisplay from '@/components/fields/TimeDisplay.vue';
import AutocompleteField from '@/components/fields/AutocompleteField.vue';
import AutocompleteListField from '@/components/fields/AutocompleteListField.vue';
import { exerciseSuggestions } from '@/assets/exerciseSuggestions';
import { musicSuggestions } from '@/assets/musicSuggestions';
import { phaseSuggestions } from '@/assets/phaseSuggestions';
import { gameSuggestions } from '@/assets/gameSuggestions';
import { getTodayDate, getYesterdayDate } from '@/lib/fieldUtils';

const STORAGE_KEY = 'daily_tracking_form_data';

// Form data
const formData = ref({
  date: '',
  bathe: 'N',
  wake: '',
  sleep: '',
  stress: 0,
  tired: 0,
  game: 'N',
  music: 'N',
  grateful: [] as string[],
  learn: [] as string[],
  exercise: '',
  remember: 0,
  dayRating: 0,
  feeling: 0,
  why: '',
  phase: [] as string[],
  happened: '',
  time: '',
  dayName: '',
  nap: 0
});

// Load from localStorage
const loadFormData = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Ensure arrays are properly initialized
      if (!parsed.grateful || !Array.isArray(parsed.grateful)) {
        parsed.grateful = [];
      }
      if (!parsed.learn || !Array.isArray(parsed.learn)) {
        parsed.learn = [];
      }
      if (!parsed.phase || !Array.isArray(parsed.phase)) {
        parsed.phase = [];
      }
      Object.assign(formData.value, parsed);
    }
  } catch (err) {
    console.error('Failed to load form data:', err);
  }
};

// Save to localStorage
const saveFormData = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData.value));
  } catch (err) {
    console.error('Failed to save form data:', err);
  }
};

// Watch form data and save on changes
watch(formData, () => {
  saveFormData();
}, { deep: true });

// Watch grateful array specifically to ensure it saves
watch(() => formData.value.grateful, () => {
  saveFormData();
}, { deep: true, immediate: false });

// Also watch learn and phase arrays
watch(() => formData.value.learn, () => {
  saveFormData();
}, { deep: true, immediate: false });

watch(() => formData.value.phase, () => {
  saveFormData();
}, { deep: true, immediate: false });

// Watch time field and set date to yesterday if time is between 00:00 and 12:00
watch(() => formData.value.time, (newTime) => {
  if (newTime) {
    const timeMatch = newTime.match(/(\d{1,2}):?(\d{2})?/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1] || '0', 10);
      if (hours >= 0 && hours < 12) {
        // Time is between 00:00 and 11:59, set date to yesterday
        formData.value.date = getYesterdayDate();
      }
    }
  }
});

const setDateToToday = () => {
  formData.value.date = getTodayDate();
};

const clearForm = () => {
  formData.value = {
    date: '',
    bathe: 'N',
    wake: '',
    sleep: '',
    stress: 0,
    tired: 0,
    game: 'N',
    music: 'N',
    grateful: [],
    learn: [],
    exercise: 'N',
    remember: 0,
    dayRating: 0,
    feeling: 0,
    why: '',
    phase: [],
    happened: '',
    time: '',
    dayName: '',
    nap: 0
  };
  setDateToToday();
  localStorage.removeItem(STORAGE_KEY);
  // Focus on bathe after clearing
  nextTick(() => {
    batheFieldRef.value?.focus();
  });
};

// Field refs for focus management
const dateFieldRef = ref<InstanceType<typeof DateField> | null>(null);
const batheFieldRef = ref<InstanceType<typeof YesNoField> | null>(null);
const wakeFieldRef = ref<InstanceType<typeof TimeField> | null>(null);
const sleepFieldRef = ref<InstanceType<typeof TimeField> | null>(null);
const stressFieldRef = ref<InstanceType<typeof FloatField> | null>(null);
const tiredFieldRef = ref<InstanceType<typeof FloatField> | null>(null);
const gameFieldRef = ref<InstanceType<typeof AutocompleteField> | null>(null);
const musicFieldRef = ref<InstanceType<typeof AutocompleteField> | null>(null);
const exerciseFieldRef = ref<InstanceType<typeof AutocompleteField> | null>(null);
const gratefulFieldRef = ref<InstanceType<typeof ListField> | null>(null);
const learnFieldRef = ref<InstanceType<typeof ListField> | null>(null);
const rememberFieldRef = ref<InstanceType<typeof FloatField> | null>(null);
const dayRatingFieldRef = ref<InstanceType<typeof FloatField> | null>(null);
const feelingFieldRef = ref<InstanceType<typeof IntField> | null>(null);
const whyFieldRef = ref<InstanceType<typeof StringField> | null>(null);
const phaseFieldRef = ref<InstanceType<typeof AutocompleteListField> | null>(null);
const happenedFieldRef = ref<InstanceType<typeof PatternTextField> | null>(null);
const timeDisplayRef = ref<InstanceType<typeof TimeDisplay> | null>(null);
const napFieldRef = ref<InstanceType<typeof TimeField> | null>(null);
const dayNameFieldRef = ref<InstanceType<typeof StringField> | null>(null);

const errorToFieldRef: Record<string, () => void> = {
  'Date': () => dateFieldRef.value?.focus(),
  'Bathe': () => batheFieldRef.value?.focus(),
  'Wake': () => wakeFieldRef.value?.focus(),
  'Sleep': () => sleepFieldRef.value?.focus(),
  'Stress': () => stressFieldRef.value?.focus(),
  'Tired': () => tiredFieldRef.value?.focus(),
  'Music': () => musicFieldRef.value?.focus(),
  'Grateful': () => gratefulFieldRef.value?.focus(),
  'Learn': () => learnFieldRef.value?.focus(),
  'Exercise': () => exerciseFieldRef.value?.focus(),
  'Remember': () => rememberFieldRef.value?.focus(),
  'Day rating': () => dayRatingFieldRef.value?.focus(),
  'Feeling': () => feelingFieldRef.value?.focus(),
  'Why': () => whyFieldRef.value?.focus(),
  'Phase': () => phaseFieldRef.value?.focus(),
  'Happened': () => happenedFieldRef.value?.focus()
};

const focusFieldByError = (errorLabel: string) => {
  const focusFn = errorToFieldRef[errorLabel];
  if (focusFn) {
    focusFn();
  }
};

const validationErrors = ref<string[]>([]);

const validateForm = () => {
  const errors: string[] = [];

  if (!formData.value.date) errors.push('Date');
  if (!formData.value.bathe) errors.push('Bathe');
  if (!formData.value.wake) errors.push('Wake');
  if (!formData.value.sleep) errors.push('Sleep');
  if (formData.value.stress < 1) errors.push('Stress');
  if (formData.value.tired < 1) errors.push('Tired');
  // Game is not required
  if (!formData.value.music) errors.push('Music');
  if (!formData.value.grateful || !Array.isArray(formData.value.grateful) || formData.value.grateful.length === 0) errors.push('Grateful');
  if (!formData.value.learn || !Array.isArray(formData.value.learn) || formData.value.learn.length === 0) errors.push('Learn');
  if (!formData.value.exercise) errors.push('Exercise');
  if (formData.value.remember < 1) errors.push('Remember');
  if (formData.value.dayRating < 1) errors.push('Day rating');
  if (formData.value.feeling < 1) errors.push('Feeling');
  if (!formData.value.why) errors.push('Why');
  if (!formData.value.phase || !Array.isArray(formData.value.phase) || formData.value.phase.length === 0) errors.push('Phase');
  if (!formData.value.happened) errors.push('Happened');

  validationErrors.value = errors;
};

// Watch form data for validation
watch(formData, () => {
  validateForm();
}, { deep: true, immediate: true });

// Focus order array
const focusOrder = [
  () => batheFieldRef.value?.focus(),
  () => wakeFieldRef.value?.focus(),
  () => sleepFieldRef.value?.focus(),
  () => napFieldRef.value?.focus(),
  () => stressFieldRef.value?.focus(),
  () => tiredFieldRef.value?.focus(),
  () => gameFieldRef.value?.focus(),
  () => musicFieldRef.value?.focus(),
  () => gratefulFieldRef.value?.focus(),
  () => learnFieldRef.value?.focus(),
  () => exerciseFieldRef.value?.focus(),
  () => rememberFieldRef.value?.focus(),
  () => dayRatingFieldRef.value?.focus(),
  () => feelingFieldRef.value?.focus(),
  () => whyFieldRef.value?.focus(),
  () => phaseFieldRef.value?.focus(),
  () => happenedFieldRef.value?.focus(),
  () => dayNameFieldRef.value?.focus()
];

const scrollToActiveElement = async () => {
  await nextTick();
  const activeElement = document.activeElement;
  if (activeElement) {
    activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
};

const moveToNextField = async (currentIndex: number) => {
  const nextIndex = currentIndex + 1;
  if (nextIndex < focusOrder.length) {
    await nextTick();
    const focusFn = focusOrder[nextIndex];
    if (focusFn) {
      focusFn();
      await scrollToActiveElement();
    }
  } else {
    // If we reach the end of the form, copy to clipboard
    copyToClipboard();
  }
};

const moveToPreviousField = async (currentIndex: number) => {
  const prevIndex = currentIndex - 1;
  if (prevIndex >= 0) {
    await nextTick();
    const focusFn = focusOrder[prevIndex];
    if (focusFn) {
      focusFn();
      await scrollToActiveElement();
    }
  }
};

// Copy to clipboard
const copySuccess = ref(false);
const sleepTimeMessage = ref('');
const copyToClipboard = async () => {
  // Check if sleep time is in the past and update it
  let sleepTime = formData.value.sleep;
  if (sleepTime) {
    const timeMatch = sleepTime.match(/(\d{1,2}):?(\d{2})?/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1] || '0', 10);
      const minutes = parseInt(timeMatch[2] || '0', 10);

      const now = new Date();
      const sleepDate = new Date();
      sleepDate.setHours(hours, minutes, 0, 0);

      // Compare times on the same day - if sleep time has passed today, update it
      const nowTime = now.getHours() * 60 + now.getMinutes();
      const sleepTimeMinutes = hours * 60 + minutes;

      // If sleep time is in the past (earlier today), set it to 10 minutes from now
      if (sleepTimeMinutes < nowTime) {
        const futureTime = new Date(now.getTime() + 10 * 60000); // 10 minutes from now
        const futureHours = String(futureTime.getHours()).padStart(2, '0');
        const futureMinutes = String(futureTime.getMinutes()).padStart(2, '0');
        sleepTime = `${futureHours}:${futureMinutes}`;
        formData.value.sleep = sleepTime;
        sleepTimeMessage.value = 'Sleep time updated to 10 minutes from now';
        setTimeout(() => {
          sleepTimeMessage.value = '';
        }, 3000);
      }
    }
  }

  const values = [
    formData.value.date,
    formData.value.bathe,
    formData.value.wake,
    sleepTime,
    formData.value.nap,
    String(formData.value.stress),
    String(formData.value.tired),
    formData.value.game,
    formData.value.music,
    formData.value.grateful.join(', '),
    formData.value.learn.join(', '),
    formData.value.exercise,
    String(formData.value.remember),
    String(formData.value.dayRating),
    String(formData.value.feeling),
    formData.value.why,
    formData.value.phase.join(', '),
    formData.value.time,
    formData.value.happened,
    formData.value.dayName
  ];

  const tabSeparated = values.join('\t');

  try {
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(tabSeparated);
      copySuccess.value = true;
      setTimeout(() => {
        copySuccess.value = false;
      }, 2000);
    } else {
      // Fallback for mobile devices and older browsers
      const textarea = document.createElement('textarea');
      textarea.value = tabSeparated;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      try {
        const successful = document.execCommand('copy');
        if (successful) {
          copySuccess.value = true;
          setTimeout(() => {
            copySuccess.value = false;
          }, 2000);
        } else {
          throw new Error('Copy command failed');
        }
      } catch (err) {
        console.error('Failed to copy text: ', err);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  } catch (err) {
    // Fallback for mobile devices
    const textarea = document.createElement('textarea');
    textarea.value = tabSeparated;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      const successful = document.execCommand('copy');
      if (successful) {
        copySuccess.value = true;
        setTimeout(() => {
          copySuccess.value = false;
        }, 2000);
      } else {
        console.error('Failed to copy text: Copy command failed');
      }
    } catch (fallbackErr) {
      console.error('Failed to copy text: ', fallbackErr);
    } finally {
      document.body.removeChild(textarea);
    }
  }
};

const clearButtonRef = ref<InstanceType<typeof VBtn> | null>(null);

const focusClearButton = () => {
  clearButtonRef.value?.$el.focus();
};

const handleClearButtonKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    clearForm();
  }
};

// Focus on bathe field on mount
onMounted(async () => {
  loadFormData();
  await nextTick();
  batheFieldRef.value?.focus();
});
</script>

<template>
  <VContainer fluid class="fill-height">
    <VRow justify="center">
      <VCol cols="12" md="10" lg="8" xl="6">
        <VCard variant="outlined" class="pa-6">
          <VCardText>
            <div class="d-flex flex-column ga-6">
              <div class="d-flex justify-center flex-wrap ga-4 mb-4">
                <VBtn :color="copySuccess ? 'success' : 'primary'" size="large" class="text-h6" @click="copyToClipboard"
                  :prepend-icon="copySuccess ? 'mdi-check' : 'mdi-content-copy'">
                  {{ copySuccess ? 'Copied!' : 'Copy to Clipboard' }}
                </VBtn>
                <VBtn ref="clearButtonRef" color="error" size="large" class="text-h6" prepend-icon="mdi-delete"
                  @click="clearForm" @keydown="handleClearButtonKeydown">
                  Clear
                </VBtn>
              </div>

              <div class="d-flex align-center ga-2">
                <div class="flex-grow-1">
                  <DateField ref="dateFieldRef" v-model="formData.date" label="Date" :required="true"
                    :on-previous="() => moveToPreviousField(0)" />
                </div>
                <VBtn size="small" variant="outlined" @click="setDateToToday">
                  Today
                </VBtn>
              </div>

              <YesNoField ref="batheFieldRef" v-model="formData.bathe" label="Bathe" :required="true"
                :on-next="() => moveToNextField(0)" :on-previous="() => moveToPreviousField(1)" />

              <TimeField ref="wakeFieldRef" v-model="formData.wake" label="Wake" :required="true"
                :on-next="() => moveToNextField(1)" :on-previous="() => moveToPreviousField(2)" />

              <TimeField ref="sleepFieldRef" v-model="formData.sleep" label="Sleep" :default-to-future="true"
                :future-minutes="20" :required="true" :on-next="() => moveToNextField(2)"
                :on-previous="() => moveToPreviousField(3)" />

              <FloatField ref="napFieldRef" v-model="formData.nap" label="Nap" :max="10" :required="false"
                :on-next="() => moveToNextField(3)" :on-previous="() => moveToPreviousField(4)" />

              <FloatField ref="stressFieldRef" v-model="formData.stress" label="Stress" :max="10" :required="true"
                :on-next="() => moveToNextField(4)" :on-previous="() => moveToPreviousField(5)" />

              <FloatField ref="tiredFieldRef" v-model="formData.tired" label="Tired" :max="10" :required="true"
                :on-next="() => moveToNextField(5)" :on-previous="() => moveToPreviousField(6)" />

              <AutocompleteField ref="gameFieldRef" v-model="formData.game" label="Game" :suggestions="gameSuggestions"
                :required="false" :on-next="() => moveToNextField(6)" :on-previous="() => moveToPreviousField(7)" />

              <AutocompleteField ref="musicFieldRef" v-model="formData.music" label="Music"
                :suggestions="musicSuggestions" :required="true" :on-next="() => moveToNextField(7)"
                :on-previous="() => moveToPreviousField(8)" />

              <ListField ref="gratefulFieldRef" v-model="formData.grateful" label="Grateful" :required="true"
                :on-next="() => moveToNextField(8)" :on-previous="() => moveToPreviousField(9)" />

              <ListField ref="learnFieldRef" v-model="formData.learn" label="Learn" :required="true"
                :on-next="() => moveToNextField(9)" :on-previous="() => moveToPreviousField(10)" />

              <AutocompleteField ref="exerciseFieldRef" v-model="formData.exercise" label="Exercise"
                :suggestions="exerciseSuggestions" :required="true" :on-next="() => moveToNextField(10)"
                :on-previous="() => moveToPreviousField(11)" />

              <FloatField ref="rememberFieldRef" v-model="formData.remember" label="Remember" :max="10" :required="true"
                :on-next="() => moveToNextField(11)" :on-previous="() => moveToPreviousField(12)" />

              <FloatField ref="dayRatingFieldRef" v-model="formData.dayRating" label="Day rating" :max="10"
                :required="true" :on-next="() => moveToNextField(12)" :on-previous="() => moveToPreviousField(13)" />

              <IntField ref="feelingFieldRef" v-model="formData.feeling" label="Feeling" :max="100" :required="true"
                :on-next="() => moveToNextField(13)" :on-previous="() => moveToPreviousField(14)" />

              <StringField ref="whyFieldRef" v-model="formData.why" label="Why" :required="true"
                :on-next="() => moveToNextField(14)" :on-previous="() => moveToPreviousField(15)" />

              <AutocompleteListField ref="phaseFieldRef" v-model="formData.phase" label="Phase"
                :suggestions="phaseSuggestions" :required="true" :auto-select="false"
                :on-next="() => moveToNextField(15)" :on-previous="() => moveToPreviousField(16)" />

              <PatternTextField ref="happenedFieldRef" v-model="formData.happened" label="Happened" :required="true"
                :on-next="() => moveToNextField(16)" :on-previous="() => moveToPreviousField(17)" />
              <VBtn size="small" variant="outlined" @click="happenedFieldRef?.capitalize()">
                Capitalize
              </VBtn>

              <TimeDisplay ref="timeDisplayRef" v-model="formData.time" />

              <StringField ref="dayNameFieldRef" v-model="formData.dayName" label="Day name" :required="false"
                :on-next="copyToClipboard" :on-previous="() => moveToPreviousField(17)" />

              <VDivider class="my-4" />

              <!-- Sleep Time Message -->
              <div v-if="sleepTimeMessage" class="mb-4">
                <VChip color="info" variant="outlined" size="small">
                  {{ sleepTimeMessage }}
                </VChip>
              </div>

              <!-- Validation Errors -->
              <div v-if="validationErrors.length > 0" class="mb-4">
                <div class="text-body-1 font-weight-bold mb-2 text-error">
                  Missing or invalid fields:
                </div>
                <div class="d-flex flex-wrap ga-2">
                  <VChip v-for="error in validationErrors" :key="error" color="error" variant="outlined" size="small"
                    style="cursor: pointer;" @click="focusFieldByError(error)">
                    {{ error }}
                  </VChip>
                </div>
              </div>

              <div class="d-flex justify-center flex-wrap ga-4">
                <VBtn :color="copySuccess ? 'success' : 'primary'" size="large" class="text-h6" @click="copyToClipboard"
                  :prepend-icon="copySuccess ? 'mdi-check' : 'mdi-content-copy'">
                  {{ copySuccess ? 'Copied!' : 'Copy to Clipboard' }}
                </VBtn>
                <VBtn ref="clearButtonRef" color="error" size="large" class="text-h6" prepend-icon="mdi-delete"
                  @click="clearForm" @keydown="handleClearButtonKeydown">
                  Clear
                </VBtn>
              </div>
            </div>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </VContainer>
</template>

<style scoped>
:deep(.v-field) {
  transition: all 0.2s ease;
  font-size: 1.5rem !important;
}

:deep(.v-field--focused) {
  border-color: rgb(var(--v-theme-primary)) !important;
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.3) !important;
  transform: scale(1.01);
}

:deep(.v-field--error) {
  border-color: rgb(var(--v-theme-error)) !important;
  box-shadow: 0 0 0 3px rgba(var(--v-theme-error), 0.5) !important;
  background-color: rgba(var(--v-theme-error), 0.1) !important;
}

:deep(.v-field--error .v-field__input) {
  color: rgb(var(--v-theme-error)) !important;
}

:deep(.v-input) {
  font-size: 1.5rem !important;
}

:deep(.v-label) {
  font-size: 1.3rem !important;
  font-weight: 600 !important;
}

:deep(input),
:deep(textarea) {
  font-size: 1.5rem !important;
  padding: 16px !important;
}

:deep(.v-field__input) {
  min-height: 64px !important;
  position: relative;
  z-index: 1;
}

:deep(.v-field__outline) {
  z-index: 0;
}

:deep(.v-textarea .v-field__input) {
  min-height: 120px !important;
}

.v-card {
  max-width: 100%;
}

.ga-6 {
  gap: 2rem !important;
}
</style>
