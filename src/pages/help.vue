<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { VContainer, VCard, VCardText, VBtn, VList, VListItem, VListItemTitle } from 'vuetify/components';
import { marked } from 'marked';

import schemaGuideRaw from '../../docs/schema-guide.md?raw';
import databaseRaw from '../../docs/database.md?raw';

const router = useRouter();

const docs = [
  { title: 'Form Schema Guide', raw: schemaGuideRaw },
  { title: 'Database Reference', raw: databaseRaw },
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
    <div style="width: 100%; max-width: 1200px;">
      <div class="d-flex align-center mb-3">
        <VBtn icon="mdi-arrow-left" variant="text" @click="router.push('/')" aria-label="Back" />
        <span class="text-h6 ml-2">Help</span>
      </div>

      <div class="d-flex ga-4">
        <!-- Doc list -->
        <VCard variant="outlined" style="width: 180px; flex-shrink: 0; align-self: flex-start;">
          <VList density="compact" nav>
            <VListItem
              v-for="(doc, i) in docs"
              :key="i"
              :active="activeIndex === i"
              @click="selectDoc(i)"
            >
              <VListItemTitle style="white-space: normal; font-size: 0.85rem;">{{ doc.title }}</VListItemTitle>
            </VListItem>
          </VList>
        </VCard>

        <!-- Rendered content -->
        <VCard variant="outlined" class="flex-grow-1">
          <VCardText class="pa-6">
            <div class="markdown-body" v-html="renderedHtml" />
          </VCardText>
        </VCard>
      </div>
    </div>
  </VContainer>
</template>

<style scoped>
.markdown-body {
  line-height: 1.7;
  font-size: 0.95rem;
  max-width: 860px;
}

.markdown-body :deep(h1) {
  font-size: 1.7rem;
  margin: 0 0 0.8rem;
  font-weight: 700;
}

.markdown-body :deep(h2) {
  font-size: 1.2rem;
  margin: 2rem 0 0.6rem;
  font-weight: 600;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding-bottom: 0.3rem;
}

.markdown-body :deep(h3) {
  font-size: 1rem;
  margin: 1.4rem 0 0.4rem;
  font-weight: 600;
}

.markdown-body :deep(p) {
  margin: 0.6rem 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.5rem;
  margin: 0.5rem 0;
}

.markdown-body :deep(li) {
  margin: 0.25rem 0;
}

/* Inline code — dark background, bright text for readability */
.markdown-body :deep(code) {
  background: rgba(0, 0, 0, 0.55);
  color: #e8e8e8;
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.87em;
  font-family: 'Consolas', 'Fira Code', monospace;
}

/* Code blocks */
.markdown-body :deep(pre) {
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 1rem 1.25rem;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.9rem 0;
}

.markdown-body :deep(pre code) {
  background: none;
  color: #e8e8e8;
  padding: 0;
  font-size: 0.87rem;
  border-radius: 0;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0.9rem 0;
  font-size: 0.9rem;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 0.45rem 0.8rem;
  text-align: left;
}

.markdown-body :deep(th) {
  background: rgba(var(--v-theme-surface-variant), 0.35);
  font-weight: 600;
  font-size: 0.85rem;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  margin: 2rem 0;
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid rgba(var(--v-theme-primary), 0.5);
  padding-left: 1rem;
  margin: 0.6rem 0;
  opacity: 0.8;
}
</style>
