<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';
import { VContainer, VRow, VCol, VCard, VCardText, VBtn, VDivider, VChip } from 'vuetify/components';
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
import { getTodayDate, getYesterdayDate } from '@/lib/fieldUtils';
import { getMappingInstances, getListValues, getSuggestions, upsertFormHistory } from '@/lib/db';
import type { MappingInstance, ListValue } from '@/lib/db';

const router = useRouter();

const STORAGE_KEY = 'daily_tracking_form_data';

// DB state
const dbMappings = ref<MappingInstance[]>([]);
const dbListValues = ref<ListValue[]>([]);
const dbExerciseSuggestions = ref<string[]>([]);
const dbMusicSuggestions = ref<string[]>([]);
const dbGameSuggestions = ref<string[]>([]);
const dbPhaseSuggestions = ref<string[]>([]);
const dbLoaded = ref(false);

const loadDb = async () => {
  [
    dbMappings.value,
    dbListValues.value,
    dbExerciseSuggestions.value,
    dbMusicSuggestions.value,
    dbGameSuggestions.value,
    dbPhaseSuggestions.value,
  ] = await Promise.all([
    getMappingInstances(true),   // only enabled mappings
    getListValues(true),   // pattern matching only — rows with abbreviation set
    getSuggestions('exercise'),
    getSuggestions('music'),
    getSuggestions('game'),
    getSuggestions('phase'),
  ]);
  dbLoaded.value = true;
};

// Form data
const formData = ref({
  date: '',
  bathe: 'N',
  wake: '',
  sleep: '',
  nap: 0,
  worked: 0,
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
  dayName: ''
});

const loadFormData = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed.grateful)) parsed.grateful = [];
      if (!Array.isArray(parsed.learn)) parsed.learn = [];
      if (!Array.isArray(parsed.phase)) parsed.phase = [];
      Object.assign(formData.value, parsed);
    }
  } catch (err) {
    console.error('Failed to load form data:', err);
  }
};

const saveFormData = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData.value));
  } catch (err) {
    console.error('Failed to save form data:', err);
  }
};

watch(formData, saveFormData, { deep: true });
watch(() => formData.value.grateful, saveFormData, { deep: true });
watch(() => formData.value.learn, saveFormData, { deep: true });
watch(() => formData.value.phase, saveFormData, { deep: true });

watch(() => formData.value.time, (newTime) => {
  if (newTime) {
    const m = newTime.match(/(\d{1,2}):?(\d{2})?/);
    if (m) {
      const hours = parseInt(m[1] || '0', 10);
      if (hours >= 0 && hours < 12) {
        formData.value.date = getYesterdayDate();
      }
    }
  }
});

const setDateToToday = () => { formData.value.date = getTodayDate(); };

const clearForm = () => {
  formData.value = {
    date: '',
    bathe: 'N',
    wake: '',
    sleep: '',
    nap: 0,
    worked: 0,
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
    dayName: ''
  };
  setDateToToday();
  localStorage.removeItem(STORAGE_KEY);
  nextTick(() => formRefs.bathe.value?.focus());
};

// ── Field refs ───────────────────────────────────────────────────────────────

