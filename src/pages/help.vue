<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { VContainer, VCard, VCardText, VBtn, VList, VListItem, VListItemTitle, VDivider } from 'vuetify/components';
import { marked } from 'marked';

// Import doc files as raw strings via Vite's ?raw suffix
import schemaGuideRaw from '../../docs/schema-guide.md?raw';

const router = useRouter();

const docs = [
  { title: 'Form Schema Guide', raw: schemaGuideRaw },
]

const activeIndex = ref(0)
const renderedHtml = ref('')

function selectDoc(index: number) {
  activeIndex.value = index
  renderedHtml.value = marked(docs[index].raw) as string
}

onMounted(() => selectDoc(0))
</script>

<template>
  <VContainer fluid class="pa-2 pa-sm-4 d-flex flex-column align-center">
    <div style="width: 100%; max-width: 960px;">
      <div class="d-flex align-center mb-3">
        <VBtn icon="mdi-arrow-left" variant="text" @click="router.push('/')" aria-label="Back" />
        <span class="text-h6 ml-2">Help</span>
      </div>

      <div class="d-flex ga-4">
        <!-- Doc list -->
        <VCard variant="outlined" style="width: 200px; flex-shrink: 0; align-self: flex-start;">
          <VList density="compact" nav>
            <VListItem
              v-for="(doc, i) in docs"
              :key="i"
              :active="activeIndex === i"
              @click="selectDoc(i)"
            >
              <VListItemTitle>{{ doc.title }}</VListItemTitle>
            </VListItem>
          </VList>
        </VCard>

        <!-- Rendered content -->
        <VCard variant="outlined" class="flex-grow-1">
          <VCardText>
            <div class="markdown-body" v-html="renderedHtml" />
          </VCardText>
        </VCard>
      </div>
    </div>
  </VContainer>
</template>

<style scoped>
.markdown-body {
  line-height: 1.6;
  font-size: 0.95rem;
}

.markdown-body :deep(h1) { font-size: 1.6rem; margin: 1.2rem 0 0.6rem; font-weight: 600; }
.markdown-body :deep(h2) { font-size: 1.25rem; margin: 1.4rem 0 0.5rem; font-weight: 600; border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); padding-bottom: 0.3rem; }
.markdown-body :deep(h3) { font-size: 1.05rem; margin: 1rem 0 0.4rem; font-weight: 600; }
.markdown-body :deep(p) { margin: 0.5rem 0; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { padding-left: 1.5rem; margin: 0.5rem 0; }
.markdown-body :deep(li) { margin: 0.2rem 0; }
.markdown-body :deep(code) { background: rgba(var(--v-theme-surface-variant), 0.5); padding: 0.1em 0.35em; border-radius: 3px; font-size: 0.88em; font-family: monospace; }
.markdown-body :deep(pre) { background: rgba(var(--v-theme-surface-variant), 0.5); padding: 1rem; border-radius: 6px; overflow-x: auto; margin: 0.8rem 0; }
.markdown-body :deep(pre code) { background: none; padding: 0; font-size: 0.85rem; }
.markdown-body :deep(table) { border-collapse: collapse; width: 100%; margin: 0.8rem 0; }
.markdown-body :deep(th), .markdown-body :deep(td) { border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); padding: 0.4rem 0.7rem; text-align: left; }
.markdown-body :deep(th) { background: rgba(var(--v-theme-surface-variant), 0.4); font-weight: 600; }
.markdown-body :deep(hr) { border: none; border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)); margin: 1.5rem 0; }
.markdown-body :deep(blockquote) { border-left: 3px solid rgba(var(--v-theme-primary), 0.4); padding-left: 1rem; margin: 0.5rem 0; color: rgba(var(--v-theme-on-surface), 0.7); }
</style>
