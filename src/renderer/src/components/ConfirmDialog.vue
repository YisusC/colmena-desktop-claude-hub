<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { state } from '../store';

const ok = ref<HTMLButtonElement>();
onMounted(() => ok.value?.focus());
const answer = (v: boolean) => state.confirm?.resolve(v);
</script>

<template>
  <div v-if="state.confirm" class="backdrop" @mousedown.self="answer(false)" @keydown.esc="answer(false)">
    <div class="modal small" role="alertdialog" aria-modal="true">
      <header class="modal-head"><h2>{{ state.confirm.title }}</h2></header>
      <p class="modal-text">{{ state.confirm.message }}</p>
      <footer class="modal-foot">
        <span class="spacer"></span>
        <button class="btn" @click="answer(false)">Cancelar</button>
        <button ref="ok" class="btn primary" @click="answer(true)">{{ state.confirm.okLabel }}</button>
      </footer>
    </div>
  </div>
</template>
