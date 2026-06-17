<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import { VApp, VMain } from 'vuetify/components';

const onKeydown = (e: KeyboardEvent) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (!ctrl) return;
  if (e.key === 'y') { e.preventDefault(); window.open('https://www.youtube.com/feed/history', '_blank'); }
  if (e.key === 's') { e.preventDefault(); document.dispatchEvent(new CustomEvent('app:copy')); }
  if (e.key === 'g') { e.preventDefault(); window.open('https://myactivity.google.com/myactivity?pli=1', '_blank'); }
};

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <VApp>
    <VMain>
      <RouterView />
    </VMain>
  </VApp>
</template>

<style>
#app {
  width: 100%;
  min-height: 100vh;
}
</style>
