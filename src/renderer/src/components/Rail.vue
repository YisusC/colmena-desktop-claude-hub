<script setup lang="ts">
import { nextTick } from 'vue';
import { hub, setPanelOpen, showLobby, sideBadge, state } from '../store';
import Icon from './Icon.vue';

const narrow = () => window.matchMedia('(max-width: 899px)').matches;

function toggleList(): void {
  if (narrow()) state.narrowView = state.narrowView === 'list' && state.tabs.length ? 'session' : 'list';
  else setPanelOpen(!state.panelOpen);
}

async function search(): Promise<void> {
  setPanelOpen(true);
  state.narrowView = 'list';
  await nextTick();
  document.getElementById('search')?.focus();
}
</script>

<template>
  <nav class="rail" aria-label="Colmena">
    <div class="mark" title="Colmena">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path d="M12 2.5l8.25 4.75v9.5L12 21.5l-8.25-4.75v-9.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        <path d="M8 10l2.5 2L8 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M12 14.5h4" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <span class="sr-only">Colmena</span>
    </div>
    <button
      class="rail-btn"
      :class="{ on: state.view === 'lobby' || !state.tabs.length }"
      title="Lobby: todas las terminales (Ctrl+Shift+L)"
      aria-label="Lobby"
      @click="showLobby"
    >
      <Icon name="home" />
    </button>
    <button
      class="rail-btn"
      :class="{ on: state.panelOpen }"
      title="Sesiones (mostrar u ocultar la lista)"
      aria-label="Sesiones"
      :aria-pressed="state.panelOpen"
      @click="toggleList"
    >
      <Icon name="list" />
      <span v-if="sideBadge.count && !state.panelOpen" class="badge" :class="sideBadge.kind">{{ sideBadge.count }}</span>
    </button>
    <button class="rail-btn" title="Buscar (Ctrl+Shift+F)" aria-label="Buscar" @click="search"><Icon name="search" /></button>
    <button class="rail-btn" title="Nueva sesión (Ctrl+Shift+N)" aria-label="Nueva sesión" @click="state.newDialog = true">
      <Icon name="plus" />
    </button>
    <span class="rail-spacer"></span>
    <button
      class="rail-btn"
      :title="state.fullscreen ? 'Salir de pantalla completa (F11)' : 'Pantalla completa (F11)'"
      :aria-label="state.fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'"
      :aria-pressed="state.fullscreen"
      @click="hub.toggleFullscreen()"
    >
      <Icon :name="state.fullscreen ? 'shrink' : 'expand'" />
    </button>
    <button class="rail-btn" title="Atajos de teclado" aria-label="Atajos de teclado" @click="state.shortcuts = true">
      <Icon name="keyboard" />
    </button>
  </nav>
</template>
