<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { PullRequest, PullsResult } from '@shared/types';
import { agoShort } from '../format';
import { hub, sessionById, state } from '../store';

// PRs created in this conversation (pr-link records in the transcript) and the one for its branch come first.
const props = defineProps<{ id: string }>();
const r = ref<PullsResult | null>(null);
onMounted(async () => (r.value = await hub.openPulls(props.id)));

const s = computed(() => sessionById(props.id));
const fromSession = computed(() => new Set(s.value?.prUrls ?? []));
const sorted = computed(() => {
  if (!r.value?.ok) return [];
  const mine = (p: PullRequest) => Number(fromSession.value.has(p.url)) * 2 + Number(p.branch === s.value?.branch);
  return [...r.value.prs].sort((a, b) => mine(b) - mine(a) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
});
const REVIEW: Record<string, { text: string; cls: string }> = {
  APPROVED: { text: 'aprobado', cls: 'positive' },
  CHANGES_REQUESTED: { text: 'cambios pedidos', cls: 'negative' },
  REVIEW_REQUIRED: { text: 'revisión pendiente', cls: '' },
};
</script>

<template>
  <p v-if="!r" class="ctx-note">Consultando GitHub…</p>
  <p v-else-if="!r.ok" class="ctx-note">{{ r.error }}</p>
  <template v-else>
    <p class="repo-branch"><strong class="num">{{ r.prs.length }}</strong><span>{{ r.prs.length === 1 ? 'PR abierto' : 'PRs abiertos' }}</span></p>
    <ul class="repo-list">
      <li v-for="p in sorted" :key="p.number">
        <button class="repo-item" title="Abrir el PR en el navegador" @click="hub.openExternal(p.url)">
          <span class="repo-line"><span class="num repo-hash">#{{ p.number }}</span><span class="repo-title">{{ p.title }}</span></span>
          <span class="repo-meta">
            <span v-if="fromSession.has(p.url)" class="repo-flag">de esta conversación</span>
            <span v-else-if="p.branch === s?.branch" class="repo-flag">esta rama</span>
            <span v-if="p.draft">borrador</span>
            <span v-if="REVIEW[p.review]" :class="REVIEW[p.review]!.cls">{{ REVIEW[p.review]!.text }}</span>
            <span>{{ p.author }} · {{ agoShort(Date.parse(p.updatedAt), state.now) }}</span>
          </span>
        </button>
      </li>
    </ul>
    <p v-if="!r.prs.length" class="ctx-note">No hay PRs abiertos en este repositorio.</p>
  </template>
</template>