const formRefs = {
  bathe:     useTemplateRef<InstanceType<typeof YesNoField>>('batheRef'),
  wake:      useTemplateRef<InstanceType<typeof TimeField>>('wakeRef'),
  sleep:     useTemplateRef<InstanceType<typeof TimeField>>('sleepRef'),
  nap:       useTemplateRef<InstanceType<typeof FloatField>>('napRef'),
  worked:    useTemplateRef<InstanceType<typeof FloatField>>('workedRef'),
  stress:    useTemplateRef<InstanceType<typeof FloatField>>('stressRef'),
  tired:     useTemplateRef<InstanceType<typeof FloatField>>('tiredRef'),
  game:      useTemplateRef<InstanceType<typeof AutocompleteField>>('gameRef'),
  music:     useTemplateRef<InstanceType<typeof AutocompleteField>>('musicRef'),
  grateful:  useTemplateRef<InstanceType<typeof ListField>>('gratefulRef'),
  learn:     useTemplateRef<InstanceType<typeof ListField>>('learnRef'),
  exercise:  useTemplateRef<InstanceType<typeof AutocompleteField>>('exerciseRef'),
  remember:  useTemplateRef<InstanceType<typeof FloatField>>('rememberRef'),
  dayRating: useTemplateRef<InstanceType<typeof FloatField>>('dayRatingRef'),
  feeling:   useTemplateRef<InstanceType<typeof IntField>>('feelingRef'),
  why:       useTemplateRef<InstanceType<typeof StringField>>('whyRef'),
  phase:     useTemplateRef<InstanceType<typeof AutocompleteListField>>('phaseRef'),
  happened:  useTemplateRef<InstanceType<typeof PatternTextField>>('happenedRef'),
  dayName:   useTemplateRef<InstanceType<typeof StringField>>('dayNameRef'),
};

type FieldName = keyof typeof formRefs | 'submit';

const fieldOrder: (keyof typeof formRefs)[] = [
  'bathe', 'wake', 'sleep', 'nap', 'worked', 'stress', 'tired',
  'game', 'music', 'grateful', 'learn', 'exercise',
  'remember', 'dayRating', 'feeling', 'why', 'phase', 'happened', 'dayName',
];

