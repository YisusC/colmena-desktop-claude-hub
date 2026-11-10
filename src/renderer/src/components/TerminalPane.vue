<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { OpenRequest } from '@shared/types';
import { closeTab, hub, relaunch, setTabStatus, showToast, state, type Tab } from '../store';
import { disposeTerminal, fitTerminal, focusTerminal, getOrCreateTerminal, pasteToTerminal, terminalSize, writeNotice, writeRaw } from '../terminals';

const props = defineProps<{ tab: Tab; active: boolean }>();
const host = ref<HTMLElement>();
let ro: ResizeObserver | null = null;
const dragging = ref(false);

function onDrop(e: DragEvent): void {
  dragging.value = false;
  const dt = e.dataTransfer;
  if (!dt) return;
  const paths = [...dt.files].map((f) => hub.pathForFile(f)).filter(Boolean);
  if (paths.length) {
    pasteToTerminal(props.tab.id, `${paths.map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(' ')} `);
    showToast(paths.length === 1 ? 'Ruta pegada' : `${paths.length} rutas pegadas`);
    return;
  }
  const text = dt.getData('text/plain');
  if (text) pasteToTerminal(props.tab.id, text);
}

async function launch(): Promise<void> {
  const t = props.tab;
  const { cols, rows } = terminalSize(t.id);
  if (t.attach) {
    // After a UI reload: restore the screen, and a resize makes Claude redraw.
    t.attach = false;
    writeRaw(t.id, await hub.replayPty(t.id));
    hub.resizePty(t.id, Math.max(20, cols - 1), rows);
    setTimeout(() => hub.resizePty(t.id, cols, rows), 60);
    return;
  }
  const req: OpenRequest = t.isNew
    ? { kind: 'new', sessionId: t.id, name: t.newName ?? '', cwd: t.newCwd ?? state.defaultCwd, cols, rows }
    : { kind: 'resume', sessionId: t.id, cols, rows };
  const r = await hub.openSession(req);
  if (!r.ok) {
    setTabStatus(t, 'error');
    t.error = r.error;
  }
}

function refit(): void {
  // No refit while the edge is being dragged (Claude would redraw on every pixel); it happens on release.
  if (state.resizingPanel) return;
  requestAnimationFrame(() => fitTerminal(props.tab.id));
}

watch(
  () => state.resizingPanel,
  (resizing) => {
    if (!resizing && props.active) refit();
  },
);

onMounted(async () => {
  // xterm measures the cell on open: without waiting for the font, it measures the fallback and the text comes out spaced.
  await document.fonts.load('14px "Cascadia Code"').catch(() => undefined);
  getOrCreateTerminal(props.tab.id, host.value!);
  ro = new ResizeObserver(refit);
  ro.observe(host.value!);
  requestAnimationFrame(() => {
    fitTerminal(props.tab.id);
    void launch();
    if (props.active) focusTerminal(props.tab.id);
  });
});

watch(
  () => props.tab.launch,
  (n, o) => {
    if (n === o) return;
    writeNotice(props.tab.id, '— reabriendo sesión —');
    void launch();
  },
);

watch(
  () => props.active,
  async (a) => {
    if (!a) return;
    await nextTick();
    requestAnimationFrame(() => {
      fitTerminal(props.tab.id);
      focusTerminal(props.tab.id);
    });
  },
);

onBeforeUnmount(() => {
  ro?.disconnect();
  disposeTerminal(props.tab.id);
});
</script>

<template>
  <div
    class="pane"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.self="dragging = false"
    @drop.prevent="onDrop"
  >
    <div v-if="dragging" class="drop-hint" @dragleave="dragging = false">Suelta para pegar la ruta en el chat</div>
    <div ref="host" class="pane-host" data-ui></div>
    <div v-if="tab.status === 'exited' || tab.status === 'error'" class="pane-overlay">
      <div class="overlay-card">
        <p v-if="tab.status === 'error'">{{ tab.error }}</p>
        <p v-else>La sesión terminó<span v-if="tab.exitCode"> (código {{ tab.exitCode }})</span>. El historial está guardado.</p>
        <div class="overlay-actions">
          <button class="btn primary" @click="relaunch(tab.id)">Reabrir</button>
          <button class="btn" @click="closeTab(tab.id)">Cerrar pestaña</button>
        </div>
      </div>
    </div>
  </div>
</template>
