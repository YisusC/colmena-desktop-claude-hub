<script setup lang="ts">
import { computed } from 'vue';
import { groupOf, type GroupKey } from '@shared/meta';
import { ref } from 'vue';
import { shortPath } from '../format';
import {
  activateTab, activeTabs, archivedRows, dropOnSection, groups, moveToGroup, SESSION_DRAG, metaOf, pinnedRows, rows, searching, sessionById, sideBadge, state, tabGroup,
  tabTitle, type Tab,
} from '../store';
import ContextMeter from './ContextMeter.vue';
import GroupMark from './GroupMark.vue';
import Icon from './Icon.vue';
import SessionRow from './SessionRow.vue';
import StatusDot from './StatusDot.vue';

const statusText = computed(() => {
  const s = state.status;
  if (s.phase === 'loading') return 'Cargando índice…';
  if (s.phase === 'indexing') return `Indexando ${s.done} de ${s.total} conversaciones…`;
  if (s.phase === 'error') return `El indexador falló: ${s.message ?? ''}`;
  return '';
});

const isActive = computed(() => state.sideList === 'active');
const title = computed(() => (isActive.value ? 'En curso' : 'Historial'));
const count = computed(() => (isActive.value ? activeTabs.value.length : rows.value.length));

function whereOf(t: Tab): string {
  const s = sessionById(t.id);
  if (!s) return shortPath(t.newCwd ?? '', state.home) || 'Sesión nueva';
  const g = groupOf(s, metaOf(t.id), state.meta);
  return [g.auto ? '' : g.label, s.project, s.branch && s.branch !== 'HEAD' ? s.branch : ''].filter(Boolean).join(' · ');
}

function toggle(key: string): void {
  state.collapsed[key] = !state.collapsed[key];
}

function editGroup(g: GroupKey): void {
  state.editingGroup = { label: g.label, auto: g.auto, color: g.color, icon: g.icon, project: g.project };
}