async function focusRef(ref: FieldName) {
  if (ref === 'submit') {
    copyToClipboard();
    return;
  }
  await nextTick();
  formRefs[ref].value?.focus();
  await nextTick();
  document.activeElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const focusRules: Record<keyof typeof formRefs, () => void> = {
  bathe:     () => focusRef('wake'),
  wake:      () => focusRef('sleep'),
  sleep:     () => focusRef('nap'),
  nap:       () => focusRef('worked'),
  worked:    () => focusRef('stress'),
  stress:    () => focusRef('tired'),
  tired:     () => focusRef('game'),
  game:      () => focusRef('music'),
  music:     () => focusRef('grateful'),
  grateful:  () => focusRef('learn'),
  learn:     () => focusRef('exercise'),
  exercise:  () => focusRef('remember'),
  remember:  () => focusRef('dayRating'),
  dayRating: () => focusRef('feeling'),
  feeling:   () => focusRef('why'),
  why:       () => focusRef('phase'),
  phase:     () => focusRef('happened'),
  happened:  () => focusRef('dayName'),
  dayName:   () => focusRef('submit'),
};

const prevRules: Record<keyof typeof formRefs, () => void> = Object.fromEntries(
  fieldOrder.map((name, i) => [
    name,
    () => focusRef(i === 0 ? fieldOrder[0] : fieldOrder[i - 1]),
  ])
) as Record<keyof typeof formRefs, () => void>;

// ── Error → field focus map ──────────────────────────────────────────────────

const errorToField: Record<string, keyof typeof formRefs> = {
  'Date':       'bathe',   // date has no entry in formRefs, focus first real field
  'Bathe':      'bathe',
  'Wake':       'wake',
  'Sleep':      'sleep',
  'Stress':     'stress',
  'Tired':      'tired',
  'Music':      'music',
  'Grateful':   'grateful',
  'Learn':      'learn',
  'Exercise':   'exercise',
  'Remember':   'remember',
  'Day rating': 'dayRating',
  'Feeling':    'feeling',
  'Why':        'why',
  'Phase':      'phase',
  'Happened':   'happened',
};

const dateFieldRef = useTemplateRef<InstanceType<typeof DateField>>('dateRef');

const focusFieldByError = (label: string) => {
  if (label === 'Date') { dateFieldRef.value?.focus(); return; }
  const field = errorToField[label];
  if (field) focusRef(field);
};

// ── Validation ───────────────────────────────────────────────────────────────

const validationErrors = ref<string[]>([]);

const validateForm = () => {
  const e: string[] = [];
  if (!formData.value.date) e.push('Date');
  if (!formData.value.bathe) e.push('Bathe');
  if (!formData.value.wake) e.push('Wake');
  if (!formData.value.sleep) e.push('Sleep');
  if (formData.value.stress < 1) e.push('Stress');
  if (formData.value.tired < 1) e.push('Tired');
  if (!formData.value.music) e.push('Music');
  if (!formData.value.grateful?.length) e.push('Grateful');
  if (!formData.value.learn?.length) e.push('Learn');
  if (!formData.value.exercise) e.push('Exercise');
  if (formData.value.remember < 1) e.push('Remember');
  if (formData.value.dayRating < 1) e.push('Day rating');
  if (formData.value.feeling < 1) e.push('Feeling');
  if (!formData.value.why) e.push('Why');
  if (!formData.value.phase?.length) e.push('Phase');
  if (!formData.value.happened) e.push('Happened');
  validationErrors.value = e;
};

watch(formData, validateForm, { deep: true, immediate: true });

// ── Clipboard ────────────────────────────────────────────────────────────────

const copySuccess = ref(false);
const sleepTimeMessage = ref('');

const copyToClipboard = async () => {
  let sleepTime = formData.value.sleep;
  if (sleepTime) {
    const m = sleepTime.match(/(\d{1,2}):?(\d{2})?/);
    if (m) {
      const hours = parseInt(m[1] || '0', 10);
      const minutes = parseInt(m[2] || '0', 10);
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const sleepMins = hours * 60 + minutes;
      if (sleepMins < nowMins) {
        const future = new Date(now.getTime() + 10 * 60000);
        sleepTime = `${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`;
        formData.value.sleep = sleepTime;
        sleepTimeMessage.value = 'Sleep time updated to 10 minutes from now';
        setTimeout(() => { sleepTimeMessage.value = ''; }, 3000);
      }
    }
  }

  const values = [
    formData.value.date,
    formData.value.bathe,
    formData.value.wake,
    sleepTime,
    formData.value.nap,
    formData.value.worked,
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
    formData.value.dayName,
  ];

  const text = values.join('\t');

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      Object.assign(ta.style, { position: 'fixed', left: '-999999px', top: '-999999px' });
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    copySuccess.value = true;
    setTimeout(() => { copySuccess.value = false; }, 2000);

    // Persist to history (fire-and-forget — don't block the copy UX)
    if (formData.value.date) {
      upsertFormHistory({
        date:      formData.value.date,
        bathe:     formData.value.bathe,
        wake:      formData.value.wake,
        sleep:     sleepTime,
        nap:       String(formData.value.nap),
        worked:    String(formData.value.worked),
        stress:    String(formData.value.stress),
        tired:     String(formData.value.tired),
        game:      formData.value.game,
        music:     formData.value.music,
        grateful:  formData.value.grateful.join(', '),
        learn:     formData.value.learn.join(', '),
        exercise:  formData.value.exercise,
        remember:  String(formData.value.remember),
        day_rating: String(formData.value.dayRating),
        feeling:   String(formData.value.feeling),
        why:       formData.value.why,
        phase:     formData.value.phase.join(', '),
        time:      formData.value.time,
        happened:  formData.value.happened,
        day_name:  formData.value.dayName,
        output:    text,
        saved_at:  new Date().toISOString(),
      }).catch(console.error);
    }
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

// ── Clear button keyboard ─────────────────────────────────────────────────────

const clearButtonRef = ref<InstanceType<typeof VBtn> | null>(null);

const handleClearButtonKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
    event.preventDefault();
    clearForm();
  }
};

// Ctrl+S is dispatched as a custom event from App.vue (single listener, no stacking)
const onAppCopy = () => copyToClipboard();
onMounted(() => document.addEventListener('app:copy', onAppCopy));
onUnmounted(() => document.removeEventListener('app:copy', onAppCopy));

