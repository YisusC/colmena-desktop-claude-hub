<script setup lang="ts">
import { computed, ref } from 'vue';
import { agoShort } from '../format';
import { findTab, openSession, SESSION_DRAG, state, togglePin, type Row } from '../store';
import ContextMeter from './ContextMeter.vue';
import GroupMark from './GroupMark.vue';
import Icon from './Icon.vue';
import SnippetText from './SnippetText.vue';
import StatusDot from './StatusDot.vue';

const props = defineProps<{ row: Row; showGroup?: boolean }>();

const tab = computed(() => findTab(props.row.s.id));
const active = computed(() => state.activeTabId === props.row.s.id);
const branch = computed(() => {
  const b = props.row.s.branch;
  return b && b !== 'main' && b !== 'master' && b !== 'HEAD' ? b : null;
});
const where = computed(() => {
  const parts: string[] = [];
  if (props.showGroup && !props.row.g.auto) parts.push(props.row.g.label);
  if (props.showGroup || !props.row.g.auto) parts.push(props.row.s.project);
  if (branch.value) parts.push(branch.value);
  return parts.join(' · ');
});
const noteLine = computed(() => props.row.m.note?.split('\n')[0]?.trim() ?? '');

const dragging = ref(false);
function onDragStart(e: DragEvent): void {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(SESSION_DRAG, props.row.s.id);
  e.dataTransfer.effectAllowed = 'move';
  dragging.value = true;
}

function edit(): void {
  state.editingId = props.row.s.id;
}
</script>

<template>
  <div
    class="row"
    :data-id="row.s.id"
    :class="{ active, archived: row.m.archived, dragging }"
    draggable="true"
    @dragstart="onDragStart"
    @dragend="dragging = false"
    role="button"
    tabindex="0"
    :title="row.s.firstPrompt ?? row.title"
    @click="openSession(row.s.id)"
    @keydown.enter="openSession(row.s.id)"
    @contextmenu.prevent="edit"
  >
    <div class="row-line">
      <GroupMark v-if="showGroup" :color="row.g.color" :icon="row.g.icon" :size="13" />
      <span class="row-title">{{ row.title }}</span>
      <StatusDot v-if="tab" :tab="tab" />
      <span class="num row-time">{{ agoShort(row.s.mtimeMs, state.now) }}</span>
    </div>
    <div class="row-line sub">
      <span class="row-where">{{ where || '—' }}</span>
      <ContextMeter :id="row.s.id" />
      <span class="row-count"><span class="num">{{ row.s.messageCount }}</span> msj</span>
    </div>
    <!-- Tags are only for searching (#tag): they are not shown in the row. -->
    <div v-if="noteLine" class="row-tags">
      <span v-if="noteLine" class="note">{{ noteLine }}</span>
    </div>
    <template v-if="row.hit">
      <SnippetText v-for="(sn, i) in row.hit.snippets.slice(0, 2)" :key="i" :snippet="sn" />
    </template>
    <div class="row-actions" @click.stop>
      <button class="icon-btn" :class="{ on: row.m.pinned }" :title="row.m.pinned ? 'Desfijar' : 'Fijar arriba'" :aria-label="row.m.pinned ? 'Desfijar' : 'Fijar arriba'" @click="togglePin(row.s.id)">
        <Icon name="pin" />
      </button>
      <button class="icon-btn" title="Organizar: grupo, color, etiquetas y nota" aria-label="Organizar" @click="edit">
        <Icon name="pencil" />
      </button>
    </div>
  </div>
</template>
