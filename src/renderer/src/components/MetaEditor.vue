<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { autoColor, PALETTE } from '@shared/meta';
import { shortPath } from '../format';
import { hub, knownGroups, metaOf, saveMeta, sessionById, state } from '../store';
import Icon from './Icon.vue';

const props = defineProps<{ id: string }>();
const s = computed(() => sessionById(props.id));
const m = metaOf(props.id);

const colorFor = (g: string) => state.meta.groups[g]?.color ?? (g ? autoColor(g) : PALETTE[0]!);
const form = reactive({
  title: m.title ?? '',
  group: m.group ?? '',
  color: colorFor(m.group ?? ''),
  tags: (m.tags ?? []).join(', '),
  note: m.note ?? '',
  pinned: !!m.pinned,
  archived: !!m.archived,
});
watch(() => form.group, (g) => (form.color = colorFor(g.trim())));

const first = ref<HTMLInputElement>();
onMounted(() => first.value?.focus());

function close(): void {
  state.editingId = null;
}

async function save(): Promise<void> {
  const group = form.group.trim();
  await saveMeta(
    props.id,
    {
      title: form.title,
      group,
      tags: form.tags.split(/[,\s]+/).map((t) => t.replace(/^#/, '')).filter(Boolean),
      note: form.note,
      pinned: form.pinned,
      archived: form.archived,
    },
    group ? form.color : undefined,
  );
  close();
}

function copyResume(): void {
  const cwd = s.value?.cwd;
  hub.clipboardWrite(cwd ? `cd "${cwd}"; claude --resume ${props.id}` : `claude --resume ${props.id}`);
}
</script>

<template>
  <div class="backdrop" @mousedown.self="close" @keydown.esc="close">
    <form class="modal" @submit.prevent="save">
      <header class="modal-head">
        <h2>Organizar sesión</h2>
        <button type="button" class="icon-btn" title="Cerrar" @click="close"><Icon name="x" /></button>
      </header>
      <p v-if="s" class="modal-sub">
        {{ s.title }} · {{ shortPath(s.cwd, state.home) }}
      </p>

      <label class="field">
        <span>Nombre visible</span>
        <input ref="first" v-model="form.title" :placeholder="s?.title" maxlength="120" />
      </label>

      <div class="field-row">
        <label class="field grow">
          <span>Grupo</span>
          <input v-model="form.group" list="groups-list" placeholder="Sin grupo (se agrupa por proyecto)" maxlength="60" />
          <datalist id="groups-list">
            <option v-for="g in knownGroups" :key="g" :value="g" />
          </datalist>
        </label>
        <label v-if="form.group.trim()" class="field color-field">
          <span>Color</span>
          <input v-model="form.color" type="color" />
        </label>
      </div>
      <div v-if="form.group.trim()" class="swatches">
        <button
          v-for="c in PALETTE"
          :key="c"
          type="button"
          class="swatch-btn"
          :class="{ on: c === form.color }"
          :style="{ background: c }"
          :title="c"
          @click="form.color = c"
        ></button>
      </div>

      <label class="field">
        <span>Etiquetas</span>
        <input v-model="form.tags" name="tags" placeholder="urgente, cliente, revisar" />
      </label>

      <label class="field">
        <span>Nota</span>
        <textarea v-model="form.note" rows="3" placeholder="Contexto, pendientes, enlaces…"></textarea>
      </label>

      <div class="field-row checks">
        <label class="check"><input v-model="form.pinned" type="checkbox" /> Fijar arriba</label>
        <label class="check"><input v-model="form.archived" type="checkbox" /> Archivar (ocultar de la lista)</label>
      </div>

      <footer class="modal-foot">
        <button type="button" class="btn ghost" title="Para abrirla en Windows Terminal" @click="copyResume">
          <Icon name="copy" /> Copiar comando
        </button>
        <span class="spacer"></span>
        <button type="button" class="btn" @click="close">Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </footer>
    </form>
  </div>
</template>
