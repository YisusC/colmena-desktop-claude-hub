<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import GroupEditor from './components/GroupEditor.vue';
import Icon from './components/Icon.vue';
import Lobby from './components/Lobby.vue';
import MetaEditor from './components/MetaEditor.vue';
import NewSessionDialog from './components/NewSessionDialog.vue';
import PanelResizer from './components/PanelResizer.vue';
import Rail from './components/Rail.vue';
import SessionHeader from './components/SessionHeader.vue';
import Shortcuts from './components/Shortcuts.vue';
import Sidebar from './components/Sidebar.vue';
import TabBar from './components/TabBar.vue';
import TerminalPane from './components/TerminalPane.vue';
import { activateTab, closeTab, cycleTab, hub, setPanelOpen, showLobby, state, toggleHeader } from './store';

// Shortcuts use Ctrl+Shift so they do not steal keys from Claude Code; captured before xterm.
function onKey(e: KeyboardEvent): void {
  if (state.confirm || state.editingId || state.newDialog || state.shortcuts || state.editingGroup) return;
  const k = e.key.toLowerCase();
  let handled = true;
  if (k === 'f11' && !e.ctrlKey && !e.altKey && !e.shiftKey) hub.toggleFullscreen();
  else if (e.ctrlKey && e.shiftKey && k === 'f') {
    setPanelOpen(true);
    state.narrowView = 'list';
    requestAnimationFrame(() => document.getElementById('search')?.focus());
  } else if (e.ctrlKey && e.shiftKey && k === 'n') state.newDialog = true;
  else if (e.ctrlKey && e.shiftKey && k === 'l') showLobby();
  else if (e.ctrlKey && e.shiftKey && k === 'h') toggleHeader();
  else if (e.ctrlKey && e.shiftKey && k === 'b') setPanelOpen(!state.panelOpen);
  else if (e.ctrlKey && e.shiftKey && k === 'w' && state.activeTabId) void closeTab(state.activeTabId);
  else if (e.ctrlKey && e.shiftKey && k === 'e' && state.activeTabId) state.editingId = state.activeTabId;
  else if (e.ctrlKey && (k === 'tab' || k === 'pagedown' || k === 'pageup')) cycleTab(k === 'pageup' || (k === 'tab' && e.shiftKey) ? -1 : 1);
  // No Alt because AltGr = Ctrl+Alt on Spanish keyboards; if not captured, Ctrl+3 arrives as ESC.
  else if (e.ctrlKey && !e.altKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
    const n = Number(e.key);
    const t = n === 9 ? state.tabs.at(-1) : state.tabs[n - 1];
    if (t) activateTab(t.id);
  } else handled = false;
  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}

// Dropping a file outside a terminal must not make the window open it.
const blockDrop = (e: DragEvent) => e.preventDefault();
onMounted(() => {
  window.addEventListener('keydown', onKey, true);
  document.addEventListener('dragover', blockDrop);
  document.addEventListener('drop', blockDrop);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey, true);
  document.removeEventListener('dragover', blockDrop);
  document.removeEventListener('drop', blockDrop);
});
</script>

<template>
  <div
    class="app"
    :class="[{ 'panel-closed': !state.panelOpen, resizing: state.resizingPanel }, `narrow-${state.tabs.length ? state.narrowView : 'list'}`]"
    :style="{ '--panel-w': `${state.panelWidth}px` }"
  >
    <Rail />
    <Sidebar v-show="state.panelOpen" />
    <PanelResizer />
    <main class="main">
      <TabBar v-if="state.tabs.length" />
      <Lobby v-if="state.view === 'lobby' || !state.tabs.length" />
      <SessionHeader v-else-if="state.activeTabId" :id="state.activeTabId" />
      <!-- Terminals stay mounted (hidden) in the lobby so they keep their state. -->
      <div v-show="state.view === 'session' && state.tabs.length" class="panes">
        <TerminalPane
          v-for="t in state.tabs"
          v-show="t.id === state.activeTabId"
          :key="t.id"
          :tab="t"
          :active="state.view === 'session' && t.id === state.activeTabId"
        />
      </div>
    </main>
    <MetaEditor v-if="state.editingId" :id="state.editingId" />
    <NewSessionDialog v-if="state.newDialog" />
    <GroupEditor v-if="state.editingGroup" v-bind="state.editingGroup" />
    <ConfirmDialog v-if="state.confirm" />
    <button v-if="state.toast && state.toastTab" class="toast action" @click="activateTab(state.toastTab); state.toast = ''">
      {{ state.toast }} <span class="toast-go">Ver</span>
    </button>
    <div v-else-if="state.toast" class="toast" role="status" aria-live="polite">{{ state.toast }}</div>
    <div v-if="state.shortcuts" class="backdrop" @mousedown.self="state.shortcuts = false" @keydown.esc="state.shortcuts = false">
      <div class="modal small" role="dialog" aria-modal="true" aria-label="Atajos de teclado">
        <header class="modal-head">
          <h2>Atajos de teclado</h2>
          <button class="icon-btn" title="Cerrar" aria-label="Cerrar" autofocus @click="state.shortcuts = false"><Icon name="x" /></button>
        </header>
        <Shortcuts />
      </div>
    </div>
  </div>
</template>
