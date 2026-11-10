<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { contextDetail, findTab, hub, phaseOf, state } from '../store';
import { focusTerminal } from '../terminals';
import RepoCommits from './RepoCommits.vue';
import RepoPulls from './RepoPulls.vue';

// Only /context gives the exact breakdown by category; here the split is estimated.
const props = defineProps<{ id: string }>();
type PanelTab = 'context' | 'commits' | 'prs';
const tabSel = ref<PanelTab>('context');
const TABS: Array<{ id: PanelTab; label: string }> = [
  { id: 'context', label: 'Contexto' },
  { id: 'commits', label: 'Commits' },
  { id: 'prs', label: 'PRs' },
];
const d = computed(() => contextDetail(props.id));
const tab = computed(() => findTab(props.id));
const canRun = computed(() => {
  const t = tab.value;
  return !!t && !t.asking && ['ready', 'finished', 'inactive'].includes(phaseOf(t, state.now));
});
const level = computed(() => ((d.value?.pct ?? 0) >= 95 ? 'full' : (d.value?.pct ?? 0) >= 80 ? 'high' : 'ok'));

const nf = (n: number, digits = 1) => n.toLocaleString('es', { maximumFractionDigits: digits });
function tokens(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${nf(n / 1_000_000)}M`;
  if (n >= 1_000) return `${nf(n / 1_000)}k`;
  return nf(n, 0);
}
const share = (n: number | null) => (n == null || !d.value ? '—' : `${nf((n / d.value.window) * 100)}%`);
const width = (n: number | null) => `${n == null || !d.value ? 0 : Math.max(0, (n / d.value.window) * 100)}%`;
const cost = computed(() =>
  d.value?.cost == null ? '—' : `US$ ${d.value.cost.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
);

function close(): void {
  state.contextPanel = null;
}

// "/context " with a space closes the autocomplete; then Enter runs it in the terminal.
function runContext(): void {
  hub.writePty(props.id, '/context ');
  setTimeout(() => hub.writePty(props.id, '\r'), 250);
  close();
  focusTerminal(props.id);
}

const root = ref<HTMLElement>();
function onDocDown(e: MouseEvent): void {
  const t = e.target as HTMLElement;
  if (root.value?.contains(t) || t.closest?.('.ctx-toggle')) return;
  close();
}
const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && close();
onMounted(() => {
  document.addEventListener('mousedown', onDocDown);
  document.addEventListener('keydown', onEsc);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDown);
  document.removeEventListener('keydown', onEsc);
});
</script>

<template>
  <div ref="root" class="ctx-panel" role="dialog" aria-label="Contexto de la sesión">
    <nav class="views inline ctx-tabs" aria-label="Secciones">
      <button v-for="t in TABS" :key="t.id" class="view-tab" :class="{ on: tabSel === t.id }" :aria-pressed="tabSel === t.id" @click="tabSel = t.id">
        <span class="view-label">{{ t.label }}</span>
      </button>
    </nav>

    <RepoCommits v-if="tabSel === 'commits'" :id="id" />
    <RepoPulls v-else-if="tabSel === 'prs'" :id="id" />
    <template v-else>
    <p v-if="d" class="ctx-src">{{ d.exact ? 'Según Claude' : '≈ Estimado del historial' }}</p>
    <template v-if="d">
      <div class="ctx-sum" :class="level">
        <strong>{{ d.exact ? '' : '≈' }}{{ nf(d.pct) }}% usado</strong>
        <span class="num">{{ tokens(d.used) }} / {{ tokens(d.window) }}</span>
      </div>
      <div class="ctx-stack" :class="level" aria-hidden="true">
        <template v-if="d.base != null">
          <span class="seg base" :style="{ width: width(d.base) }"></span>
          <span class="seg conv" :style="{ width: width(d.conversation) }"></span>
        </template>
        <span v-else class="seg conv" :style="{ width: width(d.used) }"></span>
      </div>

      <table class="ctx-table">
        <tbody>
          <tr v-if="d.base != null">
            <td><span class="sw base"></span>Base fija ≈</td>
            <td class="num">{{ tokens(d.base) }}</td>
            <td class="num">{{ share(d.base) }}</td>
          </tr>
          <tr v-if="d.base != null" class="sub"><td colspan="3">system prompt, herramientas, MCP, skills y memoria</td></tr>
          <tr>
            <td><span class="sw conv" :class="level"></span>{{ d.base != null ? 'Conversación ≈' : 'Usado' }}</td>
            <td class="num">{{ tokens(d.conversation ?? d.used) }}</td>
            <td class="num">{{ share(d.conversation ?? d.used) }}</td>
          </tr>
          <tr>
            <td><span class="sw free"></span>Espacio libre</td>
            <td class="num">{{ tokens(d.free) }}</td>
            <td class="num">{{ share(d.free) }}</td>
          </tr>
        </tbody>
      </table>

      <template v-if="d.turn">
        <h3>Último turno</h3>
        <table class="ctx-table">
          <tbody>
            <tr><td>Leído de caché</td><td class="num" colspan="2">{{ tokens(d.turn.cacheRead) }}</td></tr>
            <tr><td>Escrito a caché</td><td class="num" colspan="2">{{ tokens(d.turn.cacheCreation) }}</td></tr>
            <tr><td>Entrada nueva</td><td class="num" colspan="2">{{ tokens(d.turn.input) }}</td></tr>
            <tr><td>Salida</td><td class="num" colspan="2">{{ tokens(d.turn.output) }}</td></tr>
          </tbody>
        </table>
      </template>

      <template v-if="d.totalIn != null || d.cost != null">
        <h3>Sesión</h3>
        <table class="ctx-table">
          <tbody>
            <tr><td>Entrada total</td><td class="num" colspan="2">{{ tokens(d.totalIn) }}</td></tr>
            <tr><td>Salida total</td><td class="num" colspan="2">{{ tokens(d.totalOut) }}</td></tr>
            <tr><td>Costo</td><td class="num" colspan="2">{{ cost }}</td></tr>
          </tbody>
        </table>
      </template>

      <p class="ctx-note">La base fija se mide en el primer turno. El desglose exacto por categorías lo calcula Claude con /context.</p>
    </template>
    <p v-else class="ctx-note">Sin datos de contexto todavía: aparecen después del primer mensaje.</p>

    <button
      class="btn ctx-run"
      :disabled="!canRun"
      :title="canRun ? 'Ejecuta /context en esta terminal (no gasta tokens)' : 'Disponible cuando Claude no esté trabajando ni preguntando'"
      @click="runContext"
    >
      Ver desglose completo en Claude
    </button>
    </template>
  </div>
</template>