// ── Mount ────────────────────────────────────────────────────────────────────

onMounted(async () => {
  loadFormData();
  await loadDb();
  await nextTick();
  formRefs.bathe.value?.focus();
});
</script>

<template>
  <VContainer fluid class="fill-height">
    <VRow justify="center">
      <VCol cols="12" md="10" lg="8" xl="6">
        <VCard variant="outlined" class="pa-6">
          <VCardText>
            <div class="d-flex flex-column ga-6">
              <div class="d-flex align-center ga-4 mb-4">
                <div class="d-flex justify-center flex-wrap ga-4 flex-grow-1">
                  <VBtn :color="copySuccess ? 'success' : 'primary'" size="large" class="text-h6"
                    @click="copyToClipboard" :prepend-icon="copySuccess ? 'mdi-check' : 'mdi-content-copy'">
                    {{ copySuccess ? 'Copied!' : 'Copy to Clipboard' }}
                  </VBtn>
                  <VBtn ref="clearButtonRef" color="error" size="large" class="text-h6" prepend-icon="mdi-delete"
                    @click="clearForm" @keydown="handleClearButtonKeydown">
                    Clear
                  </VBtn>
                </div>
                <VBtn icon="mdi-cog" variant="text" size="small" @click="router.push('/settings')" />
              </div>

              <div class="d-flex align-center ga-2">
                <div class="flex-grow-1">
                  <DateField ref="dateRef" v-model="formData.date" label="Date" :required="true"
                    :on-next="() => focusRef('bathe')" />
                </div>
                <VBtn size="small" variant="outlined" @click="setDateToToday">Today</VBtn>
              </div>

              <YesNoField ref="batheRef" v-model="formData.bathe" label="Bathe" :required="true"
                :on-next="focusRules['bathe']" :on-previous="prevRules['bathe']" />

              <VRow class="py-0">
                <VCol class="pt-1 pb-0">
                  <TimeField ref="wakeRef" v-model="formData.wake" label="Wake" :required="true"
                    :on-next="focusRules['wake']" :on-previous="prevRules['wake']" />
                </VCol>
                <VCol class="pt-1 pb-0">
                  <TimeField ref="sleepRef" v-model="formData.sleep" label="Sleep" :default-to-future="true"
                    :future-minutes="25" :required="true"
                    :on-next="focusRules['sleep']" :on-previous="prevRules['sleep']" />
                </VCol>
              </VRow>

              <VRow class="py-0">
                <VCol class="pt-0 pb-2">
                  <FloatField ref="napRef" v-model="formData.nap" label="Nap" :max="10" :required="false"
                    :on-next="focusRules['nap']" :on-previous="prevRules['nap']" />
                </VCol>
                <VCol class="pt-0 pb-2">
                  <FloatField ref="workedRef" v-model="formData.worked" label="Worked" :max="24" :required="false"
                    :on-next="focusRules['worked']" :on-previous="prevRules['worked']" />
                </VCol>
              </VRow>

              <VRow class="py-0">
                <VCol class="pt-0 pb-2">
                  <FloatField ref="stressRef" v-model="formData.stress" label="Stress" :max="10" :required="true"
                    :on-next="focusRules['stress']" :on-previous="prevRules['stress']" />
                </VCol>
                <VCol class="pt-0 pb-2">
                  <FloatField ref="tiredRef" v-model="formData.tired" label="Tired" :max="10" :required="true"
                    :on-next="focusRules['tired']" :on-previous="prevRules['tired']" />
                </VCol>
              </VRow>

              <AutocompleteField ref="gameRef" v-model="formData.game" label="Game" :suggestions="dbGameSuggestions"
                :required="false" :on-next="focusRules['game']" :on-previous="prevRules['game']" />

              <AutocompleteField ref="musicRef" v-model="formData.music" label="Music"
                :suggestions="dbMusicSuggestions" :required="true"
                :on-next="focusRules['music']" :on-previous="prevRules['music']" />

              <ListField ref="gratefulRef" v-model="formData.grateful" label="Grateful" :required="true"
                :on-next="focusRules['grateful']" :on-previous="prevRules['grateful']" />

              <ListField ref="learnRef" v-model="formData.learn" label="Learn (Ctrl+Y)" :required="true"
                :on-next="focusRules['learn']" :on-previous="prevRules['learn']" />

              <AutocompleteField ref="exerciseRef" v-model="formData.exercise" label="Exercise"
                :suggestions="dbExerciseSuggestions" :required="true"
                :on-next="focusRules['exercise']" :on-previous="prevRules['exercise']" />

              <FloatField ref="rememberRef" v-model="formData.remember" label="Remember" :max="10" :required="true"
                :on-next="focusRules['remember']" :on-previous="prevRules['remember']" />

              <FloatField ref="dayRatingRef" v-model="formData.dayRating" label="Day rating" :max="10" :required="true"
                :on-next="focusRules['dayRating']" :on-previous="prevRules['dayRating']" />

              <IntField ref="feelingRef" v-model="formData.feeling" label="Feeling" :max="100" :required="true"
                :on-next="focusRules['feeling']" :on-previous="prevRules['feeling']" />

              <StringField ref="whyRef" v-model="formData.why" label="Why" :required="true"
                :on-next="focusRules['why']" :on-previous="prevRules['why']" />

              <AutocompleteListField ref="phaseRef" v-model="formData.phase" label="Phase"
                :suggestions="dbPhaseSuggestions" :required="true" :auto-select="false"
                :on-next="focusRules['phase']" :on-previous="prevRules['phase']" />

              <PatternTextField ref="happenedRef" v-model="formData.happened" label="Happened" :required="true"
                :mappings="dbMappings" :list-values="dbListValues"
                :on-next="focusRules['happened']" :on-previous="prevRules['happened']" />
              <VBtn size="small" variant="outlined" @click="formRefs.happened.value?.capitalize()">
                Capitalize
              </VBtn>

              <TimeDisplay v-model="formData.time" />

              <StringField ref="dayNameRef" v-model="formData.dayName" label="Day name" :required="false"
                :on-next="focusRules['dayName']" :on-previous="prevRules['dayName']" />

              <VDivider class="my-4" />

              <!-- Sleep Time Message -->
              <div v-if="sleepTimeMessage">
                <VChip color="info" variant="outlined" size="small">{{ sleepTimeMessage }}</VChip>
              </div>

              <!-- Validation Errors -->
              <div v-if="validationErrors.length > 0">
                <div class="text-body-1 font-weight-bold mb-2 text-error">Missing or invalid fields:</div>
                <div class="d-flex flex-wrap ga-2">
                  <VChip v-for="error in validationErrors" :key="error" color="error" variant="outlined" size="small"
                    style="cursor: pointer;" @click="focusFieldByError(error)">
                    {{ error }}
                  </VChip>
                </div>
              </div>

              <div class="d-flex justify-center flex-wrap ga-4">
                <VBtn :color="copySuccess ? 'success' : 'primary'" size="large" class="text-h6"
                  @click="copyToClipboard" :prepend-icon="copySuccess ? 'mdi-check' : 'mdi-content-copy'">
                  {{ copySuccess ? 'Copied!' : 'Copy to Clipboard' }}
                </VBtn>
                <VBtn ref="clearButtonRef" color="error" size="large" class="text-h6" prepend-icon="mdi-delete"
                  @click="clearForm" @keydown="handleClearButtonKeydown">
                  Clear
                </VBtn>
              </div>
              <div class="d-flex justify-center" style="color: gray;">
                Ctrl+S copy · Ctrl+Y YouTube · Ctrl+G My Activity
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
  gap: 1.2rem !important;
}
</style>
