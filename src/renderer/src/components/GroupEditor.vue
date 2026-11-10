<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { FOLDER_ICONS, PALETTE } from '@shared/meta';
import { hub, state } from '../store';
import GroupMark from './GroupMark.vue';
import Icon from './Icon.vue';

const props = defineProps<{ label: string; auto: boolean; color: string; icon?: string; project?: string }>();
const form = reactive({ name: props.label, color: props.color, icon: props.icon ?? '' });
const first = ref<HTMLInputElement>();
const isImage = (i: string) => i.startsWith('data:image/');
const customIcon = ref(props.icon && isImage(props.icon) ? props.icon : '');
const pickError = ref('');

async function pickFromFiles(): Promise<void> {
  pickError.value = '';
  const r = await hub.pickIcon();
  if (!r) return;
  if (!r.ok) {
    pickError.value = r.error;
    return;
  }
  customIcon.value = r.icon;
  form.icon = r.icon;
}
onMounted(() => {
  first.value?.focus();
  first.value?.select();
});

const close = () => (state.editingGroup = null);

async function save(): Promise<void> {
  const name = form.name.trim() || props.label;
  const def = { color: form.color, ...(form.icon ? { icon: form.icon } : {}) };
  if (props.auto) {
    state.meta = await hub.setFolder(props.project ?? props.label, { ...def, name });
  } else {
    if (name !== props.label) state.meta = await hub.renameGroup(props.label, name);
    state.meta = await hub.setGroup(name, def);
  }
  close();
}

async function reset(): Promise<void> {
  if (props.auto) state.meta = await hub.setFolder(props.project ?? props.label, null);
  else {
    form.icon = '';
    state.meta = await hub.setGroup(props.label, { color: form.color });
  }
  close();
}
</script>

<template>
  <div class="backdrop" @mousedown.self="close" @keydown.esc="close">
    <form class="modal" @submit.prevent="save">
      <header class="modal-head">
        <h2 class="group-editor-title"><GroupMark :color="form.color" :icon="form.icon" :size="16" /> {{ label }}</h2>
        <button type="button" class="icon-btn" title="Cerrar" aria-label="Cerrar" @click="close"><Icon name="x" /></button>
      </header>
      <p class="modal-sub">{{ auto ? 'Carpeta del proyecto: aplica a todas sus conversaciones sin grupo propio.' : 'Grupo propio: aplica a todas las conversaciones del grupo.' }}</p>

      <label class="field">
        <span>Nombre</span>
        <input ref="first" v-model="form.name" maxlength="60" :placeholder="project ?? label" />
        <small v-if="auto">Es el nombre que ves en la lista; la carpeta <code>{{ project }}</code> no cambia en el disco.</small>
      </label>

      <fieldset class="field">
        <legend>Ícono</legend>
        <div class="icon-grid" role="radiogroup" aria-label="Ícono">
          <button
            type="button"
            class="icon-choice"
            role="radio"
            :aria-checked="!form.icon"
            :class="{ on: !form.icon }"
            title="Predeterminado: carpeta"
            @click="form.icon = ''"
          >
            <GroupMark :color="form.color" :size="16" />
          </button>
          <button
            v-if="customIcon"
            type="button"
            class="icon-choice"
            role="radio"
            :aria-checked="form.icon === customIcon"
            :class="{ on: form.icon === customIcon }"
            title="Imagen propia"
            @click="form.icon = customIcon"
          >
            <GroupMark :color="form.color" :icon="customIcon" :size="18" />
          </button>
          <button
            v-for="i in FOLDER_ICONS.filter((x) => x !== 'folder')"
            :key="i"
            type="button"
            class="icon-choice"
            role="radio"
            :aria-checked="form.icon === i"
            :class="{ on: form.icon === i }"
            :title="i"
            @click="form.icon = i"
          >
            <GroupMark :color="form.color" :icon="i" :size="16" />
          </button>
        </div>
        <div class="pick-row">
          <button type="button" class="btn" @click="pickFromFiles"><Icon name="folder" /> Elegir de mis archivos…</button>
          <small>PNG, JPG, ICO, BMP o SVG; de cualquier otro archivo (un .exe, un acceso directo) se usa su ícono de Windows.</small>
        </div>
        <p v-if="pickError" class="pick-error" role="alert">{{ pickError }}</p>
      </fieldset>

      <fieldset class="field">
        <legend>Color</legend>
        <div class="field-row">
          <div class="swatches inline">
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
          <input v-model="form.color" type="color" class="color-input" aria-label="Otro color" />
        </div>
      </fieldset>

      <footer class="modal-foot">
        <button type="button" class="btn ghost" @click="reset">{{ auto ? 'Restablecer nombre, ícono y color' : 'Quitar ícono' }}</button>
        <span class="spacer"></span>
        <button type="button" class="btn" @click="close">Cancelar</button>
        <button type="submit" class="btn primary">Guardar</button>
      </footer>
    </form>
  </div>
</template>
