<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { RepoResult } from '@shared/types';
import { agoShort } from '../format';
import { hub, state } from '../store';

const props = defineProps<{ id: string }>();
const r = ref<RepoResult | null>(null);
onMounted(async () => (r.value = await hub.repoInfo(props.id)));

const sync = computed(() => {
  const v = r.value;
  if (!v?.ok) return '';
  const parts: string[] = [];
  if (!v.upstream) parts.push('sin rama remota');
  else if (!v.ahead && !v.behind) parts.push(`al día con ${v.upstream}`);
  else {
    if (v.ahead) parts.push(`${v.ahead} por subir`);
    if (v.behind) parts.push(`${v.behind} por bajar`);
  }
  parts.push(v.changed ? `${v.changed} ${v.changed === 1 ? 'archivo con cambios' : 'archivos con cambios'}` : 'sin cambios locales');
  return parts.join(' · ');
});
</script>

<template>
  <p v-if="!r" class="ctx-note">Leyendo el repositorio…</p>
  <p v-else-if="!r.ok" class="ctx-note">{{ r.error }}</p>
  <template v-else>
    <div class="repo-branch">
      <strong class="num">{{ r.branch ?? 'HEAD separado' }}</strong>
      <span>{{ sync }}</span>
    </div>
    <ul class="repo-list">
      <li v-for="c in r.commits" :key="c.hash">
        <button class="repo-item" :disabled="!c.url" :title="c.url ? 'Abrir el commit en GitHub' : c.subject" @click="c.url && hub.openExternal(c.url)">
          <span class="repo-line"><span class="num repo-hash">{{ c.hash }}</span><span class="repo-title">{{ c.subject }}</span></span>
          <span class="repo-meta">{{ c.author }} · {{ agoShort(Date.parse(c.date), state.now) }}</span>
        </button>
      </li>
    </ul>
    <p v-if="!r.commits.length" class="ctx-note">Todavía no hay commits en esta rama.</p>
    <button v-if="r.web" class="link-btn repo-more" @click="hub.openExternal(`${r.web}/commits/${r.branch ?? ''}`)">Ver todos en GitHub</button>
  </template>
</template>
