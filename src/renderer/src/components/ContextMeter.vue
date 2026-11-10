<script setup lang="ts">
import { computed } from 'vue';
import { contextOf } from '../store';

const props = withDefaults(defineProps<{ id: string; label?: boolean; size?: number }>(), { label: false, size: 14 });
const ctx = computed(() => contextOf(props.id));
const R = 5.25;
const C = 2 * Math.PI * R;
const level = computed(() => {
  const p = ctx.value?.pct ?? 0;
  return p >= 95 ? 'full' : p >= 80 ? 'high' : 'ok';
});
const text = computed(() => {
  const c = ctx.value;
  if (!c) return '';
  const of = c.window ? ` de ${c.window >= 1_000_000 ? `${c.window / 1_000_000}M` : `${Math.round(c.window / 1000)}k`} tokens` : '';
  return `${c.estimated ? '≈' : ''}${Math.round(c.pct)}%${c.estimated ? ' (estimado)' : ''}${of}`;
});
</script>

<template>
  <span v-if="ctx" class="ctx" :class="level" :title="`Contexto: ${text}`" role="meter" :aria-valuenow="Math.round(ctx.pct)" aria-valuemin="0" aria-valuemax="100" :aria-label="`Contexto ${text}`">
    <svg :width="size" :height="size" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="7" cy="7" :r="R" fill="none" class="ctx-track" stroke-width="2.5" />
      <circle
        cx="7"
        cy="7"
        :r="R"
        fill="none"
        class="ctx-arc"
        stroke-width="2.5"
        :stroke-dasharray="`${(Math.min(100, ctx.pct) / 100) * C} ${C}`"
        transform="rotate(-90 7 7)"
      />
    </svg>
    <span v-if="label" class="ctx-label num">{{ ctx.estimated ? '≈' : '' }}{{ Math.round(ctx.pct) }}%</span>
  </span>
</template>
