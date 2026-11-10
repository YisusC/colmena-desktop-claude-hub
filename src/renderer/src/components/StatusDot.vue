<script setup lang="ts">
import { computed } from 'vue';
import { durationShort } from '../format';
import { PHASE_LABEL, phaseOf, state, type Tab } from '../store';

const props = defineProps<{ tab: Tab; words?: boolean }>();

const phase = computed(() => phaseOf(props.tab, state.now));
const unseen = computed(() => props.tab.attention && phase.value === 'finished');
const label = computed(() => (unseen.value ? 'Terminó, sin ver' : PHASE_LABEL[phase.value]));
const since = computed(() => (phase.value === 'asking' && props.tab.askedAt ? props.tab.askedAt : props.tab.since));
</script>

<template>
  <span class="state" :class="[phase, { unseen, compact: !words }]" :title="label">
    <svg class="state-icon" viewBox="0 0 16 16" width="14" height="14" role="img" :aria-label="label">
      <template v-if="phase === 'working'">
        <circle class="dot d1" cx="3" cy="8" r="1.7" fill="currentColor" />
        <circle class="dot d2" cx="8" cy="8" r="1.7" fill="currentColor" />
        <circle class="dot d3" cx="13" cy="8" r="1.7" fill="currentColor" />
      </template>
      <template v-else-if="phase === 'finished' || phase === 'ready'">
        <circle v-if="unseen" cx="8" cy="8" r="6.5" fill="currentColor" />
        <path d="M5 8.2l2 2L11 6" fill="none" :stroke="unseen ? 'var(--surface)' : 'currentColor'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </template>
      <template v-else-if="phase === 'asking'">
        <circle cx="8" cy="8" r="6.5" fill="currentColor" />
        <path d="M6.3 6.2a1.8 1.8 0 113 1.4c-.7.5-1.3.8-1.3 1.7M8 11.4v.1" fill="none" stroke="var(--surface)" stroke-width="1.6" stroke-linecap="round" />
      </template>
      <template v-else-if="phase === 'inactive'">
        <circle cx="8" cy="8" r="5.75" fill="none" stroke="currentColor" stroke-width="1.5" />
        <path d="M8 5v3.2l2 1.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </template>
      <template v-else-if="phase === 'error'">
        <circle cx="8" cy="8" r="6.5" fill="currentColor" />
        <path d="M8 4.8v3.6M8 11v.1" stroke="var(--surface)" stroke-width="1.8" stroke-linecap="round" />
      </template>
      <template v-else-if="phase === 'exited'">
        <rect x="4" y="4" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5" />
      </template>
      <circle v-else class="pulse" cx="8" cy="8" r="3" fill="currentColor" />
    </svg>
    <template v-if="words">
      <span class="state-word">{{ label }}</span>
      <span class="state-time num">{{ durationShort(state.now - since) }}</span>
    </template>
  </span>
</template>
