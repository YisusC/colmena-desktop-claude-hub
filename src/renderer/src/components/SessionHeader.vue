<script setup lang="ts">
import { computed } from 'vue';
import { modelLabel, shortPath } from '../format';
import { closeTab, contextOf, findTab, hub, metaOf, sessionById, state, tabGroup, tabTitle, toggleHeader } from '../store';
import ContextMeter from './ContextMeter.vue';
import GroupMark from './GroupMark.vue';
import ContextPanel from './ContextPanel.vue';
import Icon from './Icon.vue';

const props = defineProps<{ id: string }>();
const tab = computed(() => findTab(props.id));
const s = computed(() => sessionById(props.id));
const group = computed(() => (tab.value ? tabGroup(tab.value) : { color: '#6b7280' }));

const path = computed(() => shortPath(s.value?.cwd ?? tab.value?.newCwd ?? '', state.home) || s.value?.project || '');
const modelLine = computed(() => {
  const parts: string[] = [];
  const model = modelLabel(s.value?.model ?? null);
  if (model) parts.push(s.value?.effort ? `${model} con esfuerzo ${s.value.effort}` : model);
  else parts.push(s.value ? 'Modelo sin registrar' : 'Sesión nueva, sin mensajes todavía');
  const m = metaOf(props.id);
  if (m.group) parts.push(m.group);
  if (s.value?.branch && s.value.branch !== 'HEAD') parts.push(s.value.branch);
  return parts.join(' · ');
});

function copyResume(): void {
  const cwd = s.value?.cwd;
  hub.clipboardWrite(cwd ? `cd "${cwd}"; claude --resume ${props.id}` : `claude --resume ${props.id}`);
}
</script>

<template>
  <header v-if="tab" class="session-head" :class="{ collapsed: state.headerCollapsed }">
    <GroupMark v-bind="group" :size="state.headerCollapsed ? 14 : 34" class="session-mark" />
    <div class="session-lines">
      <h1 class="session-title">
        <span class="session-name">{{ tabTitle(tab) }}</span>
        <span v-if="s" class="session-dim">{{ s.messageCount }} mensajes</span>
        <span v-if="state.headerCollapsed && path" class="session-dim">· {{ path }}</span>
      </h1>
      <template v-if="!state.headerCollapsed">
        <p class="session-line">{{ modelLine }}<template v-if="contextOf(id)"> · contexto <ContextMeter :id="id" label class="inline" /></template></p>
        <p class="session-line">{{ path }}</p>
      </template>
    </div>
    <div class="session-actions">
      <button class="icon-btn" :disabled="!s" :title="s ? 'Organizar: grupo, etiquetas y nota (Ctrl+Shift+E)' : 'Disponible tras el primer mensaje'" aria-label="Organizar" @click="state.editingId = id">
        <Icon name="pencil" />
      </button>
      <button class="icon-btn" :disabled="!s" title="Copiar comando para retomarla en Windows Terminal" aria-label="Copiar comando" @click="copyResume">
        <Icon name="copy" />
      </button>
      <button
        class="icon-btn ctx-toggle"
        :class="{ on: state.contextPanel === id }"
        title="Contexto, commits y PRs"
        aria-label="Contexto, commits y PRs"
        :aria-expanded="state.contextPanel === id"
        @click="state.contextPanel = state.contextPanel === id ? null : id"
      >
        <Icon name="more" />
      </button>
      <button
        class="icon-btn"
        :title="state.headerCollapsed ? 'Expandir encabezado (Ctrl+Shift+H)' : 'Minimizar encabezado (Ctrl+Shift+H)'"
        :aria-label="state.headerCollapsed ? 'Expandir encabezado' : 'Minimizar encabezado'"
        :aria-expanded="!state.headerCollapsed"
        @click="toggleHeader"
      >
        <Icon name="chevron" class="head-chev" :class="{ down: state.headerCollapsed }" />
      </button>
      <button class="icon-btn" title="Cerrar (Ctrl+Shift+W)" aria-label="Cerrar sesión" @click="closeTab(id)"><Icon name="x" /></button>
    </div>
    <ContextPanel v-if="state.contextPanel === id" :id="id" />
  </header>
</template>
