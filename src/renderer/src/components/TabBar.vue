<script setup lang="ts">
import { ref } from 'vue';
import { activateTab, closeTab, moveTab, phaseCounts, showLobby, state, tabGroup, tabTitle } from '../store';
import GroupMark from './GroupMark.vue';
import Icon from './Icon.vue';
import StatusDot from './StatusDot.vue';

const TAB_DRAG = 'application/x-hub-tab';
const dragId = ref<string | null>(null);
const over = ref<{ id: string; after: boolean } | null>(null);
function onDragStart(e: DragEvent, id: string): void {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(TAB_DRAG, id);
  e.dataTransfer.effectAllowed = 'move';
  dragId.value = id;
}
function onDragOver(e: DragEvent, id: string): void {
  if (!e.dataTransfer?.types.includes(TAB_DRAG)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  over.value = { id, after: e.clientX > r.left + r.width / 2 };
}
function onDrop(e: DragEvent, id: string): void {
  const src = e.dataTransfer?.getData(TAB_DRAG);
  if (src) {
    e.preventDefault();
    moveTab(src, id, over.value?.after ?? false);
  }
  onDragEnd();
}
function onDragEnd(): void {
  dragId.value = null;
  over.value = null;
}
</script>

<template>
  <nav class="tabbar" aria-label="Sesiones abiertas">
    <div class="tabs" role="tablist">
      <div class="tab lobby-tab" role="tab" :aria-selected="state.view === 'lobby'" :class="{ active: state.view === 'lobby' }" title="Lobby (Ctrl+Shift+L)" aria-label="Lobby" @click="showLobby">
        <span class="tab-label"><Icon name="home" class="lobby-icon" /></span>
        <span v-if="phaseCounts.asking" class="state-mark asking" :title="`${phaseCounts.asking} te preguntan`"></span>
        <span v-else-if="phaseCounts.finished" class="state-mark finished" :title="`${phaseCounts.finished} terminaron`"></span>
      </div>
      <div
        v-for="t in state.tabs"
        :key="t.id"
        class="tab"
        role="tab"
        :data-id="t.id"
        :data-status="t.attention ? 'attention' : t.status"
        :aria-selected="state.view === 'session' && t.id === state.activeTabId"
        :class="{
          active: state.view === 'session' && t.id === state.activeTabId,
          dragging: dragId === t.id,
          'drop-before': over?.id === t.id && !over.after && dragId !== t.id,
          'drop-after': over?.id === t.id && over.after && dragId !== t.id,
        }"
        draggable="true"
        @dragstart="onDragStart($event, t.id)"
        @dragover="onDragOver($event, t.id)"
        @dragleave="over?.id === t.id && (over = null)"
        @drop="onDrop($event, t.id)"
        @dragend="onDragEnd"
        :title="tabTitle(t)"
        @click="activateTab(t.id)"
        @mousedown.middle.prevent="closeTab(t.id)"
      >
        <GroupMark v-bind="tabGroup(t)" :size="13" />
        <span class="tab-label"><span class="tab-title">{{ tabTitle(t) }}</span></span>
        <StatusDot :tab="t" />
        <button class="tab-close" title="Cerrar (Ctrl+Shift+W)" aria-label="Cerrar pestaña" @click.stop="closeTab(t.id)"><Icon name="x" /></button>
      </div>
    </div>
    <button class="icon-btn tab-new" title="Nueva sesión (Ctrl+Shift+N)" aria-label="Nueva sesión" @click="state.newDialog = true"><Icon name="plus" /></button>
  </nav>
</template>
