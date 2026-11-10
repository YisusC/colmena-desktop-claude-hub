<script setup lang="ts">
import { computed } from 'vue';
import type { Snippet } from '@shared/types';

const props = defineProps<{ snippet: Snippet }>();

// Built from segments (no v-html): the text comes from conversations and may contain HTML.
const parts = computed(() => {
  const { text, ranges } = props.snippet;
  const out: Array<{ t: string; hit: boolean }> = [];
  let pos = 0;
  for (const [a, b] of ranges) {
    if (a > pos) out.push({ t: text.slice(pos, a), hit: false });
    out.push({ t: text.slice(a, b), hit: true });
    pos = b;
  }
  if (pos < text.length) out.push({ t: text.slice(pos), hit: false });
  return out;
});
</script>

<template>
  <div class="snippet">
    <span class="who">{{ snippet.role === 'user' ? 'Tú' : 'Claude' }}</span>
    <span class="snip-text"
      ><span v-if="snippet.cutStart">…</span
      ><template v-for="(p, i) in parts" :key="i"><mark v-if="p.hit">{{ p.t }}</mark><template v-else>{{ p.t }}</template></template
      ><span v-if="snippet.cutEnd">…</span></span
    >
  </div>
</template>
