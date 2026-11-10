<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { PANEL_COLLAPSE_AT, PANEL_DEFAULT, PANEL_MIN, panelMax, setPanelOpen, setPanelWidth, state } from '../store';

let startX = 0;
let startW = 0;

function onDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  e.preventDefault();
  startX = e.clientX;
  // When collapsed, the drag starts from zero: it has to pass the threshold to open the panel.
  startW = state.panelOpen ? state.panelWidth : 0;
  state.resizingPanel = true;
  // Listen on window: the pointer leaves the edge right away and pointer capture does not always apply.
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('blur', onUp);
}

function onMove(e: PointerEvent): void {
  if (!state.resizingPanel) return;
  const w = startW + (e.clientX - startX);
  if (w < PANEL_COLLAPSE_AT) {
    if (state.panelOpen) setPanelOpen(false);
    return;
  }
  if (!state.panelOpen) setPanelOpen(true);
  setPanelWidth(w);
}

function onUp(): void {
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onUp);
  window.removeEventListener('blur', onUp);
  state.resizingPanel = false;
}

onBeforeUnmount(onUp);

function onDouble(): void {
  setPanelOpen(true);
  setPanelWidth(PANEL_DEFAULT);
}

function onKey(e: KeyboardEvent): void {
  if (!state.panelOpen && (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ')) {
    setPanelOpen(true);
    e.preventDefault();
    return;
  }
  const step = e.shiftKey ? 64 : 16;
  if (e.key === 'ArrowLeft') {
    if (state.panelWidth - step < PANEL_MIN) setPanelOpen(false);
    else setPanelWidth(state.panelWidth - step);
  } else if (e.key === 'ArrowRight') setPanelWidth(state.panelWidth + step);
  else if (e.key === 'Home') setPanelWidth(PANEL_MIN);
  else if (e.key === 'End') setPanelWidth(panelMax());
  else if (e.key === 'Enter' || e.key === ' ') setPanelOpen(false);
  else return;
  e.preventDefault();
}
</script>

<template>
  <div
    class="panel-resizer"
    :class="{ dragging: state.resizingPanel, collapsed: !state.panelOpen }"
    :title="state.panelOpen ? 'Arrastra para ajustar el ancho; hasta el borde para colapsar. Doble clic: ancho original.' : 'Arrastra hacia la derecha para abrir la barra lateral (Ctrl+Shift+B)'"
    role="separator"
    aria-orientation="vertical"
    aria-label="Ancho de la barra lateral"
    :aria-valuenow="state.panelWidth"
    :aria-valuemin="PANEL_MIN"
    :aria-valuemax="panelMax()"
    tabindex="0"
    @pointerdown="onDown"
    @dblclick="onDouble"
    @keydown="onKey"
  ></div>
</template>