const dropKey = ref<string | null>(null);
const carriesSession = (e: DragEvent) => !!e.dataTransfer?.types.includes(SESSION_DRAG);
function onDragOver(e: DragEvent, key: string): void {
  if (!carriesSession(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  dropKey.value = key;
}
function onDragLeave(e: DragEvent, key: string): void {
  const to = e.relatedTarget as Node | null;
  if (dropKey.value === key && !(to && (e.currentTarget as HTMLElement).contains(to))) dropKey.value = null;
}
function onDrop(e: DragEvent, target: GroupKey | 'pinned' | 'archived'): void {
  const id = e.dataTransfer?.getData(SESSION_DRAG);
  dropKey.value = null;
  if (!id) return;
  e.preventDefault();
  if (target === 'pinned' || target === 'archived') void dropOnSection(id, target);
  else void moveToGroup(id, target);
}
</script>

<template>
  <aside class="panel" :aria-label="title">
    <header class="panel-head">
      <nav class="side-switch" aria-label="Listas">
        <button
          class="side-tab"
          :class="{ on: isActive }"
          :aria-pressed="isActive"
          :title="sideBadge.count ? `En curso: ${sideBadge.finished} terminaron sin ver, ${sideBadge.asking} te preguntan` : 'En curso: terminales abiertas'"
          aria-label="En curso"
          @click="state.sideList = 'active'"
        >
          <Icon name="activity" />
          <span v-if="sideBadge.count" class="badge" :class="sideBadge.kind">{{ sideBadge.count }}</span>
        </button>
        <button class="side-tab" :class="{ on: !isActive }" :aria-pressed="!isActive" title="Historial: todas las conversaciones" aria-label="Historial" @click="state.sideList = 'history'">
          <Icon name="history" />
        </button>
      </nav>
    </header>
    <h2 class="panel-title">{{ title }} <span class="num panel-count">{{ count }}</span></h2>

    <div v-if="state.ready && !state.claudePath" class="notice negative">
      No encontré <code>claude.exe</code>. Instala Claude Code o revisa el PATH y reinicia la app.
    </div>

    <div class="search">
      <Icon name="search" class="search-icon" />
      <input
        id="search"
        v-model="state.query"
        type="search"
        :aria-label="isActive ? 'Buscar en las terminales abiertas' : 'Buscar en títulos y conversaciones'"
        :placeholder="isActive ? 'Buscar en las terminales abiertas' : 'Buscar en títulos y conversaciones'"
        title='Palabras, "frase", -excluir, #etiqueta, g:grupo, p:proyecto'
        spellcheck="false"
        autocomplete="off"
        @keydown.esc="state.query = ''"
      />
    </div>

    <p v-if="statusText && !isActive" class="index-status" :class="{ negative: state.status.phase === 'error' }">{{ statusText }}</p>

    <div class="list">
      <template v-if="isActive">
        <div
          v-for="t in activeTabs"
          :key="t.id"
          class="row"
          :data-id="t.id"
          :class="{ active: state.view === 'session' && t.id === state.activeTabId }"
          role="button"
          tabindex="0"
          @click="activateTab(t.id)"
          @keydown.enter="activateTab(t.id)"
        >
          <div class="row-line">
            <GroupMark v-bind="tabGroup(t)" :size="13" />
            <span class="row-title">{{ tabTitle(t) }}</span>
          </div>
          <div class="row-line sub">
            <span class="row-where">{{ whereOf(t) }}</span>
            <ContextMeter :id="t.id" />
            <StatusDot :tab="t" words />
          </div>
        </div>
        <p v-if="!activeTabs.length" class="empty-note">
          {{ state.tabs.length ? 'Ninguna terminal abierta coincide.' : 'No hay terminales abiertas. Retoma una desde el historial o crea una nueva en el Lobby.' }}
        </p>
      </template>

      <template v-else-if="searching">
        <p class="list-meta"><span class="num">{{ rows.length }}</span> {{ rows.length === 1 ? 'conversación coincide' : 'conversaciones coinciden' }}</p>
        <SessionRow v-for="r in rows" :key="r.s.id" :row="r" show-group />
        <p v-if="!rows.length" class="empty-note">Nada coincide. Quita una palabra o un filtro.</p>
      </template>
      <template v-else>
        <section
          v-if="pinnedRows.length"
          class="group"
          :class="{ 'drop-target': dropKey === 'pinned' }"
          @dragover="onDragOver($event, 'pinned')"
          @dragleave="onDragLeave($event, 'pinned')"
          @drop="onDrop($event, 'pinned')"
        >
          <h3 class="group-head static">
            <Icon name="pin" class="pin-mark" />
            <span class="label">Fijadas</span>
            <span class="num count">{{ pinnedRows.length }}</span>
          </h3>
          <SessionRow v-for="r in pinnedRows" :key="r.s.id" :row="r" show-group />
        </section>
        <section
          v-for="g in groups"
          :key="g.key"
          class="group"
          :class="{ 'drop-target': dropKey === g.key }"
          @dragover="onDragOver($event, g.key)"
          @dragleave="onDragLeave($event, g.key)"
          @drop="onDrop($event, g)"
        >
          <h3 class="group-head" @contextmenu.prevent="editGroup(g)">
            <button class="group-toggle" :aria-expanded="!state.collapsed[g.key]" @click="toggle(g.key)">
              <Icon name="chevron" class="chev" :class="{ open: !state.collapsed[g.key] }" />
              <GroupMark :color="g.color" :icon="g.icon" />
              <span class="label">{{ g.label }}</span>
              <span class="num count">{{ g.rows.length }}</span>
            </button>
            <button class="icon-btn group-edit" :title="`Nombre, ícono y color de ${g.label} (clic derecho)`" :aria-label="`Editar ${g.label}`" @click="editGroup(g)">
              <Icon name="pencil" />
            </button>
          </h3>
          <template v-if="!state.collapsed[g.key]">
            <SessionRow v-for="r in g.rows" :key="r.s.id" :row="r" />
          </template>
        </section>
        <section
          v-if="archivedRows.length"
          class="group"
          :class="{ 'drop-target': dropKey === 'archived' }"
          @dragover="onDragOver($event, 'archived')"
          @dragleave="onDragLeave($event, 'archived')"
          @drop="onDrop($event, 'archived')"
        >
          <h3 class="group-head">
            <button class="group-toggle" :aria-expanded="state.collapsed['archived'] === false" @click="state.collapsed['archived'] = !(state.collapsed['archived'] === false)">
              <Icon name="chevron" class="chev" :class="{ open: state.collapsed['archived'] === false }" />
              <span class="label archived-label">Archivadas</span>
              <span class="num count">{{ archivedRows.length }}</span>
            </button>
          </h3>
          <template v-if="state.collapsed['archived'] === false">
            <SessionRow v-for="r in archivedRows" :key="r.s.id" :row="r" show-group />
          </template>
        </section>
        <p v-if="state.ready && !rows.length && state.status.phase === 'ready'" class="empty-note">Todavía no hay conversaciones guardadas.</p>
      </template>
    </div>
  </aside>
</template>
