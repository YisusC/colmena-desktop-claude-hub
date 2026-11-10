<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { displayTitle, groupOf } from '@shared/meta';
import { agoShort } from '../format';
import {
  activateTab, effectiveMeta, findTab, inFlight, openSession, phaseCounts, phaseOf, projectCount, sessionById, state,
  tabGroup, tabTitle, type Phase,
} from '../store';
import { previewLines } from '../terminals';
import ContextMeter from './ContextMeter.vue';
import GroupMark from './GroupMark.vue';
import Icon from './Icon.vue';
import Shortcuts from './Shortcuts.vue';
import StatusDot from './StatusDot.vue';

type Filter = 'all' | 'asking' | 'finished' | 'working' | 'inactive';
const filter = ref<Filter>('all');
const FILTERS: Array<{ id: Filter; label: string; extra?: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'asking', label: 'Preguntan' },
  { id: 'finished', label: 'Terminaron' },
  { id: 'working', label: 'En proceso' },
  { id: 'inactive', label: 'Inactivas', extra: ' +10 min' },
];
const inFilter = (p: Phase, f: Filter) =>
  f === 'all' || (f === 'asking' ? p === 'asking' : f === 'finished' ? p === 'finished' : f === 'working' ? p === 'working' || p === 'starting' : p === 'inactive');

// The xterm screen is not reactive: it is re-read every 1.5 seconds.
const tick = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    tick.value++;
    state.now = Date.now();
  }, 1500);
});
onBeforeUnmount(() => clearInterval(timer));

const counts = computed(() => ({
  all: state.tabs.length,
  asking: phaseCounts.value.asking,
  finished: phaseCounts.value.finished,
  working: phaseCounts.value.working,
  inactive: phaseCounts.value.inactive,
}));

const tiles = computed(() => {
  void tick.value;
  return inFlight.value
    .map((t) => ({ t, phase: phaseOf(t, state.now) }))
    .filter((x) => inFilter(x.phase, filter.value))
    .map(({ t, phase }) => {
      const s = sessionById(t.id);
      const where = s ? [s.project, s.branch && s.branch !== 'HEAD' ? s.branch : ''].filter(Boolean).join(' · ') : 'Sesión nueva';
      return { t, phase, title: tabTitle(t), group: tabGroup(t), where, lines: previewLines(t.id) };
    });
});
const cols = computed(() => {
  const n = tiles.value.length;
  return n <= 3 ? Math.max(n, 1) : n === 4 ? 2 : 3;
});

const summary = computed(() => {
  const c = phaseCounts.value;
  const n = state.tabs.length;
  if (!n) return `Ninguna terminal abierta · ${state.sessions.length} conversaciones en ${projectCount.value} proyectos`;
  const parts = [`${n} ${n === 1 ? 'abierta' : 'abiertas'}`];
  if (c.asking) parts.push(`${c.asking} ${c.asking === 1 ? 'te pregunta' : 'te preguntan'}`);
  if (c.finished) parts.push(`${c.finished} ${c.finished === 1 ? 'terminó' : 'terminaron'}`);
  if (c.working) parts.push(`${c.working} en proceso`);
  if (c.inactive) parts.push(`${c.inactive} ${c.inactive === 1 ? 'inactiva' : 'inactivas'} hace más de 10 min`);
  return parts.join(' · ');
});

const EMPTY: Record<Filter, string> = {
  asking: 'Ninguna te está preguntando nada.',
  all: 'No hay terminales abiertas. Retoma una conversación de abajo o crea una con «Nueva».',
  finished: 'Ninguna terminó en los últimos 10 minutos.',
  working: 'Ninguna está trabajando ahora.',
  inactive: 'Ninguna lleva más de 10 minutos esperando.',
};

const recent = computed(() =>
  [...state.sessions]
    .filter((s) => !findTab(s.id) && !effectiveMeta.value.get(s.id)?.archived)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 6)
    .map((s) => {
      const m = effectiveMeta.value.get(s.id) ?? {};
      return { s, title: displayTitle(s, m), g: groupOf(s, m, state.meta) };
    }),
);
</script>

<template>
  <div class="lobby">
    <header class="home-head lobby-head">
      <div>
        <h1>Lobby</h1>
        <p class="session-meta">{{ summary }}</p>
      </div>
      <button class="btn primary" title="Nueva sesión (Ctrl+Shift+N)" @click="state.newDialog = true">
        <Icon name="plus" /> Nueva sesión
      </button>
    </header>

    <section class="lobby-open" aria-label="Terminales abiertas">
      <div class="lobby-bar">
        <h2 class="block-title">Terminales abiertas</h2>
        <nav class="views inline" aria-label="Filtrar terminales">
          <button
            v-for="f in FILTERS"
            :key="f.id"
            class="view-tab"
            :class="{ on: filter === f.id }"
            :aria-pressed="filter === f.id"
            @click="filter = f.id"
          >
            <span class="view-label">{{ f.label }}<span v-if="f.extra" class="view-extra">{{ f.extra }}</span></span>
            <span class="num view-count">{{ counts[f.id] }}</span>
          </button>
        </nav>
      </div>
      <div v-if="tiles.length" class="tiles" :style="{ '--cols': cols }">
        <div
          v-for="x in tiles"
          :key="x.t.id"
          class="tile"
          :class="[x.phase, { attention: x.t.attention }]"
          :data-id="x.t.id"
          role="button"
          tabindex="0"
          :title="`Abrir ${x.title}`"
          @click="activateTab(x.t.id)"
          @keydown.enter="activateTab(x.t.id)"
        >
          <div class="tile-head">
            <GroupMark v-bind="x.group" />
            <span class="tile-title">{{ x.title }}</span>
          </div>
          <StatusDot :tab="x.t" words class="tile-state" />
          <pre class="tile-screen" data-ui>{{ x.lines.length ? x.lines.join('\n') : 'Sin salida todavía' }}</pre>
          <div class="tile-foot"><span class="tile-where">{{ x.where }}</span><ContextMeter :id="x.t.id" label /></div>
        </div>
      </div>
      <p v-else class="empty-note">{{ EMPTY[filter] }}</p>
    </section>

    <div class="home-grid">
    <section class="home-recent" aria-label="Retomar">
      <h2 class="block-title">Retomar donde lo dejaste</h2>
      <table v-if="recent.length" class="recent-table">
        <thead>
          <tr><th>Conversación</th><th>Proyecto</th><th class="num-col">Mensajes</th><th class="num-col">Actividad</th><th><span class="sr-only">Acción</span></th></tr>
        </thead>
        <tbody>
          <tr v-for="r in recent" :key="r.s.id" @click="openSession(r.s.id)">
            <td class="cell-title"><GroupMark :color="r.g.color" :icon="r.g.icon" :size="13" class="cell-mark" />{{ r.title }}</td>
            <td class="cell-muted">{{ r.s.project }}</td>
            <td class="num num-col">{{ r.s.messageCount }}</td>
            <td class="num num-col cell-muted">{{ agoShort(r.s.mtimeMs, state.now) }}</td>
            <td class="cell-action"><button class="link-btn" @click.stop="openSession(r.s.id)">Retomar</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty-note">Todas tus conversaciones recientes ya están abiertas.</p>
    </section>
    <section class="home-keys" aria-label="Atajos">
      <h2 class="block-title">Atajos</h2>
      <Shortcuts />
    </section>
    </div>
  </div>
</template>
