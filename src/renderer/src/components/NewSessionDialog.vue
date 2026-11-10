<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { autoColor, PALETTE } from '@shared/meta';
import { shortPath } from '../format';
import { createSession, hub, knownFolders, knownGroups, state } from '../store';
import Icon from './Icon.vue';

const form = reactive({
  name: '',
  group: '',
  color: PALETTE[0]!,
  cwd: knownFolders.value[0] ?? state.defaultCwd,
});
const isNewGroup = computed(() => !!form.group.trim() && !state.meta.groups[form.group.trim()]);
watch(() => form.group, (g) => (form.color = state.meta.groups[g.trim()]?.color ?? autoColor(g.trim() || 'x')));

const folders = computed(() => {
  const seen = new Set<string>();
  return [form.cwd, ...knownFolders.value, state.defaultCwd].filter((f) => {
    const k = f.toLowerCase();
    if (!f || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
});

const nameInput = ref<HTMLInputElement>();
onMounted(() => nameInput.value?.focus());

async function browse(): Promise<void> {
  const p = await hub.pickFolder();
  if (p) form.cwd = p;
}

function close(): void {
  state.newDialog = false;
}

async function create(): Promise<void> {
  const group = form.group.trim();
  await createSession({ name: form.name.trim(), cwd: form.cwd, group, color: isNewGroup.value ? form.color : undefined });
  close();
}
</script>

<template>
  <div class="backdrop" @mousedown.self="close" @keydown.esc="close">
    <form class="modal" @submit.prevent="create">
      <header class="modal-head">
        <h2>Nueva sesión</h2>
        <button type="button" class="icon-btn" title="Cerrar" @click="close"><Icon name="x" /></button>
      </header>

      <label class="field">
        <span>Nombre</span>
        <input ref="nameInput" v-model="form.name" name="session-name" placeholder="facturacion-reembolsos" maxlength="80" />
        <small>Aparece en la pestaña y sirve para <code>claude --resume nombre</code>.</small>
      </label>

      <div class="field-row">
        <label class="field grow">
          <span>Grupo</span>
          <input v-model="form.group" list="new-groups-list" placeholder="Opcional" maxlength="60" />
          <datalist id="new-groups-list">
            <option v-for="g in knownGroups" :key="g" :value="g" />
          </datalist>
        </label>
        <label v-if="isNewGroup" class="field color-field">
          <span>Color</span>
          <input v-model="form.color" type="color" />
        </label>
      </div>

      <label class="field">
        <span>Carpeta</span>
        <div class="folder-pick">
          <select v-model="form.cwd">
            <option v-for="f in folders" :key="f" :value="f">{{ shortPath(f, state.home) }}</option>
          </select>
          <button type="button" class="btn" @click="browse"><Icon name="folder" /> Elegir…</button>
        </div>
      </label>

      <footer class="modal-foot">
        <span class="spacer"></span>
        <button type="button" class="btn" @click="close">Cancelar</button>
        <button type="submit" class="btn primary">Crear y abrir</button>
      </footer>
    </form>
  </div>
</template>
